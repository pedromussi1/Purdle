"""Shared Gemini JSON-call helper with retry + exponential backoff.

Every generator's `call_gemini` previously issued a single `generate_content`
and returned None on any exception — so one transient rate-limit (429) or
network blip dropped the whole day to the (unvalidated) fallback path. Since
the daily crons fire close together, that happened constantly and the archives
became mostly fallback. This helper rides out transient errors before giving
up, so the LLM path actually runs.
"""

from __future__ import annotations

import json
import time

GEMINI_MAX_RETRIES = 5


def generate_json(client, types, *, model, prompt, temperature, log):
    """Call Gemini expecting a STRICT-JSON response and return the parsed dict.

    Retries transient errors with exponential backoff (1, 2, 4, 8s); returns
    None only after the final attempt fails or the response won't parse.
    `log` is the caller's logger (msg, *, level=...)."""
    for attempt in range(GEMINI_MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=temperature,
                ),
            )
            return json.loads(response.text)
        except Exception as e:
            if attempt == GEMINI_MAX_RETRIES - 1:
                log(f"Gemini call failed after {GEMINI_MAX_RETRIES} attempts: {e}", level="warn")
                return None
            time.sleep(2 ** attempt)
    return None
