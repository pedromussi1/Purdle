"""Generate a single daily Quartet puzzle.

A Quartet puzzle is 16 words organised into 4 thematically connected groups
of 4. The pipeline mirrors the Wordle generator (graceful degradation, every
external dep optional) but adds the headline ML check: an embedding-based
cluster-quality validator that rejects puzzles whose declared groups don't
actually cluster well in semantic space.

Pipeline per attempt:
  1. Gemini proposes 4 groups (theme + 4 words + difficulty tier).
  2. Per-word filters: lowercase, alpha, length<=12, profanity, Zipf>=3.0.
  3. No duplicate words across the puzzle.
  4. Embedding cluster check:
       - intra-group mean cosine similarity >= 0.20
       - inter-group centroid similarity   <= 0.65
     (Thresholds are loose to start — wide variance in legitimate puzzles
      means tighter values reject too aggressively.)
  5. Recent-puzzle dedup (no group theme reused in last 30 days).

If 5 attempts fail OR Gemini isn't available, fall back to a deterministic
hash-of-date pick from `scripts/quartet_backup.json`.

Usage:
    python scripts/generate_quartet.py [--date YYYY-MM-DD] [--force]
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
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gemini_retry import generate_json  # noqa: E402  Gemini call w/ backoff

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = 1
GROUP_COUNT = 4
WORDS_PER_GROUP = 4
TOTAL_WORDS = GROUP_COUNT * WORDS_PER_GROUP
GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LANG = "en"
NOVELTY_LOOKBACK_DAYS = 30

BACKUP_PATH = ROOT / "scripts" / "quartet_backup.json"


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
    p.add_argument("--out", default="public/puzzles/quartet")
    p.add_argument("--force", action="store_true")
    a = p.parse_args()
    date = a.date or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        p.error(f"--date must be YYYY-MM-DD, got {date!r}")
    return Args(date=date, lang=a.lang, out_dir=ROOT / a.out / a.lang, force=a.force)


def load_backup() -> list[dict]:
    return json.loads(BACKUP_PATH.read_text(encoding="utf-8"))


def load_recent_puzzles(out_dir: Path) -> list[dict]:
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


# ---------- Per-word filters ----------

def is_profane(word: str) -> bool:
    try:
        from better_profanity import profanity  # type: ignore
        return bool(profanity.contains_profanity(word))
    except ImportError:
        return False


def is_common(word: str, lang: str, threshold: float = 3.0) -> bool:
    try:
        from wordfreq import zipf_frequency  # type: ignore
        return zipf_frequency(word, lang) >= threshold
    except ImportError:
        return True


# ---------- Embedding cluster validation ----------

# Cache the model across multiple call_gemini retries within one process.
_model_cache: Any = None


def _get_embedder() -> Any | None:
    global _model_cache
    if _model_cache is not None:
        return _model_cache
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        _model_cache = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        return _model_cache
    except ImportError:
        return None


def validate_clustering(
    groups: list[dict],
    *,
    intra_min: float = 0.20,
    inter_max: float = 0.65,
) -> str | None:
    """Returns None on success, otherwise a short rejection reason."""
    model = _get_embedder()
    if model is None:
        log("sentence-transformers not installed; skipping cluster check", level="warn")
        return None

    try:
        from sentence_transformers import util  # type: ignore
        import torch  # type: ignore
    except ImportError:
        return None

    all_words = [w for g in groups for w in g["words"]]
    embeddings = model.encode(all_words, convert_to_tensor=True)

    # Reshape into per-group [4][4]
    grouped = [embeddings[i * WORDS_PER_GROUP:(i + 1) * WORDS_PER_GROUP] for i in range(GROUP_COUNT)]

    # Intra-group cohesion
    for i, group_emb in enumerate(grouped):
        sim = util.cos_sim(group_emb, group_emb)
        upper_tri_vals = []
        for r in range(WORDS_PER_GROUP):
            for c in range(r + 1, WORDS_PER_GROUP):
                upper_tri_vals.append(float(sim[r][c]))
        mean_intra = sum(upper_tri_vals) / len(upper_tri_vals)
        if mean_intra < intra_min:
            return (
                f"group {i} '{groups[i].get('theme', '?')}' has low intra-similarity "
                f"({mean_intra:.2f} < {intra_min})"
            )

    # Inter-group separation (centroid-to-centroid)
    centroids = torch.stack([g.mean(dim=0) for g in grouped])
    inter = util.cos_sim(centroids, centroids)
    for r in range(GROUP_COUNT):
        for c in range(r + 1, GROUP_COUNT):
            sim = float(inter[r][c])
            if sim > inter_max:
                return (
                    f"groups {r} and {c} too similar "
                    f"(centroid sim {sim:.2f} > {inter_max})"
                )
    return None


# ---------- Gemini path ----------

GEMINI_PROMPT = """You generate a Quartet puzzle: 16 common English words organised into 4 thematically connected groups of 4. Return STRICT JSON, no prose, no markdown.

Constraints for each group:
- Exactly 4 words. Lowercase, no proper nouns, no offensive content.
- All words must be common everyday English (Zipf frequency >= 3.5).
- The connection should be clear once revealed but not trivial.

Difficulty tiers: assign one tier per group, all 4 tiers must be used:
- 1 (easy): obvious category, e.g. "primary colors"
- 2 (medium): clear category but with one less-obvious member
- 3 (hard): requires recognising a less-obvious connection
- 4 (tricky): wordplay, double meanings, or surprising connection

Across the puzzle:
- Each word appears in exactly one group.
- Themes should be distinct from each other (no concept overlap).
- Recent puzzle themes to AVOID: {recent_themes}
{extra_feedback}

Output schema:
{{
  "groups": [
    {{ "theme": "<short label>", "words": ["w1","w2","w3","w4"], "tier": 1 }},
    {{ "theme": "<short label>", "words": ["w1","w2","w3","w4"], "tier": 2 }},
    {{ "theme": "<short label>", "words": ["w1","w2","w3","w4"], "tier": 3 }},
    {{ "theme": "<short label>", "words": ["w1","w2","w3","w4"], "tier": 4 }}
  ]
}}
"""


def call_gemini(*, recent_themes: list[str], extra_feedback: str = "") -> dict | None:
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
    prompt = GEMINI_PROMPT.format(
        recent_themes=recent_themes[-30:] if recent_themes else "(none)",
        extra_feedback=("\n- " + extra_feedback) if extra_feedback else "",
    )
    return generate_json(client, types, model=GEMINI_MODEL, prompt=prompt,
                         temperature=1.0, log=log)


# ---------- Validation ----------

def validate_puzzle(
    payload: dict,
    *,
    lang: str,
    recent_themes_set: set[str],
) -> str | None:
    """Returns None on success, otherwise rejection reason."""
    groups = payload.get("groups")
    if not isinstance(groups, list) or len(groups) != GROUP_COUNT:
        return f"expected {GROUP_COUNT} groups, got {len(groups) if isinstance(groups, list) else 'invalid'}"

    seen_words: set[str] = set()
    seen_tiers: set[int] = set()

    for i, g in enumerate(groups):
        if not isinstance(g, dict):
            return f"group {i} is not an object"
        theme = (g.get("theme") or "").strip()
        words = g.get("words")
        tier = g.get("tier")

        if not theme:
            return f"group {i} missing theme"
        if not isinstance(words, list) or len(words) != WORDS_PER_GROUP:
            return f"group {i} must have exactly {WORDS_PER_GROUP} words"
        if not isinstance(tier, int) or tier < 1 or tier > 4:
            return f"group {i} tier must be 1..4, got {tier!r}"
        if tier in seen_tiers:
            return f"tier {tier} used more than once"
        seen_tiers.add(tier)

        if theme.lower() in recent_themes_set:
            return f"theme '{theme}' was used recently"

        cleaned = []
        for w in words:
            if not isinstance(w, str):
                return f"group {i} word is not a string: {w!r}"
            wl = w.strip().lower()
            if not re.fullmatch(r"[a-z]{2,12}", wl):
                return f"group {i} word {w!r} not 2-12 letters"
            if wl in seen_words:
                return f"word {wl!r} appears in more than one group"
            if is_profane(wl):
                return f"word {wl!r} flagged as profanity"
            if not is_common(wl, lang):
                return f"word {wl!r} too obscure (Zipf < 3.0)"
            seen_words.add(wl)
            cleaned.append(wl)
        g["words"] = cleaned
        g["theme"] = theme

    return None


# ---------- Main flow ----------

def attempt_gemini(args: Args, recent_puzzles: list[dict]) -> dict | None:
    recent_themes = []
    for p in recent_puzzles:
        for g in p.get("groups", []):
            t = g.get("theme")
            if t:
                recent_themes.append(t)
    recent_themes_set = {t.lower() for t in recent_themes}

    feedback = ""
    for attempt in range(5):
        payload = call_gemini(
            recent_themes=recent_themes,
            extra_feedback=feedback,
        )
        if payload is None:
            return None  # API key missing or library unavailable

        rejection = validate_puzzle(
            payload, lang=args.lang, recent_themes_set=recent_themes_set
        )
        if rejection is None:
            cluster_reject = validate_clustering(payload["groups"])
            if cluster_reject is not None:
                rejection = cluster_reject

        if rejection is None:
            payload["generated_by"] = GEMINI_MODEL
            log(f"attempt {attempt + 1}: accepted", level="ok")
            return payload

        log(f"attempt {attempt + 1}: rejected — {rejection}", level="warn")
        feedback = (
            f"Your previous attempt was rejected: {rejection}. Generate a different puzzle."
        )

    return None


def fallback_puzzle(date: str) -> dict:
    backup = load_backup()
    seed = int(hashlib.sha256(date.encode()).hexdigest(), 16)
    chosen = backup[seed % len(backup)]
    return {**chosen, "generated_by": "fallback"}


def write_puzzle(args: Args, payload: dict) -> Path:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    full = {
        "date": args.date,
        "game": "quartet",
        "lang": args.lang,
        "schema_version": SCHEMA_VERSION,
        **payload,
    }
    out_path = args.out_dir / f"{args.date}.json"
    out_path.write_text(json.dumps(full, indent=2) + "\n", encoding="utf-8")
    return out_path


def update_manifest(out_dir: Path) -> Path:
    # Filter to bare date.json files; embeddings sidecars (*.embeddings.json)
    # share the directory but aren't separate puzzles.
    files = sorted(out_dir.glob("*.json"))
    dates = sorted(
        f.stem
        for f in files
        if f.name != "index.json"
        and not f.stem.endswith(".embeddings")
        and re.fullmatch(r"\d{4}-\d{2}-\d{2}", f.stem)
    )
    manifest = out_dir / "index.json"
    manifest.write_text(
        json.dumps({"dates": dates, "schema_version": SCHEMA_VERSION}, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def write_embeddings(date: str, out_dir: Path, groups: list[dict]) -> Path | None:
    """Encode the 16 puzzle words with the same MiniLM model the cluster
    validator uses, write them as a sidecar JSON file. Used by the in-browser
    hint feature: cosine similarity on these vectors picks the next pick most
    semantically tied to the player's current selection.

    No-op when sentence-transformers isn't installed (local fallback runs).
    """
    model = _get_embedder()
    if model is None:
        log("sentence-transformers not installed; skipping embeddings", level="warn")
        return None

    words = [w for g in groups for w in g["words"]]
    emb = model.encode(words, normalize_embeddings=True, convert_to_numpy=True)
    # Round to keep the JSON small. 5 decimals preserves enough precision for
    # cosine-sim ranking; the alternative (full float32) ~doubles file size.
    rounded = [[round(float(v), 5) for v in row] for row in emb]
    payload = {
        "date": date,
        "words": words,
        "embedding_dim": int(emb.shape[1]),
        "embeddings": rounded,
    }
    out_path = out_dir / f"{date}.embeddings.json"
    out_path.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    return out_path


def main() -> int:
    args = parse_args()
    out_path = args.out_dir / f"{args.date}.json"
    if out_path.exists() and not args.force:
        log(f"{out_path.relative_to(ROOT)} already exists; use --force to overwrite")
        update_manifest(args.out_dir)
        return 0

    log(f"generating quartet for {args.date} ({args.lang})")
    recent = load_recent_puzzles(args.out_dir)
    log(f"loaded {len(recent)} recent puzzles for theme-dedup")

    payload = attempt_gemini(args, recent) if os.environ.get("GEMINI_API_KEY") else None
    if payload is None:
        log("using deterministic fallback")
        payload = fallback_puzzle(args.date)

    out = write_puzzle(args, payload)
    write_embeddings(args.date, args.out_dir, payload["groups"])
    update_manifest(args.out_dir)

    themes = ", ".join(g["theme"] for g in payload["groups"])
    log(f"wrote {out.relative_to(ROOT)} → themes: {themes}", level="ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
