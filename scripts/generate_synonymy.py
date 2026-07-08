"""Generate a single daily Synonymy puzzle.

Synonymy is the semantic analogue of Word Ladder: chain a start word to a
target word where each consecutive pair must be "semantic neighbours"
(cosine similarity above the precomputed threshold). We don't recompute
embeddings every day — we read the once-built adjacency list from
`public/words/synonymy-graph.json` and BFS over it.

Pipeline per attempt:
  1. Load the synonym graph.
  2. (Optional) Gemini proposes a thematic (start, end) pair — e.g. opposites
     ("happy", "gloom") or related-but-not-trivial concepts.
  3. BFS over the synonym graph to verify a path exists and the shortest
     length is between MIN_STEPS and MAX_STEPS.
  4. Otherwise fall back to deterministic random selection from the
     answer list, retrying through the seed space until a valid pair is
     found.

Output:
    public/puzzles/synonymy/<lang>/<date>.json
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wordfilter import is_blocked  # noqa: E402  proper-noun/offensive filter
from gemini_retry import generate_json  # noqa: E402  Gemini call w/ backoff

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = 1
WORD_LENGTH = 5
MIN_STEPS = 3
MAX_STEPS = 7
# Synonymy generation is STRUCTURAL-first: we enumerate valid semantic chains
# (correct length + path-diversity) ourselves, then ask Gemini to PICK the most
# interesting one. This guarantees a valid puzzle regardless of the LLM —
# previously Gemini proposed pairs whose words often weren't in our graph, so
# nearly every candidate was rejected. One request/day.
SYNONYMY_CANDIDATE_COUNT = 24
# Path-diversity gates: reject pairs whose start→end optimal subgraph has
# a single chokepoint or only one chain (KNOCK→RANCH 2026-05-08 was the
# motivating failure — one optimal path through SHOOT→RIFLE→KNIFE).
MIN_OPTIMAL_PATHS = 3
MIN_LAYER_WIDTH = 2
GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LANG = "en"
NOVELTY_LOOKBACK_DAYS = 60

GRAPH_PATH = ROOT / "public" / "words" / "synonymy-graph.json"
ANSWER_LIST_PATH = ROOT / "scripts" / "answer_list.txt"


def log(msg: str, *, level: str = "info") -> None:
    prefix = {"info": "·", "warn": "!", "ok": "✓", "err": "✗"}[level]
    print(f"  {prefix} {msg}", file=sys.stderr)


# ---------- Inputs ----------

@dataclass
class Args:
    date: str
    lang: str
    out_dir: Path
    force: bool


def parse_args() -> Args:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--date", default=None)
    p.add_argument("--lang", default=DEFAULT_LANG)
    p.add_argument("--out", default="public/puzzles/synonymy")
    p.add_argument("--force", action="store_true")
    a = p.parse_args()
    date = a.date or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        p.error(f"--date must be YYYY-MM-DD, got {date!r}")
    return Args(date=date, lang=a.lang, out_dir=ROOT / a.out / a.lang, force=a.force)


@dataclass
class Graph:
    words: list[str]
    word_to_idx: dict[str, int]
    neighbours: list[list[int]]
    threshold: float
    model: str


def load_graph() -> Graph:
    if not GRAPH_PATH.exists():
        sys.exit(
            f"Missing {GRAPH_PATH.relative_to(ROOT)}. "
            f"Run the 'Build synonymy graph' workflow first."
        )
    raw = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    words = raw["words"]
    neighbours = raw["neighbours"]

    # Drop proper nouns / offensive words from the graph entirely, so they can
    # never be a start/end word OR an intermediate step in a chain. (The
    # 2026-06-09 puzzle routed a clean sword→tiger pair straight through a
    # vulgar word because filtering only lived in the Gemini prompt.)
    blocked = {i for i, w in enumerate(words) if is_blocked(w)}
    if blocked:
        old_to_new: dict[int, int] = {}
        kept_words: list[str] = []
        for i, w in enumerate(words):
            if i in blocked:
                continue
            old_to_new[i] = len(kept_words)
            kept_words.append(w)
        kept_neighbours = [
            [old_to_new[n] for n in neighbours[i] if n not in blocked]
            for i in range(len(words)) if i not in blocked
        ]
        log(f"content filter removed {len(blocked)} words from graph")
        words, neighbours = kept_words, kept_neighbours

    return Graph(
        words=words,
        word_to_idx={w: i for i, w in enumerate(words)},
        neighbours=neighbours,
        threshold=raw["threshold"],
        model=raw["model"],
    )


def load_answers() -> list[str]:
    return [
        w.strip().lower()
        for w in ANSWER_LIST_PATH.read_text(encoding="utf-8").splitlines()
        if len(w.strip()) == WORD_LENGTH and w.strip().isalpha()
    ]


def load_recent(out_dir: Path) -> list[dict]:
    if not out_dir.exists():
        return []
    files = sorted(
        f for f in out_dir.glob("*.json")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.json", f.name)
    )
    out: list[dict] = []
    for f in files[-NOVELTY_LOOKBACK_DAYS:]:
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception as e:
            log(f"skipping unreadable {f.name}: {e}", level="warn")
    return out


# ---------- BFS ----------

def bfs_reachable(start: str, graph: Graph, max_dist: int) -> dict[str, int]:
    """Single-source BFS: word -> shortest distance from start, up to max_dist."""
    if start not in graph.word_to_idx:
        return {}
    s = graph.word_to_idx[start]
    dist = {s: 0}
    queue: collections.deque[int] = collections.deque([s])
    while queue:
        cur = queue.popleft()
        if dist[cur] >= max_dist:
            continue
        for n in graph.neighbours[cur]:
            if n in dist:
                continue
            dist[n] = dist[cur] + 1
            queue.append(n)
    return {graph.words[i]: d for i, d in dist.items()}


@dataclass
class PathStats:
    length: int
    n_optimal_paths: int
    min_layer_width: int  # minimum number of words at any intermediate BFS layer
    one_path: list[str]


def path_diversity(start: str, end: str, graph: Graph) -> PathStats | None:
    """For the start→end pair, computes the optimal-subgraph statistics:
    shortest distance L, number of distinct optimal paths, and the
    narrowest intermediate BFS layer (chokepoint width). Returns None if
    end is unreachable from start."""
    if start not in graph.word_to_idx or end not in graph.word_to_idx:
        return None
    s, t = graph.word_to_idx[start], graph.word_to_idx[end]
    if s == t:
        return None

    # Forward BFS from start.
    dist_s: dict[int, int] = {s: 0}
    queue: collections.deque[int] = collections.deque([s])
    while queue:
        u = queue.popleft()
        for v in graph.neighbours[u]:
            if v not in dist_s:
                dist_s[v] = dist_s[u] + 1
                queue.append(v)
    if t not in dist_s:
        return None
    L = dist_s[t]

    # Backward BFS from end, pruned at distance L.
    dist_t: dict[int, int] = {t: 0}
    queue = collections.deque([t])
    while queue:
        u = queue.popleft()
        if dist_t[u] >= L:
            continue
        for v in graph.neighbours[u]:
            if v not in dist_t:
                dist_t[v] = dist_t[u] + 1
                queue.append(v)

    # Vertex v lies on an optimal path iff dist_s[v] + dist_t[v] == L.
    on_path = [v for v in dist_s if v in dist_t and dist_s[v] + dist_t[v] == L]

    # DP: count[v] = number of optimal paths from s to v.
    on_path.sort(key=lambda v: dist_s[v])
    count: dict[int, int] = {s: 1}
    for v in on_path:
        if v == s:
            continue
        c = 0
        for u in graph.neighbours[v]:
            if u in count and dist_s.get(u, -1) == dist_s[v] - 1:
                c += count[u]
        count[v] = c
    n_paths = count.get(t, 0)

    # Layer widths: count words on optimal paths at each BFS depth.
    layer_counts: dict[int, int] = {}
    for v in on_path:
        layer_counts[dist_s[v]] = layer_counts.get(dist_s[v], 0) + 1
    if L < 2:
        min_intermediate = layer_counts.get(0, 1)
    else:
        min_intermediate = min(layer_counts.get(d, 0) for d in range(1, L))

    # Reconstruct one optimal path for the puzzle's `optimal_path` field.
    path_idx = [t]
    while path_idx[-1] != s:
        cur = path_idx[-1]
        for u in graph.neighbours[cur]:
            if u in count and dist_s.get(u, -1) == dist_s[cur] - 1:
                path_idx.append(u)
                break
        else:
            return None  # malformed — give up
    path_idx.reverse()
    one_path = [graph.words[i] for i in path_idx]

    return PathStats(L, n_paths, min_intermediate, one_path)


# ---------- Gemini path (selector, not generator) ----------

GEMINI_SELECT_PROMPT = """You are choosing today's Synonymy puzzle. Players chain the START word to the END word via "synonym steps" — each successive word related in meaning to the previous. Below are {n} VALID candidate pairs (all have a good semantic chain of {min}-{max} steps). Pick the ONE with the most interesting journey — opposites, category-spanning concepts, or a surprising connection — and give it a short theme label.

Candidates (index: start → end, steps):
{candidate_list}

Return STRICT JSON, no prose, no markdown:
{{"choice": <index number from the list above>, "theme": "<2-4 word label for the pair>"}}
"""


def select_with_gemini(candidates: list[tuple[str, str, PathStats]]) -> tuple[int, str | None] | None:
    """Ask Gemini to choose the most interesting pair from pre-validated
    candidates. Returns (index, theme) or None if the LLM is unavailable or its
    answer is unusable. Any returned index is guaranteed valid."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log("GEMINI_API_KEY not set; using structural pick", level="warn")
        return None
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
    except ImportError:
        log("google-genai not installed; using structural pick", level="warn")
        return None

    listing = "\n".join(
        f"{i}: {s} → {e} ({st.length} steps)"
        for i, (s, e, st) in enumerate(candidates)
    )
    prompt = GEMINI_SELECT_PROMPT.format(
        n=len(candidates), min=MIN_STEPS, max=MAX_STEPS, candidate_list=listing
    )
    client = genai.Client(api_key=api_key)
    result = generate_json(client, types, model=GEMINI_MODEL, prompt=prompt,
                           temperature=1.0, log=log)
    if not isinstance(result, dict):
        return None
    choice = result.get("choice")
    if not isinstance(choice, int) or not (0 <= choice < len(candidates)):
        log(f"Gemini returned invalid choice {choice!r}; using structural pick", level="warn")
        return None
    theme = result.get("theme")
    theme = theme.strip() if isinstance(theme, str) and theme.strip() else None
    return choice, theme


def structural_candidates(
    date: str,
    answers: list[str],
    graph: Graph,
    recent_pairs: set[tuple[str, str]],
    want: int = SYNONYMY_CANDIDATE_COUNT,
) -> list[tuple[str, str, PathStats]]:
    """Enumerate up to `want` distinct valid Synonymy pairs (start, end, stats)
    by walking the date-seeded answer space and BFS-ing the semantic graph.
    Every pair meets the length AND path-diversity gates, so any of them is a
    valid puzzle. Deterministic — candidates[0] is a stable fallback pick when
    the LLM is unavailable."""
    pool = [w for w in answers if w in graph.word_to_idx]
    if not pool:
        sys.exit("no answer-list words in synonym graph — graph mismatch?")
    pool_set = set(pool)
    seed = int(hashlib.sha256(date.encode()).hexdigest(), 16)
    cn = len(pool)
    out: list[tuple[str, str, PathStats]] = []
    seen: set[tuple[str, str]] = set()
    for offset in range(cn):
        if len(out) >= want:
            break
        start = pool[(seed + offset) % cn]
        dists = bfs_reachable(start, graph, MAX_STEPS)
        valid_ends = [
            w for w, d in dists.items()
            if MIN_STEPS <= d <= MAX_STEPS and w in pool_set
            and (start, w) not in recent_pairs and (w, start) not in recent_pairs
        ]
        for k in range(len(valid_ends)):
            end = valid_ends[(seed * 31 + offset + k) % len(valid_ends)]
            key = (min(start, end), max(start, end))
            if key in seen:
                continue
            stats = path_diversity(start, end, graph)
            if stats is None or stats.min_layer_width < MIN_LAYER_WIDTH \
                    or stats.n_optimal_paths < MIN_OPTIMAL_PATHS:
                continue
            seen.add(key)
            out.append((start, end, stats))
            break
    return out


# ---------- Outputs ----------

def write_puzzle(args: Args, payload: dict) -> Path:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    full = {
        "date": args.date,
        "game": "synonymy",
        "lang": args.lang,
        "schema_version": SCHEMA_VERSION,
        **payload,
    }
    out_path = args.out_dir / f"{args.date}.json"
    out_path.write_text(json.dumps(full, indent=2) + "\n", encoding="utf-8")
    return out_path


def update_manifest(out_dir: Path) -> Path:
    files = sorted(out_dir.glob("*.json"))
    dates = sorted(
        f.stem
        for f in files
        if f.name != "index.json" and re.fullmatch(r"\d{4}-\d{2}-\d{2}", f.stem)
    )
    manifest = out_dir / "index.json"
    manifest.write_text(
        json.dumps({"dates": dates, "schema_version": SCHEMA_VERSION}, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> int:
    args = parse_args()
    out_path = args.out_dir / f"{args.date}.json"
    if out_path.exists() and not args.force:
        log(f"{out_path.relative_to(ROOT)} already exists; use --force to overwrite")
        update_manifest(args.out_dir)
        return 0

    log(f"generating synonymy for {args.date} ({args.lang})")
    graph = load_graph()
    log(f"loaded graph: {len(graph.words)} words, threshold {graph.threshold}, model {graph.model}")
    answers = load_answers()
    recent = load_recent(args.out_dir)
    recent_pairs: set[tuple[str, str]] = set()
    for r in recent:
        s, e = r.get("start"), r.get("end")
        if isinstance(s, str) and isinstance(e, str):
            recent_pairs.add((s, e))
    log(f"loaded {len(recent_pairs)} recent pairs for dedup")

    # Structural-first: build valid semantic pairs ourselves, then let Gemini
    # pick the most interesting. Any pick is valid, so the LLM only improves the
    # puzzle, never breaks it.
    candidates = structural_candidates(args.date, answers, graph, recent_pairs)
    if not candidates:
        sys.exit("no valid semantic pairs found — graph mismatch?")
    log(f"built {len(candidates)} valid synonymy candidates")

    theme: str | None = None
    generator = "fallback"
    pick = select_with_gemini(candidates)
    if pick is not None:
        idx, theme = pick
        start, end, stats = candidates[idx]
        generator = "gemini-2.5-flash-lite"
        log(f"Gemini chose {start} → {end} (theme: {theme})", level="ok")
    else:
        start, end, stats = candidates[0]
        log(f"structural pick: {start} → {end}")

    payload = {
        "start": start,
        "end": end,
        "optimal_steps": stats.length,
        "optimal_path": stats.one_path,
        "n_optimal_paths": stats.n_optimal_paths,
        "min_layer_width": stats.min_layer_width,
        "theme": theme,
        "threshold": graph.threshold,
        "generated_by": generator,
    }
    out = write_puzzle(args, payload)
    update_manifest(args.out_dir)
    log(
        f"wrote {out.relative_to(ROOT)} → {start} → {end} in "
        f"{stats.length} optimal steps ({stats.n_optimal_paths} paths)",
        level="ok",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
