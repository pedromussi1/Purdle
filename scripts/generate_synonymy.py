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

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = 1
WORD_LENGTH = 5
MIN_STEPS = 3
MAX_STEPS = 7
GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LANG = "en"
NOVELTY_LOOKBACK_DAYS = 30

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
    return Graph(
        words=words,
        word_to_idx={w: i for i, w in enumerate(words)},
        neighbours=raw["neighbours"],
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

def bfs_shortest_path(start: str, end: str, graph: Graph) -> list[str] | None:
    """Returns the shortest path of words from start to end, or None if
    unreachable in the synonym graph."""
    if start not in graph.word_to_idx or end not in graph.word_to_idx:
        return None
    s, t = graph.word_to_idx[start], graph.word_to_idx[end]
    if s == t:
        return [start]
    visited = {s}
    parents: dict[int, int | None] = {s: None}
    queue: collections.deque[int] = collections.deque([s])
    while queue:
        cur = queue.popleft()
        for n in graph.neighbours[cur]:
            if n in visited:
                continue
            visited.add(n)
            parents[n] = cur
            if n == t:
                path_idx: list[int] = [n]
                while parents[path_idx[-1]] is not None:
                    path_idx.append(parents[path_idx[-1]])  # type: ignore[arg-type]
                return [graph.words[i] for i in reversed(path_idx)]
            queue.append(n)
    return None


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


# ---------- Gemini ----------

GEMINI_PROMPT = """You pick the start and end of a Synonymy puzzle: two five-letter common English words connected through semantic similarity. Players will need to chain from start to end via "synonym steps" — each successive word must be related to the previous one in meaning.

Constraints:
- Both words MUST be exactly 5 lowercase letters.
- Both MUST be common everyday English (Zipf >= 3.5), no proper nouns, no offensive content.
- Pick pairs that have an interesting semantic journey between them — opposites ("happy"/"gloom"), category-spanning concepts ("dance"/"chair"), or thematic transformations. Avoid trivial near-synonym pairs.
- Avoid pairs you've recently suggested: {recent_pairs}
{extra_feedback}

Return STRICT JSON, no prose, no markdown:
{{
  "start": "<5 lowercase letters>",
  "end": "<5 lowercase letters>",
  "rationale": "<one short sentence on the semantic journey between them>"
}}
"""


def call_gemini(*, recent_pairs: list[tuple[str, str]], extra_feedback: str = "") -> dict | None:
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
    prompt = GEMINI_PROMPT.format(
        recent_pairs=pairs_str,
        extra_feedback=("\n- " + extra_feedback) if extra_feedback else "",
    )
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=1.0,
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        log(f"Gemini call failed: {e}", level="warn")
        return None


def validate_pair(
    start: str,
    end: str,
    graph: Graph,
    *,
    recent_pairs: set[tuple[str, str]],
) -> tuple[str | None, list[str] | None]:
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
    path = bfs_shortest_path(s, e, graph)
    if path is None:
        return f"no semantic chain connects {s!r} and {e!r}", None
    steps = len(path) - 1
    if steps < MIN_STEPS:
        return f"too easy: only {steps} steps (min {MIN_STEPS})", None
    if steps > MAX_STEPS:
        return f"too hard: needs {steps} steps (max {MAX_STEPS})", None
    return None, path


def attempt_gemini(graph: Graph, recent_pairs: set[tuple[str, str]]) -> tuple[str, str, list[str]] | None:
    feedback = ""
    pairs_for_prompt: list[tuple[str, str]] = list(recent_pairs)
    for attempt in range(5):
        result = call_gemini(recent_pairs=pairs_for_prompt, extra_feedback=feedback)
        if result is None:
            return None
        start = (result.get("start") or "").lower().strip()
        end = (result.get("end") or "").lower().strip()
        rejection, path = validate_pair(start, end, graph, recent_pairs=recent_pairs)
        if rejection is None and path is not None:
            log(f"attempt {attempt + 1}: accepted ({start} → {end}, {len(path) - 1} steps)", level="ok")
            return start, end, path
        log(f"attempt {attempt + 1}: rejected — {rejection}", level="warn")
        feedback = (
            f"Your previous suggestion ({start!r}/{end!r}) was rejected: {rejection}. "
            "Pick a different pair."
        )
    return None


def fallback_pair(date: str, answers: list[str], graph: Graph,
                  recent_pairs: set[tuple[str, str]]) -> tuple[str, list[str]]:
    """Deterministic pair selection by hashing the date. Walks the seed
    space until BFS produces a valid (3-7 step) path."""
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
        j = (seed * 31 + offset) % len(valid_ends)
        end = valid_ends[j]
        path = bfs_shortest_path(start, end, graph)
        if path is not None:
            log(f"fallback pair: {start} → {end} ({len(path) - 1} steps)")
            return f"{start},{end}", path
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

    selected: tuple[str, str, list[str]] | None = None
    if os.environ.get("GEMINI_API_KEY"):
        selected = attempt_gemini(graph, recent_pairs)

    generator = "gemini-2.5-flash-lite"
    if selected is None:
        log("using deterministic fallback")
        _, path = fallback_pair(args.date, answers, graph, recent_pairs)
        start, end = path[0], path[-1]
        generator = "fallback"
    else:
        start, end, path = selected

    payload = {
        "start": start,
        "end": end,
        "optimal_steps": len(path) - 1,
        "optimal_path": path,
        "threshold": graph.threshold,
        "generated_by": generator,
    }
    out = write_puzzle(args, payload)
    update_manifest(args.out_dir)
    log(
        f"wrote {out.relative_to(ROOT)} → {start} → {end} in {payload['optimal_steps']} optimal steps",
        level="ok",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
