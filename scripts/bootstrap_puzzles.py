"""Seed puzzles for a date range by invoking generate_puzzle.py for each day.

Used once before the first deploy so the site has archive content from day one,
and as a recovery tool if a daily run was missed.

Usage:
    python scripts/bootstrap_puzzles.py --start 2026-04-22 --count 15
"""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--start", required=True, help="First date, YYYY-MM-DD")
    p.add_argument("--count", type=int, default=30, help="Number of consecutive dates")
    p.add_argument("--lang", default="en")
    p.add_argument("--force", action="store_true")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    start = dt.datetime.strptime(args.start, "%Y-%m-%d").date()
    failures = 0
    for i in range(args.count):
        date = (start + dt.timedelta(days=i)).strftime("%Y-%m-%d")
        cmd = [sys.executable, str(ROOT / "scripts" / "generate_puzzle.py"),
               "--date", date, "--lang", args.lang]
        if args.force:
            cmd.append("--force")
        print(f"\n=== {date} ===")
        rc = subprocess.call(cmd)
        if rc != 0:
            failures += 1
            print(f"  ✗ exited with {rc}", file=sys.stderr)
    print(f"\nDone. {args.count - failures}/{args.count} succeeded.")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
