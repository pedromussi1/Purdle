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
import random
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
GEMINI_MAX_ATTEMPTS = 8
GEMINI_VOCAB_SAMPLE = 50
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


# ---------- Gemini ----------

GEMINI_PROMPT = """You pick the start and end of a Synonymy puzzle: two five-letter common English words connected through semantic similarity. Players chain from start to end via "synonym steps" — each successive word must be related to the previous one in meaning.

CRITICAL CONSTRAINTS — your suggestion will be REJECTED if any are violated:
- Both words MUST be EXACTLY 5 letters. Count them. "happy"=5✓, "table"=5✓, "begin"=5✓, "finish"=6✗, "sleep"=5✓, "go"=2✗.
- Both words MUST be in our valid vocabulary. Here are 50 words sampled from it to show you the level: {sample_words}. Pick words at this level of commonness or simpler. Words like "gloom" and "shaky" are NOT in our vocabulary even though they feel common — stay closer to the sample list.
- No proper nouns, no offensive or politically charged content.
- Pick pairs with an interesting semantic journey: opposites, category-spanning concepts, or thematic transformations. Avoid trivial near-synonyms.

Avoid these recently used pairs: {recent_pairs}
{rejection_history}

Return STRICT JSON, no prose, no markdown:
{{
  "start": "<EXACTLY 5 lowercase letters>",
  "end": "<EXACTLY 5 lowercase letters>",
  "rationale": "<one short sentence on the semantic journey>"
}}
"""


def call_gemini(
    *,
    recent_pairs: list[tuple[str, str]],
    sample_words: list[str],
    rejection_history: list[str],
) -> dict | None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log("GEMINI_API_KEY not set; skipping LLM call", level="warn")
        return None
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
    except ImportError:
        log("google-genai not installed; skipping LLM call", level="warn")
        return None

    client = genai.Client(api_key=api_key)
    pairs_str = ", ".join(f"({a},{b})" for a, b in recent_pairs[-15:]) or "(none)"
    sample_str = ", ".join(sample_words)
    if rejection_history:
        rejection_block = (
            "Your previous attempts in THIS session were ALL rejected. Pick a "
            "DIFFERENT pair, not a variation of any of these:\n  "
            + "\n  ".join(rejection_history)
        )
    else:
        rejection_block = ""
    prompt = GEMINI_PROMPT.format(
        sample_words=sample_str,
        recent_pairs=pairs_str,
        rejection_history=rejection_block,
    )
    return generate_json(client, types, model=GEMINI_MODEL, prompt=prompt,
                         temperature=1.0, log=log)


def validate_pair(
    start: str,
    end: str,
    graph: Graph,
    *,
    recent_pairs: set[tuple[str, str]],
) -> tuple[str | None, PathStats | None]:
    s = start.lower().strip()
    e = end.lower().strip()
    if not (re.fullmatch(r"[a-z]{5}", s) and re.fullmatch(r"[a-z]{5}", e)):
        return f"start/end must be 5 lowercase letters; got {start!r}/{end!r}", None
    if s == e:
        return "start and end are the same", None
    if s not in graph.word_to_idx:
        return f"start {s!r} not in synonym graph", None
    if e not in graph.word_to_idx:
        return f"end {e!r} not in synonym graph", None
    if (s, e) in recent_pairs or (e, s) in recent_pairs:
        return f"({s}, {e}) appeared recently", None
    stats = path_diversity(s, e, graph)
    if stats is None:
        return f"no semantic chain connects {s!r} and {e!r}", None
    if stats.length < MIN_STEPS:
        return f"too easy: only {stats.length} steps (min {MIN_STEPS})", None
    if stats.length > MAX_STEPS:
        return f"too hard: needs {stats.length} steps (max {MAX_STEPS})", None
    if stats.min_layer_width < MIN_LAYER_WIDTH:
        return (
            f"corridor: narrowest intermediate layer has "
            f"{stats.min_layer_width} word(s) (min {MIN_LAYER_WIDTH})",
            None,
        )
    if stats.n_optimal_paths < MIN_OPTIMAL_PATHS:
        return (
            f"too narrow: only {stats.n_optimal_paths} optimal path(s) "
            f"(min {MIN_OPTIMAL_PATHS})",
            None,
        )
    return None, stats


def attempt_gemini(graph: Graph, recent_pairs: set[tuple[str, str]]) -> tuple[str, str, PathStats] | None:
    pairs_for_prompt: list[tuple[str, str]] = list(recent_pairs)
    sample_words = random.sample(graph.words, min(GEMINI_VOCAB_SAMPLE, len(graph.words)))
    rejection_history: list[str] = []
    for attempt in range(GEMINI_MAX_ATTEMPTS):
        result = call_gemini(
            recent_pairs=pairs_for_prompt,
            sample_words=sample_words,
            rejection_history=rejection_history,
        )
        if result is None:
            return None
        start = (result.get("start") or "").lower().strip()
        end = (result.get("end") or "").lower().strip()
        rejection, stats = validate_pair(start, end, graph, recent_pairs=recent_pairs)
        if rejection is None and stats is not None:
            log(
                f"attempt {attempt + 1}: accepted ({start} → {end}, "
                f"{stats.length} steps, {stats.n_optimal_paths} paths, "
                f"min layer {stats.min_layer_width})",
                level="ok",
            )
            return start, end, stats
        log(f"attempt {attempt + 1}: rejected — {rejection}", level="warn")
        rejection_history.append(f"({start!r}, {end!r}) → {rejection}")
    return None


def fallback_pair(date: str, answers: list[str], graph: Graph,
                  recent_pairs: set[tuple[str, str]]) -> tuple[str, str, PathStats]:
    """Deterministic pair selection by hashing the date. Walks the seed
    space until path-diversity validation accepts a pair."""
    candidates = [w for w in answers if w in graph.word_to_idx]
    if not candidates:
        sys.exit("no answer-list words in synonym graph — graph mismatch?")
    seed = int(hashlib.sha256(date.encode()).hexdigest(), 16)
    cn = len(candidates)
    for offset in range(cn * cn):
        i = (seed + offset) % cn
        start = candidates[i]
        dists = bfs_reachable(start, graph, MAX_STEPS)
        valid_ends = [
            w for w, d in dists.items()
            if MIN_STEPS <= d <= MAX_STEPS and w in candidates
            and (start, w) not in recent_pairs and (w, start) not in recent_pairs
        ]
        if not valid_ends:
            continue
        en = len(valid_ends)
        for k in range(en):
            j = (seed * 31 + offset + k) % en
            end = valid_ends[j]
            stats = path_diversity(start, end, graph)
            if stats is None:
                continue
            if stats.min_layer_width < MIN_LAYER_WIDTH:
                continue
            if stats.n_optimal_paths < MIN_OPTIMAL_PATHS:
                continue
            log(
                f"fallback pair: {start} → {end} ({stats.length} steps, "
                f"{stats.n_optimal_paths} paths, min layer {stats.min_layer_width})"
            )
            return start, end, stats
    sys.exit("fallback exhausted — no valid pair found")


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

    selected: tuple[str, str, PathStats] | None = None
    if os.environ.get("GEMINI_API_KEY"):
        selected = attempt_gemini(graph, recent_pairs)

    generator = "gemini-2.5-flash-lite"
    if selected is None:
        log("using deterministic fallback")
        start, end, stats = fallback_pair(args.date, answers, graph, recent_pairs)
        generator = "fallback"
    else:
        start, end, stats = selected

    payload = {
        "start": start,
        "end": end,
        "optimal_steps": stats.length,
        "optimal_path": stats.one_path,
        "n_optimal_paths": stats.n_optimal_paths,
        "min_layer_width": stats.min_layer_width,
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
