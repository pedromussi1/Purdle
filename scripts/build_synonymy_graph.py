"""One-shot synonym-graph builder for the Synonymy game.

Computes a precomputed adjacency list of "semantic neighbours" — for each
common 5-letter word, the other words whose `all-MiniLM-L6-v2` embedding
is within a cosine-similarity threshold. The result becomes a static
asset (`public/words/synonymy-graph.json`) shipped to the browser, where
it powers the in-game validation rule: "your next word must be a synonym
of your previous word."

Run once per dictionary version. Rerun only when:
  - The word list changes (e.g. extras added).
  - The similarity threshold needs tuning.

Output schema (index-based to keep the file ~150 KB gzipped):
  {
    "lang":      "en",
    "threshold": 0.5,
    "model":     "sentence-transformers/all-MiniLM-L6-v2",
    "min_zipf":  3.5,
    "words":     ["aback", "abate", ..., "zooks"],
    "neighbours": [
      [4, 17, 92, ...],     // indices into `words` for word at index 0
      [1, 3, 88, ...],      // for word at index 1
      ...
    ]
  }

Usage (intended for CI; locally requires sentence-transformers + network):
    python scripts/build_synonymy_graph.py [--threshold 0.5] [--max-neighbours 40]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_PATH = ROOT / "public" / "words" / "valid-guesses.txt"
OUT_PATH = ROOT / "public" / "words" / "synonymy-graph.json"

WORD_LENGTH = 5
DEFAULT_LANG = "en"
DEFAULT_MIN_ZIPF = 3.5
DEFAULT_THRESHOLD = 0.5
DEFAULT_MAX_NEIGHBOURS = 40
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


def log(msg: str) -> None:
    print(f"  · {msg}", file=sys.stderr)


def load_common_words(lang: str, min_zipf: float) -> list[str]:
    """Load 5-letter dict words filtered to wordfreq Zipf >= min_zipf."""
    raw = [
        w.strip().lower()
        for w in DICT_PATH.read_text(encoding="utf-8").splitlines()
        if len(w.strip()) == WORD_LENGTH and w.strip().isalpha()
    ]
    try:
        from wordfreq import zipf_frequency  # type: ignore
    except ImportError:
        sys.exit("wordfreq is required to filter common words")
    common = [w for w in raw if zipf_frequency(w, lang) >= min_zipf]
    log(f"loaded {len(common)} common words from {len(raw)} total (Zipf >= {min_zipf})")
    return common


def encode(words: list[str]):
    """Embed every word with the MiniLM model, normalised to unit length so
    pairwise dot product == cosine similarity."""
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except ImportError:
        sys.exit("sentence-transformers is required")
    log(f"loading {MODEL_NAME}…")
    model = SentenceTransformer(MODEL_NAME)
    log(f"encoding {len(words)} words…")
    embeddings = model.encode(
        words,
        normalize_embeddings=True,
        convert_to_numpy=True,
        batch_size=128,
        show_progress_bar=False,
    )
    return embeddings


def compute_neighbours(
    embeddings,
    threshold: float,
    max_neighbours: int,
) -> list[list[int]]:
    """For each word, the indices of the up-to-max_neighbours other words
    whose cosine similarity is >= threshold, sorted by similarity desc."""
    import numpy as np  # type: ignore

    n = embeddings.shape[0]
    log(
        f"computing pairwise sims (~{n*n//1_000_000}M comparisons) "
        f"and filtering by threshold {threshold}…"
    )
    # Block-process to avoid allocating the full n×n similarity matrix when
    # the vocabulary gets large. With ~5k words this is ~100 MB which is
    # fine; future-proofing in case the dictionary grows.
    block = 512
    out: list[list[int]] = [[] for _ in range(n)]
    for start in range(0, n, block):
        end = min(start + block, n)
        sims = embeddings[start:end] @ embeddings.T  # (block, n) cosine sims
        for local_i, row in enumerate(sims):
            global_i = start + local_i
            row[global_i] = -1.0  # exclude self
            mask = row >= threshold
            indices = np.flatnonzero(mask)
            if indices.size > max_neighbours:
                # Sort just the candidates by similarity desc, keep top-K.
                top = np.argpartition(-row[indices], max_neighbours - 1)[:max_neighbours]
                indices = indices[top]
            # Final sort by similarity desc for readability.
            order = np.argsort(-row[indices])
            out[global_i] = [int(j) for j in indices[order]]
    sizes = [len(n) for n in out]
    log(
        f"done. neighbour-count distribution: "
        f"min={min(sizes)} median={sorted(sizes)[len(sizes)//2]} max={max(sizes)} "
        f"({sum(1 for s in sizes if s == 0)} isolated words)"
    )
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--lang", default=DEFAULT_LANG)
    p.add_argument("--min-zipf", type=float, default=DEFAULT_MIN_ZIPF)
    p.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    p.add_argument("--max-neighbours", type=int, default=DEFAULT_MAX_NEIGHBOURS)
    args = p.parse_args()

    words = load_common_words(args.lang, args.min_zipf)
    embeddings = encode(words)
    neighbours = compute_neighbours(embeddings, args.threshold, args.max_neighbours)

    payload = {
        "lang": args.lang,
        "threshold": args.threshold,
        "model": MODEL_NAME,
        "min_zipf": args.min_zipf,
        "words": words,
        "neighbours": neighbours,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    size_kb = OUT_PATH.stat().st_size / 1024
    log(f"wrote {OUT_PATH.relative_to(ROOT)} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
