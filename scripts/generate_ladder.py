"""Generate a single daily Word Ladder puzzle.

A Word Ladder is two 5-letter words (start, end) connected by a chain of
intermediate words where each consecutive pair differs by exactly one letter
and every word is in the valid-guess dictionary. The classic Lewis Carroll
puzzle. Players supply the chain themselves; the pipeline only needs to
guarantee that a path exists.

Pipeline per attempt:
  1. (Optional) Gemini proposes a thematic (start, end) pair (e.g. "warmth →
     winter"). Falls back to deterministic random selection from the answer
     list if Gemini isn't configured.
  2. Build a graph: every dict word → its single-letter neighbours in the
     dict. ~14k words × 5 positions × 26 letters = ~1.8M membership tests,
     runs in well under a second in Python.
  3. BFS from `start` through the graph. Verify `end` is reachable AND that
     the shortest path length is between MIN_STEPS and MAX_STEPS (sweet
     spot for daily-puzzle difficulty).
  4. (Optional) Compute the embedding cosine similarity between start and
     end as a difficulty signal — lower similarity ≈ more conceptually
     distant pair ≈ harder puzzle for human intuition.

Output:
    public/puzzles/ladder/<lang>/<date>.json
    {
      "date": "...",
      "game": "ladder",
      "start": "warm",
      "end": "cold",
      "optimal_steps": 5,
      "optimal_path": ["warm", ..., "cold"],
      "difficulty_similarity": 0.31,   // optional
      "generated_by": "gemini-2.5-flash-lite" | "fallback"
    }
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
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gemini_retry import generate_json  # noqa: E402  Gemini call w/ backoff
from wordfilter import is_blocked  # noqa: E402  proper-noun/offensive filter

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = 1
WORD_LENGTH = 5
MIN_STEPS = 4   # too easy below this (3-step ladders are near-trivial slides)
MAX_STEPS = 7   # too tedious above this
GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LANG = "en"
NOVELTY_LOOKBACK_DAYS = 60
# Ladder generation is STRUCTURAL-first: we enumerate valid ladders (real 4-7
# step chains through the common-words graph) ourselves, then ask Gemini to
# merely PICK the most enjoyable one. This guarantees a valid puzzle regardless
# of the LLM (previously Gemini proposed thematic pairs that almost never had a
# valid letter-ladder path, so Ladder was ~100% fallback). One request/day.
LADDER_CANDIDATE_COUNT = 24

ANSWER_LIST_PATH = ROOT / "scripts" / "answer_list.txt"
DICT_PATH = ROOT / "public" / "words" / "valid-guesses.txt"


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
    p.add_argument("--date", default=None, help="YYYY-MM-DD (default: today UTC)")
    p.add_argument("--lang", default=DEFAULT_LANG)
    p.add_argument("--out", default="public/puzzles/ladder")
    p.add_argument("--force", action="store_true")
    a = p.parse_args()
    date = a.date or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        p.error(f"--date must be YYYY-MM-DD, got {date!r}")
    return Args(date=date, lang=a.lang, out_dir=ROOT / a.out / a.lang, force=a.force)


def load_words(path: Path) -> list[str]:
    if not path.exists():
        sys.exit(f"Missing {path}. Run scripts/download_word_lists.ps1 first.")
    return [
        w.strip().lower()
        for w in path.read_text(encoding="utf-8").splitlines()
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


# ---------- BFS over the dictionary ----------

# Caches across retries within a process — building each graph is the
# expensive step (~0.5-1s) and it's identical for every attempt today.
_graph_cache: dict[str, list[str]] | None = None
_common_set_cache: set[str] | None = None


def build_graph(dictionary: set[str]) -> dict[str, list[str]]:
    """Adjacency list — for every dict word, the words differing by exactly
    one letter that are also in the dict."""
    global _graph_cache
    if _graph_cache is not None:
        return _graph_cache
    log(f"building neighbour graph over {len(dictionary)} words…")
    graph: dict[str, list[str]] = {}
    alphabet = "abcdefghijklmnopqrstuvwxyz"
    for w in dictionary:
        neighbours = []
        for i in range(WORD_LENGTH):
            for c in alphabet:
                if c == w[i]:
                    continue
                cand = w[:i] + c + w[i + 1:]
                if cand in dictionary:
                    neighbours.append(cand)
        graph[w] = neighbours
    _graph_cache = graph
    return graph


def common_words(dictionary: set[str], lang: str, threshold: float = 3.5) -> set[str]:
    """Subset of `dictionary` keeping only Zipf-frequent words. The "optimal
    path" calculation uses this restricted set so the BFS shortest path can
    only travel through words humans actually recognise — no obscure bridges
    like CARSE / CORSE / WOOSE.

    Falls back to the full dictionary if `wordfreq` isn't installed."""
    global _common_set_cache
    if _common_set_cache is not None:
        return _common_set_cache
    try:
        from wordfreq import zipf_frequency  # type: ignore
    except ImportError:
        log("wordfreq not installed; using full dictionary for BFS", level="warn")
        _common_set_cache = dictionary
        return _common_set_cache
    common = {
        w for w in dictionary
        if zipf_frequency(w, lang) >= threshold and not is_blocked(w)
    }
    log(f"filtered to {len(common)} common words (Zipf ≥ {threshold})")
    _common_set_cache = common
    return common


def bfs_shortest_path(start: str, end: str, graph: dict[str, list[str]]) -> list[str] | None:
    """Single-source single-target BFS. Returns None if unreachable."""
    if start == end:
        return [start]
    if start not in graph or end not in graph:
        return None
    visited = {start}
    parents: dict[str, str | None] = {start: None}
    queue: collections.deque[str] = collections.deque([start])
    while queue:
        cur = queue.popleft()
        for n in graph[cur]:
            if n in visited:
                continue
            visited.add(n)
            parents[n] = cur
            if n == end:
                # Reconstruct path from end back to start.
                path = [n]
                while parents[path[-1]] is not None:
                    path.append(parents[path[-1]])  # type: ignore[index]
                return path[::-1]
            queue.append(n)
    return None


def bfs_distances(start: str, graph: dict[str, list[str]], max_dist: int) -> dict[str, int]:
    """Single-source BFS — returns {word: distance_from_start} for words
    within `max_dist` hops."""
    if start not in graph:
        return {}
    dist = {start: 0}
    queue: collections.deque[str] = collections.deque([start])
    while queue:
        cur = queue.popleft()
        if dist[cur] >= max_dist:
            continue
        for n in graph[cur]:
            if n in dist:
                continue
            dist[n] = dist[cur] + 1
            queue.append(n)
    return dist


# ---------- Embedding-based difficulty (optional) ----------

_model_cache: Any = None


def _get_embedder() -> Any | None:
    global _model_cache
    if _model_cache is not None:
        return _model_cache
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        _model_cache = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        return _model_cache
    except Exception as e:
        # Catches ImportError AND any network/TLS error from HuggingFace
        # download. The difficulty score is purely informational, so degrade
        # silently rather than failing the whole puzzle write.
        log(f"embedding model unavailable, skipping difficulty score: {e}", level="warn")
        return None


def difficulty_similarity(start: str, end: str) -> float | None:
    model = _get_embedder()
    if model is None:
        return None
    try:
        from sentence_transformers import util  # type: ignore
        emb = model.encode([start, end], normalize_embeddings=True, convert_to_tensor=True)
        return float(util.cos_sim(emb[0], emb[1]).item())
    except Exception as e:
        log(f"difficulty_similarity failed: {e}", level="warn")
        return None


# ---------- Gemini path (selector, not generator) ----------

GEMINI_SELECT_PROMPT = """You are choosing today's Word Ladder puzzle. A ladder transforms the START word into the END word one letter at a time, each step a real word. Below are {n} VALID candidate ladders (all solvable). Pick the ONE with the most enjoyable "journey" — opposites, a satisfying transformation, or an amusing/surprising start-and-end relationship — and give it a short theme label.

Candidates (index: start → end, {min}-{max} steps):
{candidate_list}

Return STRICT JSON, no prose, no markdown:
{{"choice": <index number from the list above>, "theme": "<2-4 word label for the pair>"}}
"""


def select_with_gemini(candidates: list[tuple[str, str, list[str]]]) -> tuple[int, str | None] | None:
    """Ask Gemini to choose the most enjoyable ladder from pre-validated
    candidates. Returns (index, theme) or None if the LLM is unavailable or
    its answer is unusable. Any returned index is guaranteed valid because the
    candidates were structurally validated before the call."""
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
        f"{i}: {s} → {e} ({len(path) - 1} steps)"
        for i, (s, e, path) in enumerate(candidates)
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


# ---------- Structural candidate generation ----------

def structural_candidates(
    date: str,
    answers: list[str],
    graph: dict[str, list[str]],
    recent_pairs: set[tuple[str, str]],
    want: int = LADDER_CANDIDATE_COUNT,
) -> list[tuple[str, str, list[str]]]:
    """Enumerate up to `want` distinct, valid ladders (start, end, path) by
    walking the date-seeded answer space and BFS-ing through the common-words
    graph. Every returned ladder is guaranteed solvable in MIN..MAX steps and
    free of recent/blocked words. Deterministic, so candidates[0] is a stable
    fallback pick when the LLM is unavailable. The answer list yields thousands
    of valid pairs, so `want` is easily met."""
    seed = int(hashlib.sha256(date.encode()).hexdigest(), 16)
    pool = [w for w in answers if w in graph and not is_blocked(w)]
    if not pool:
        sys.exit("no answer-list words in graph — dictionary mismatch?")
    pool_set = set(pool)
    cn = len(pool)
    out: list[tuple[str, str, list[str]]] = []
    seen: set[tuple[str, str]] = set()
    for offset in range(cn):
        if len(out) >= want:
            break
        start = pool[(seed + offset) % cn]
        dists = bfs_distances(start, graph, MAX_STEPS)
        valid_ends = [
            w for w, d in dists.items()
            if MIN_STEPS <= d <= MAX_STEPS and w in pool_set
            and not is_blocked(w)
            and (start, w) not in recent_pairs and (w, start) not in recent_pairs
        ]
        if not valid_ends:
            continue
        end = valid_ends[(seed * 31 + offset) % len(valid_ends)]
        key = (min(start, end), max(start, end))
        if key in seen:
            continue
        path = bfs_shortest_path(start, end, graph)
        if path is None:
            continue
        seen.add(key)
        out.append((start, end, path))
    return out


# ---------- Main flow ----------


def write_puzzle(args: Args, payload: dict) -> Path:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    full = {
        "date": args.date,
        "game": "ladder",
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
        if f.name != "index.json"
        and re.fullmatch(r"\d{4}-\d{2}-\d{2}", f.stem)
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
        log(f"{out_path.relative_to(ROOT)} already exists; use --force")
        update_manifest(args.out_dir)
        return 0

    log(f"generating ladder for {args.date} ({args.lang})")
    answers = load_words(ANSWER_LIST_PATH)
    dictionary = set(load_words(DICT_PATH))
    log(f"loaded {len(answers)} answer-list words and {len(dictionary)} dict words")
    # BFS runs over a *common-words* subset so the optimal path only uses
    # words humans recognise. Player input still validates against the full
    # dictionary on the client side — they can take any chain of valid words.
    common = common_words(dictionary, args.lang)
    graph = build_graph(common)

    recent = load_recent(args.out_dir)
    recent_pairs: set[tuple[str, str]] = set()
    for r in recent:
        s, e = r.get("start"), r.get("end")
        if isinstance(s, str) and isinstance(e, str):
            recent_pairs.add((s, e))
    log(f"loaded {len(recent_pairs)} recent pairs for dedup")

    # Structural-first: build valid ladders ourselves, then let Gemini pick the
    # nicest. Any pick is valid, so the LLM can only improve the puzzle, never
    # break it.
    candidates = structural_candidates(args.date, answers, graph, recent_pairs)
    if not candidates:
        sys.exit("no valid ladders found — dictionary/graph mismatch?")
    log(f"built {len(candidates)} valid ladder candidates")

    theme: str | None = None
    generator = "fallback"
    pick = select_with_gemini(candidates)
    if pick is not None:
        idx, theme = pick
        start, end, path = candidates[idx]
        generator = "gemini-2.5-flash-lite"
        log(f"Gemini chose {start} → {end} (theme: {theme})", level="ok")
    else:
        start, end, path = candidates[0]
        log(f"structural pick: {start} → {end}")

    payload = {
        "start": start,
        "end": end,
        "optimal_steps": len(path) - 1,
        "optimal_path": path,
        "theme": theme,
        "difficulty_similarity": difficulty_similarity(start, end),
        "generated_by": generator,
    }

    out = write_puzzle(args, payload)
    update_manifest(args.out_dir)
    log(
        f"wrote {out.relative_to(ROOT)} → {start} → {end} "
        f"in {payload['optimal_steps']} optimal steps",
        level="ok",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
