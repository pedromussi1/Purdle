"""Regenerate fallback crossword clues in place.

A burst backfill can exhaust Gemini's rate limit, leaving puzzles with stock
"N-letter word" placeholder clues that are unplayable. This one-off tool walks
existing puzzle files and re-asks Gemini for a real clue for every slot whose
clue is still a placeholder — preserving the grid and any clues that already
succeeded. It's paced (and, via generate_crossword.call_gemini_clue, backed
off) to stay under the API rate limit.

Idempotent: slots that already have a real clue are left untouched, so it's
safe to re-run until every placeholder is filled.

Usage:
  python scripts/reclue_crossword.py                     # all dates, en
  python scripts/reclue_crossword.py --start 2026-05-26  # from a date onward
  python scripts/reclue_crossword.py --pace 4            # seconds between calls
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

# Same-directory import; generate_crossword does no work at import time.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_crossword as gc  # noqa: E402
from generate_crossword import (  # noqa: E402
    GEMINI_MODEL,
    call_gemini_clue,
    fallback_clue,
    log,
)

# The daily cron leaves CLUES_VIA_GEMINI off to save quota; this tool exists
# specifically to generate clues, so force it on for the reclue run.
gc.CLUES_VIA_GEMINI = True

ROOT = Path(__file__).resolve().parent.parent
FALLBACK_RE = re.compile(r"^\d+-letter word$")


def is_fallback(clue: str) -> bool:
    return bool(FALLBACK_RE.match(clue.strip()))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--start", default=None, help="First date YYYY-MM-DD (default: earliest)")
    p.add_argument("--end", default=None, help="Last date YYYY-MM-DD inclusive (default: today UTC)")
    p.add_argument("--lang", default="en")
    p.add_argument("--dir", default="public/puzzles/crossword")
    p.add_argument("--pace", type=float, default=4.0,
                   help="Seconds to wait between Gemini calls (rate-limit pacing)")
    return p.parse_args()


def in_range(date: str, start: str | None, end: str) -> bool:
    if start and date < start:
        return False
    return date <= end


def main() -> int:
    a = parse_args()
    out_dir = ROOT / a.dir / a.lang
    if not out_dir.exists():
        sys.exit(f"no such directory: {out_dir}")
    end = a.end or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")

    files = sorted(
        f for f in out_dir.glob("*.json")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.json", f.name)
        and in_range(f.stem, a.start, end)
    )
    log(f"scanning {len(files)} puzzle files for placeholder clues")

    total_fixed = 0
    total_remaining = 0
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        slots = data.get("slots", [])
        pending = [s for s in slots if is_fallback(s.get("clue", ""))]
        if not pending:
            continue
        log(f"{f.stem}: {len(pending)} placeholder clue(s)")
        fixed_here = 0
        for s in pending:
            word = s["word"]
            clue = call_gemini_clue(word)
            if clue:
                s["clue"] = clue
                fixed_here += 1
                log(f"  {s['id']} ({word}): {clue}", level="ok")
            else:
                log(f"  {s['id']} ({word}): still no clue", level="warn")
            time.sleep(a.pace)

        # Recompute provenance: gemini if any real clue survives, else fallback.
        any_real = any(not is_fallback(s.get("clue", "")) for s in slots)
        data["generated_by"] = GEMINI_MODEL if any_real else "fallback"

        if fixed_here:
            f.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        total_fixed += fixed_here
        total_remaining += len(pending) - fixed_here

    log(f"done — fixed {total_fixed} clue(s), {total_remaining} still placeholder", level="ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
