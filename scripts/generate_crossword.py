"""Daily Crossword (mini, 5×5) puzzle generator.

Crossword is a constraint-satisfaction puzzle: fill a fixed grid layout
with English words such that every row and every column forms a real
word, and intersecting letters agree.

Pipeline per attempt:
  1. Parse the grid layout — derive slots (maximal horizontal/vertical
     white-cell runs of length >= 3) and their pairwise intersections.
  2. Load a length-bucketed common-word dictionary (Zipf >= MIN_ZIPF).
  3. Backtracking + arc consistency (AC-3) to fill every slot. Variables
     are slots, values are words, constraints are letter agreements at
     intersections.
  4. Call Gemini once per filled word to generate an NYT-mini-style clue.
     Falls back to a generic "5-letter word" hint if Gemini is unavailable.
  5. Output JSON.

The fixed v1 layout is a 5×5 with two corner blacks (top-right + bottom-
left), 180°-rotationally symmetric, yielding 10 slots: 4 of length 4
and 6 of length 5.

Output: public/puzzles/crossword/en/<date>.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = 1
DEFAULT_LANG = "en"
MIN_WORD_LENGTH = 3
MAX_WORD_LENGTH = 5
# Per-length Zipf thresholds. Short words (3-4 letters) are heavily polluted
# by initialisms and proper nouns at the standard 3.5 cutoff (LGBT, ARIEL,
# etc.), so we tighten them. 5-letter words use the curated Wordle list and
# don't need a frequency floor.
MIN_ZIPF_BY_LEN = {3: 4.5, 4: 4.0, 5: 3.5}
# Curated 5-letter answer list (~2300 words, hand-vetted from the Wordle
# answer set). Much cleaner than valid-guesses.txt which accepts obscure
# words like 'kieve' and 'oxids'.
WORDLE_5LETTER_PATH = ROOT / "scripts" / "answer_list.txt"
# Words we never want to see in a crossword — wordfreq doesn't separate
# proper nouns from common nouns, so they sneak through the Zipf filter.
# Categories: initialisms, geographic/political proper nouns, common first
# names, brand/product names, religious figures.
BLOCKLIST = {
    # Initialisms / acronyms
    "lgbt", "isis", "usa", "uk", "eu", "un", "ussr", "nato", "nasa",
    "fbi", "cia", "irs", "ipad", "irc", "ftp", "html", "ceo", "cfo",
    # Geographic / political proper nouns
    "iraq", "iran", "cuba", "asia", "utah", "ohio", "iowa", "maui",
    "peru", "oman", "rome", "eden", "troy", "yale", "ucla", "tokyo",
    "paris", "chile", "china", "india", "italy", "japan", "libya",
    "syria", "egypt", "kenya", "haiti", "wales", "texas", "spain",
    "miami", "boise", "tulsa", "boston", "berlin", "vienna", "kabul",
    # Political figures
    "obama", "trump", "biden", "putin", "ariel",
    # Common first names (3-letter)
    "bob", "joe", "tim", "dan", "jim", "sam", "mel", "max", "ned",
    "ted", "ken", "len", "eli", "ali", "eve", "ada", "amy", "ben",
    "ron", "ivy", "rob", "tom", "vic", "viv", "kim",
    # Common first names (4-letter)
    "matt", "mike", "john", "bill", "tony", "dave", "mary", "jane",
    "lisa", "anne", "ryan", "paul", "mark", "drew", "kate", "anna",
    "emma", "lily", "jack", "fred", "adam", "noah", "luke", "evan",
    "alex", "sean", "todd", "kyle", "brad", "carl", "earl", "neil",
    "olga", "rosa", "pamela", "judy", "amber",
    # Common first names (5-letter)
    "bobby", "peter", "harry", "sarah", "david", "james", "henry",
    "frank", "jerry", "kevin", "kenny", "danny", "billy", "tommy",
    # Brand names
    "covid", "amazon", "google", "apple", "nike", "sony", "ford",
    "jeep", "gucci", "uber", "lyft", "tesla", "intel", "cisco",
    # Religious / mythological figures
    "jesus", "allah", "islam", "judaism", "satan", "buddha",
    "thor", "zeus", "odin", "hera", "loki", "mars", "venus",
    "apollo",
}
GEMINI_MODEL = "gemini-2.5-flash-lite"
NOVELTY_LOOKBACK_DAYS = 30

# Fixed v1 layout. '.' = white (letter cell), '#' = black (blocker).
# 180°-rotationally symmetric; 23 white cells; 10 slots (4 across + 5 across?
# No: 5 across + 5 down). Slot lengths: 4×4 + 6×5.
LAYOUT = """
....#
.....
.....
.....
#....
""".strip()


def log(msg: str, *, level: str = "info") -> None:
    prefix = {"info": "·", "warn": "!", "ok": "✓", "err": "✗"}[level]
    print(f"  {prefix} {msg}", file=sys.stderr)


# ---------- Layout ----------

@dataclass(frozen=True)
class Slot:
    id: str           # "A1", "D3", etc. — direction letter + clue number
    direction: str    # "across" or "down"
    row: int
    col: int
    length: int
    number: int       # Standard crossword clue number (1-based, by row then col)


@dataclass
class GridSpec:
    rows: int
    cols: int
    cells: list[list[str]]  # '.' or '#'
    slots: list[Slot]
    # For each slot, the list of (other_slot_index, our_letter_index, their_letter_index)
    # — i.e. "if slot S has a letter at position our_i, slot T has the same letter at position their_i".
    intersections: dict[str, list[tuple[str, int, int]]] = field(default_factory=dict)


def parse_layout(layout: str) -> GridSpec:
    rows = [r for r in layout.splitlines() if r.strip()]
    n_rows = len(rows)
    n_cols = len(rows[0])
    if any(len(r) != n_cols for r in rows):
        sys.exit("layout rows have inconsistent widths")
    cells = [[ch for ch in row] for row in rows]

    # Number cells: a cell starts an across slot if the cell to its left is
    # black or out-of-bounds AND the cell to its right is white. Same for down.
    # Number them 1, 2, 3, ... in row-major order.
    numbers: dict[tuple[int, int], int] = {}
    next_num = 1
    for r in range(n_rows):
        for c in range(n_cols):
            if cells[r][c] == "#":
                continue
            starts_across = (c == 0 or cells[r][c - 1] == "#") and \
                            (c + 1 < n_cols and cells[r][c + 1] != "#")
            starts_down = (r == 0 or cells[r - 1][c] == "#") and \
                          (r + 1 < n_rows and cells[r + 1][c] != "#")
            if starts_across or starts_down:
                numbers[(r, c)] = next_num
                next_num += 1

    slots: list[Slot] = []

    # Across slots: for each cell that starts an across run, walk right until
    # a black cell or grid edge.
    for r in range(n_rows):
        c = 0
        while c < n_cols:
            if cells[r][c] == "#":
                c += 1
                continue
            if c == 0 or cells[r][c - 1] == "#":
                end = c
                while end < n_cols and cells[r][end] != "#":
                    end += 1
                length = end - c
                if length >= MIN_WORD_LENGTH:
                    n = numbers[(r, c)]
                    slots.append(Slot(f"A{n}", "across", r, c, length, n))
                c = end
            else:
                c += 1

    # Down slots: same idea, vertical.
    for c in range(n_cols):
        r = 0
        while r < n_rows:
            if cells[r][c] == "#":
                r += 1
                continue
            if r == 0 or cells[r - 1][c] == "#":
                end = r
                while end < n_rows and cells[end][c] != "#":
                    end += 1
                length = end - r
                if length >= MIN_WORD_LENGTH:
                    n = numbers[(r, c)]
                    slots.append(Slot(f"D{n}", "down", r, c, length, n))
                r = end
            else:
                r += 1

    spec = GridSpec(rows=n_rows, cols=n_cols, cells=cells, slots=slots)

    # Build intersections.
    by_id = {s.id: s for s in slots}
    cell_to_slots: dict[tuple[int, int], list[tuple[str, int]]] = {}
    for s in slots:
        for i in range(s.length):
            r = s.row + (i if s.direction == "down" else 0)
            c = s.col + (i if s.direction == "across" else 0)
            cell_to_slots.setdefault((r, c), []).append((s.id, i))

    for s in slots:
        spec.intersections[s.id] = []
    for cell, owners in cell_to_slots.items():
        if len(owners) < 2:
            continue
        for a_id, a_i in owners:
            for b_id, b_i in owners:
                if a_id == b_id:
                    continue
                spec.intersections[a_id].append((b_id, a_i, b_i))

    return spec


# ---------- Dictionary ----------

VOWELS = set("aeiouy")


def has_vowel(word: str) -> bool:
    """Filter for vowel-bearing words. Catches almost all initialisms
    (LGBT, NPR, FBI...) which cause noise at low Zipf thresholds."""
    return any(c in VOWELS for c in word)


def load_words_by_length() -> dict[int, list[tuple[str, float]]]:
    """Load common English words bucketed by length, sorted by Zipf desc.

    For 5-letter slots we use the curated Wordle valid-guesses list — it's
    already been vetted against proper nouns, initialisms, and offensive
    content. For 3- and 4-letter slots we draw from wordfreq's top-N
    list with a tighter Zipf threshold + a vowel requirement + a manual
    blocklist; those shorter ranges are heavily polluted at the 3.5 cutoff.
    """
    try:
        from wordfreq import top_n_list, zipf_frequency  # type: ignore
    except ImportError:
        sys.exit("wordfreq is required (pip install wordfreq)")
    raw = top_n_list("en", 80_000)
    buckets: dict[int, list[tuple[str, float]]] = {n: [] for n in range(MIN_WORD_LENGTH, MAX_WORD_LENGTH + 1)}
    for w in raw:
        w = w.lower()
        n = len(w)
        if n < MIN_WORD_LENGTH or n > MAX_WORD_LENGTH:
            continue
        if not w.isalpha():
            continue
        if w in BLOCKLIST:
            continue
        if not has_vowel(w):
            continue
        z = zipf_frequency(w, "en")
        if z < MIN_ZIPF_BY_LEN.get(n, 3.5):
            continue
        buckets[n].append((w, z))

    # Override the 5-letter bucket with the curated Wordle list. Annotate
    # each word with its Zipf for solver ordering (frequent words first).
    if WORDLE_5LETTER_PATH.exists():
        wordle_words = [
            w.strip().lower()
            for w in WORDLE_5LETTER_PATH.read_text(encoding="utf-8").splitlines()
            if len(w.strip()) == 5 and w.strip().isalpha()
        ]
        wordle_words = [w for w in wordle_words if w not in BLOCKLIST and has_vowel(w)]
        buckets[5] = [(w, zipf_frequency(w, "en")) for w in wordle_words]

    for n in buckets:
        buckets[n].sort(key=lambda t: -t[1])
    for n, lst in buckets.items():
        log(f"loaded {len(lst)} {n}-letter words")
    return buckets


def filter_profanity(buckets: dict[int, list[tuple[str, float]]]) -> dict[int, list[tuple[str, float]]]:
    """Drop words flagged by better-profanity. Skip silently if the lib
    isn't available — we'd rather ship than block."""
    try:
        from better_profanity import profanity  # type: ignore
        profanity.load_censor_words()
    except ImportError:
        log("better-profanity not installed; skipping profanity filter", level="warn")
        return buckets
    out: dict[int, list[tuple[str, float]]] = {}
    for n, lst in buckets.items():
        kept = [(w, z) for (w, z) in lst if not profanity.contains_profanity(w)]
        out[n] = kept
        if len(kept) < len(lst):
            log(f"profanity filter removed {len(lst) - len(kept)} {n}-letter words")
    return out


# ---------- CSP solver ----------

def solve(
    spec: GridSpec,
    buckets: dict[int, list[tuple[str, float]]],
    *,
    seed: int,
    forbid_words: set[str],
) -> dict[str, str] | None:
    """Backtracking + arc-consistency. Returns slot_id -> word, or None.

    Domain ordering is shuffled deterministically by `seed` so different
    days produce different fills. Forbidden words (recent solutions) are
    pre-stripped from each slot's domain.
    """
    rng = random.Random(seed)

    # Initial domains: each slot's possible words.
    domains: dict[str, list[str]] = {}
    for s in spec.slots:
        words = [w for (w, _) in buckets.get(s.length, []) if w not in forbid_words]
        rng.shuffle(words)
        domains[s.id] = words

    by_id = {s.id: s for s in spec.slots}
    intersections = spec.intersections
    assignment: dict[str, str] = {}

    def consistent(slot_id: str, word: str) -> bool:
        for other_id, our_i, their_i in intersections[slot_id]:
            if other_id in assignment:
                if assignment[other_id][their_i] != word[our_i]:
                    return False
        return True

    def propagate(slot_id: str, word: str, current_domains: dict[str, list[str]]) -> dict[str, list[str]] | None:
        """For each unassigned neighbour, filter its domain to words
        consistent with `word` at the intersection. Return None if any
        neighbour's domain becomes empty."""
        new_domains = {k: v for k, v in current_domains.items()}
        for other_id, our_i, their_i in intersections[slot_id]:
            if other_id in assignment:
                continue
            letter = word[our_i]
            filtered = [w for w in new_domains[other_id] if w[their_i] == letter]
            if not filtered:
                return None
            new_domains[other_id] = filtered
        return new_domains

    def pick_variable(current_domains: dict[str, list[str]]) -> str | None:
        unassigned = [s.id for s in spec.slots if s.id not in assignment]
        if not unassigned:
            return None
        # Most-constrained-variable heuristic: pick the slot with the
        # smallest current domain.
        return min(unassigned, key=lambda sid: len(current_domains[sid]))

    def backtrack(current_domains: dict[str, list[str]]) -> dict[str, str] | None:
        var = pick_variable(current_domains)
        if var is None:
            return dict(assignment)
        for word in current_domains[var]:
            if word in assignment.values():
                continue  # Don't reuse the same word twice in one puzzle.
            if not consistent(var, word):
                continue
            assignment[var] = word
            propagated = propagate(var, word, current_domains)
            if propagated is not None:
                result = backtrack(propagated)
                if result is not None:
                    return result
            del assignment[var]
        return None

    return backtrack(domains)


# ---------- Gemini clue generation ----------

GEMINI_PROMPT = """Write a short crossword clue for the word: {word}

Style guide:
- NYT mini crossword voice: concise, often playful, 3-8 words.
- Do NOT use the word itself, any inflection of it, or its root.
- Definite articles ("the") are usually omitted.
- For nouns, use a noun phrase. For verbs, use a verb phrase. For adjectives, use a synonym or short descriptive phrase.
- If the word has multiple meanings, pick whichever yields the most interesting clue.

Return STRICT JSON, no prose, no markdown:
{{"clue": "<your clue text here>"}}
"""


# Retry budget per word. The first few retries ride out transient rate-limit
# (429) errors with exponential backoff — important when many words are
# clued in a burst (e.g. a backfill run) and the free-tier RPM is exceeded.
GEMINI_MAX_ATTEMPTS = 6


def call_gemini_clue(word: str) -> str | None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
    except ImportError:
        return None
    client = genai.Client(api_key=api_key)
    prompt = GEMINI_PROMPT.format(word=word)
    for attempt in range(GEMINI_MAX_ATTEMPTS):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.9,
                ),
            )
            data = json.loads(response.text)
            clue = (data.get("clue") or "").strip()
            # A clue that's empty or contains the word itself is unusable;
            # resample (temperature is high, so a retry often differs).
            if clue and word.lower() not in clue.lower():
                return clue
            time.sleep(0.5)
        except Exception as e:
            # Almost always a transient rate-limit / network blip. Back off
            # exponentially (1, 2, 4, 8, 16s) and retry; give up after the
            # last attempt and let the caller fall back to a stock hint.
            if attempt == GEMINI_MAX_ATTEMPTS - 1:
                log(f"Gemini clue for {word!r} failed after {GEMINI_MAX_ATTEMPTS} attempts: {e}", level="warn")
                return None
            time.sleep(2 ** attempt)
    return None


def fallback_clue(word: str, length: int) -> str:
    return f"{length}-letter word"


def generate_clues(words: dict[str, str]) -> dict[str, str]:
    """For each (slot_id, word), produce a clue. Tries Gemini once per
    word; falls back to a stock placeholder."""
    out: dict[str, str] = {}
    for slot_id, word in words.items():
        clue = call_gemini_clue(word)
        if clue is None:
            clue = fallback_clue(word, len(word))
            log(f"{slot_id} ({word}): fallback clue", level="warn")
        else:
            log(f"{slot_id} ({word}): {clue}", level="ok")
        out[slot_id] = clue
    return out


# ---------- Output ----------

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
    p.add_argument("--out", default="public/puzzles/crossword")
    p.add_argument("--force", action="store_true")
    a = p.parse_args()
    date = a.date or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        p.error(f"--date must be YYYY-MM-DD, got {date!r}")
    return Args(date=date, lang=a.lang, out_dir=ROOT / a.out / a.lang, force=a.force)


def load_recent_words(out_dir: Path, days: int = NOVELTY_LOOKBACK_DAYS) -> set[str]:
    """Words used in the last `days` puzzles — used to nudge the solver
    toward novelty across consecutive puzzles."""
    if not out_dir.exists():
        return set()
    files = sorted(
        f for f in out_dir.glob("*.json")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.json", f.name)
    )
    used: set[str] = set()
    for f in files[-days:]:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            for slot in data.get("slots", []):
                w = slot.get("word")
                if isinstance(w, str):
                    used.add(w.lower())
        except Exception:
            pass
    return used


def write_puzzle(args: Args, payload: dict) -> Path:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    full = {
        "date": args.date,
        "game": "crossword",
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

    log(f"generating crossword for {args.date} ({args.lang})")
    spec = parse_layout(LAYOUT)
    log(f"layout: {spec.rows}×{spec.cols}, {len(spec.slots)} slots")
    buckets = filter_profanity(load_words_by_length())

    # Novelty is a *soft* preference, not a hard constraint. Excluding every
    # recently-used word can make this small, dense 5×5 grid unsatisfiable —
    # and because a failed run writes no puzzle, the recent-word set would
    # freeze at that boundary and deadlock the daily job forever. So we solve
    # in tiers: prefer the full novelty window, then relax to a short window,
    # then drop the constraint entirely. The base grid is always fillable from
    # the full dictionary, guaranteeing we always ship a puzzle.
    #
    # A single deterministic attempt per tier is sufficient: the backtracking
    # solver is complete, so it either finds a fill or proves none exists —
    # re-rolling the seed cannot change satisfiability at a fixed tier.
    base_seed = int(hashlib.sha256(args.date.encode()).hexdigest(), 16) & 0xFFFFFFFF
    tiers = [
        (f"{NOVELTY_LOOKBACK_DAYS}-day novelty", load_recent_words(args.out_dir)),
        ("7-day novelty", load_recent_words(args.out_dir, days=7)),
        ("no novelty constraint", set()),
    ]
    fill: dict[str, str] | None = None
    for label, forbid in tiers:
        log(f"solving grid ({label}, avoiding {len(forbid)} words, seed {base_seed})")
        fill = solve(spec, buckets, seed=base_seed, forbid_words=forbid)
        if fill is not None:
            if forbid is not tiers[0][1]:
                log(f"relaxed novelty to '{label}' to fill the grid", level="warn")
            break
    if fill is None:
        sys.exit("solver failed to fill the grid even without novelty constraints")
    log(f"filled {len(fill)} slots", level="ok")

    clues = generate_clues(fill)

    # Build output schema.
    slots_out = []
    for s in spec.slots:
        slots_out.append({
            "id": s.id,
            "direction": s.direction,
            "row": s.row,
            "col": s.col,
            "length": s.length,
            "number": s.number,
            "word": fill[s.id],
            "clue": clues[s.id],
        })

    # Solution grid: 5×5 of letters and # (for blacks).
    grid: list[list[str]] = [[c for c in row] for row in spec.cells]
    for s in spec.slots:
        for i, ch in enumerate(fill[s.id]):
            r = s.row + (i if s.direction == "down" else 0)
            c = s.col + (i if s.direction == "across" else 0)
            grid[r][c] = ch

    payload = {
        "rows": spec.rows,
        "cols": spec.cols,
        "layout": [[c for c in row] for row in spec.cells],
        "solution": grid,
        "slots": slots_out,
        "generated_by": "gemini-2.5-flash-lite" if any(
            clues[s.id] != fallback_clue(fill[s.id], len(fill[s.id]))
            for s in spec.slots
        ) else "fallback",
    }
    out = write_puzzle(args, payload)
    update_manifest(args.out_dir)
    log(f"wrote {out.relative_to(ROOT)}", level="ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
