"""Generate a single daily Purdle puzzle.

The pipeline emphasizes graceful degradation — every external dependency is
optional. If `GEMINI_API_KEY` is missing or any ML library isn't installed,
the script falls back to a deterministic pick from the curated answer list,
so local development and CI can always produce a valid puzzle.

Usage:
    python scripts/generate_puzzle.py [--date YYYY-MM-DD] [--lang en]
                                       [--out public/puzzles/wordle]
                                       [--force]

Environment:
    GEMINI_API_KEY  Optional. Enables LLM-driven word selection + etymology.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gemini_retry import generate_json  # noqa: E402  Gemini call w/ backoff
from wordfilter import is_blocked  # noqa: E402  proper-noun/offensive filter

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = 1
WORD_LENGTH = 5
NOVELTY_LOOKBACK_DAYS = 60
GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LANG = "en"

ANSWER_LIST_PATH = ROOT / "scripts" / "answer_list.txt"
BACKUP_LIST_PATH = ROOT / "scripts" / "backup_words.json"


# ---------- Logging ----------

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
    p.add_argument("--out", default="public/puzzles/wordle")
    p.add_argument("--force", action="store_true",
                   help="Overwrite an existing puzzle for this date.")
    a = p.parse_args()
    date = a.date or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        p.error(f"--date must be YYYY-MM-DD, got {date!r}")
    return Args(date=date, lang=a.lang, out_dir=ROOT / a.out / a.lang, force=a.force)


def load_answer_list() -> list[str]:
    if not ANSWER_LIST_PATH.exists():
        sys.exit(
            f"Missing {ANSWER_LIST_PATH}. Run scripts/download_word_lists.ps1 first."
        )
    return [
        w.strip().lower()
        for w in ANSWER_LIST_PATH.read_text(encoding="utf-8").splitlines()
        if len(w.strip()) == WORD_LENGTH and w.strip().isalpha()
    ]


def load_backup_list() -> list[str]:
    if BACKUP_LIST_PATH.exists():
        return json.loads(BACKUP_LIST_PATH.read_text(encoding="utf-8"))
    return []


def load_recent_solutions(out_dir: Path, lookback: int = NOVELTY_LOOKBACK_DAYS) -> list[dict]:
    if not out_dir.exists():
        return []
    files = sorted(out_dir.glob("*.json"))
    files = [f for f in files if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.json", f.name)]
    recent = files[-lookback:]
    out: list[dict] = []
    for f in recent:
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception as e:
            log(f"skipping unreadable {f.name}: {e}", level="warn")
    return out


# ---------- Validators ----------

def in_dictionary(word: str, answers: set[str]) -> bool:
    return word in answers


def is_profane(word: str) -> bool:
    try:
        from better_profanity import profanity  # type: ignore
        return bool(profanity.contains_profanity(word))
    except ImportError:
        return False  # we still have the curated answer list as a baseline


def is_common(word: str, lang: str, threshold: float = 3.5) -> bool:
    """Zipf >= 3.5 ≈ "moderately common" (e.g. 'crane', 'spice')."""
    try:
        from wordfreq import zipf_frequency  # type: ignore
        return zipf_frequency(word, lang) >= threshold
    except ImportError:
        return True  # accept if we can't measure


def novelty_max_similarity(word: str, recent_words: list[str]) -> float | None:
    """Returns the max cosine similarity vs recent solutions, or None if the
    sentence-transformers stack isn't installed (in which case we fall back to
    exact-match novelty handled separately)."""
    if not recent_words:
        return 0.0
    try:
        from sentence_transformers import SentenceTransformer, util  # type: ignore
    except ImportError:
        return None
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    embeddings = model.encode([word, *recent_words], convert_to_tensor=True)
    sims = util.cos_sim(embeddings[0], embeddings[1:])[0]
    return float(sims.max().item())


# ---------- Gemini path ----------

def call_gemini(*, recent_solutions: list[str], extra_feedback: str = "") -> dict | None:
    """Returns parsed JSON {solution, difficulty, theme, etymology} or None."""
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
    prompt = f"""You generate puzzles for a Wordle clone called Purdle. Return STRICT JSON, no prose, no markdown.

Constraints:
- "solution" MUST be exactly 5 lowercase English letters, a single common word.
- MUST be a noun, verb, or adjective in everyday use (Zipf frequency >= 3.5).
- MUST NOT be a proper noun, abbreviation, or slang.
- MUST NOT appear in this list of recent solutions: {recent_solutions[-15:]}
- MUST NOT be offensive, profane, a slur, or politically charged.
{extra_feedback}

Output schema:
{{
  "solution": "<5 lowercase letters>",
  "difficulty": <integer 1-5>,
  "theme": "<one-or-two word tag, can be null>",
  "etymology": "<2-3 sentence origin or fun fact, kid-safe>"
}}"""

    return generate_json(client, types, model=GEMINI_MODEL, prompt=prompt,
                         temperature=1.0, log=log)


# ---------- Fallback path ----------

def deterministic_pick(date: str, candidates: list[str], recent: set[str]) -> str:
    """Pick a candidate by date-hash. If it collides with a recent solution,
    walk forward until we find a fresh one. Stable across machines."""
    seed = int(hashlib.sha256(date.encode()).hexdigest(), 16)
    n = len(candidates)
    for offset in range(n):
        word = candidates[(seed + offset) % n]
        if word not in recent:
            return word
    return candidates[seed % n]  # all candidates are recent — extremely unlikely


def fallback_puzzle(args: Args, answers: list[str], recent: set[str]) -> dict:
    backup = load_backup_list()
    pool = backup if backup else answers
    # Apply the same quality gates the Gemini path uses so the fallback can't
    # ship an obscure or blocklisted word ('haste' 3.37 slipped through before).
    gated = [w for w in pool if is_common(w, args.lang) and not is_blocked(w)]
    if gated:
        pool = gated
    word = deterministic_pick(args.date, pool, recent)
    return {
        "solution": word,
        "difficulty": None,
        "theme": None,
        "etymology": None,
        "generated_by": "fallback",
    }


# ---------- Main flow ----------

def attempt_gemini(args: Args, answers_set: set[str], recent: list[dict]) -> dict | None:
    recent_words = [r.get("solution", "") for r in recent]
    feedback = ""
    for attempt in range(5):
        result = call_gemini(recent_solutions=recent_words, extra_feedback=feedback)
        if result is None:
            return None  # missing key / lib — go straight to fallback

        word = (result.get("solution") or "").lower().strip()
        rejection = _validate_candidate(word, args.lang, answers_set, set(recent_words))
        if rejection is None:
            sim = novelty_max_similarity(word, recent_words)
            if sim is not None and sim > 0.75:
                rejection = f"too similar to recent words (cos={sim:.2f})"
            else:
                result["solution"] = word
                result["generated_by"] = GEMINI_MODEL
                log(f"attempt {attempt + 1}: {word!r} accepted (novelty={sim})", level="ok")
                return result

        log(f"attempt {attempt + 1}: rejected {word!r} — {rejection}", level="warn")
        feedback = (
            f"- The word {word!r} you previously suggested was rejected because: "
            f"{rejection}. Pick a different word."
        )
    return None


def _validate_candidate(word: str, lang: str, answers: set[str], recent: set[str]) -> str | None:
    if not re.fullmatch(r"[a-z]{5}", word):
        return f"not a 5-letter lowercase string"
    if word in recent:
        return "appears in recent solutions"
    if not in_dictionary(word, answers):
        return "not in curated answer list"
    if is_profane(word):
        return "flagged by profanity filter"
    if is_blocked(word):
        return "blocklisted proper noun / offensive term"
    if not is_common(word, lang):
        return "Zipf frequency below 3.5 (too obscure)"
    return None


def write_puzzle(args: Args, payload: dict) -> Path:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    full = {
        "date": args.date,
        "game": "wordle",
        "lang": args.lang,
        "schema_version": SCHEMA_VERSION,
        **payload,
    }
    out_path = args.out_dir / f"{args.date}.json"
    out_path.write_text(json.dumps(full, indent=2) + "\n", encoding="utf-8")
    return out_path


def update_manifest(out_dir: Path) -> Path:
    """Maintain index.json — sorted list of available dates so the frontend
    can find the most recent puzzle even when today's file is missing."""
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
        log(f"{out_path.relative_to(ROOT)} already exists; use --force to overwrite", level="info")
        update_manifest(args.out_dir)
        return 0

    log(f"generating puzzle for {args.date} ({args.lang})")
    answers = load_answer_list()
    answers_set = set(answers)
    recent = load_recent_solutions(args.out_dir)
    log(f"loaded {len(answers)} answer candidates, {len(recent)} recent puzzles")

    payload = attempt_gemini(args, answers_set, recent) if os.environ.get("GEMINI_API_KEY") else None
    if payload is None:
        log("using deterministic fallback", level="info")
        payload = fallback_puzzle(args, answers, {r.get("solution", "") for r in recent})

    out = write_puzzle(args, payload)
    update_manifest(args.out_dir)
    log(f"wrote {out.relative_to(ROOT)} → solution: {payload['solution']}", level="ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
