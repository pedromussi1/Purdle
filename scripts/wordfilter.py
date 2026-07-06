"""Shared content filter for the puzzle generators.

wordfreq ranks by raw corpus frequency and embeddings only capture meaning,
so neither screens out two categories that must never reach a family word
puzzle:

  1. **Proper nouns** — names, places, brands, mythological/political figures.
     wordfreq scores them like common nouns, so at any Zipf floor they leak in
     as "words" (TONGA, PUTIN, OSCAR, ...).
  2. **Offensive / vulgar / slur terms.** These must be excluded not just as a
     puzzle's start/end word but as an *intermediate* step — a Synonymy or
     Ladder chain can route START→END straight through a slur.

`is_blocked(word)` is the single entry point every generator should use.
`BLOCKLIST` (proper nouns) is also exported for callers that pre-filter a word
pool. better-profanity, when installed, is used as an additional backstop, but
the explicit sets below stand on their own so filtering works even where that
optional dependency is absent (e.g. local runs).
"""

from __future__ import annotations

# ---------- Proper nouns ----------
# wordfreq doesn't separate proper nouns from common nouns, so these sneak
# through any Zipf filter. Categories: initialisms, geographic/political proper
# nouns, common first names, brand/product names, religious/mythological figures.
BLOCKLIST: set[str] = {
    # Initialisms / acronyms
    "lgbt", "isis", "usa", "uk", "eu", "un", "ussr", "nato", "nasa",
    "fbi", "cia", "irs", "ipad", "irc", "ftp", "html", "ceo", "cfo",
    # Geographic / political proper nouns
    "iraq", "iran", "cuba", "asia", "utah", "ohio", "iowa", "maui",
    "peru", "oman", "rome", "eden", "troy", "yale", "ucla", "tokyo",
    "paris", "chile", "china", "india", "italy", "japan", "libya",
    "syria", "egypt", "kenya", "haiti", "wales", "texas", "spain",
    "miami", "boise", "tulsa", "boston", "berlin", "vienna", "kabul",
    "tonga", "ghana", "congo", "sudan", "qatar", "nepal", "samoa",
    "aruba", "malta", "kerry", "arab", "arabs",
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
    "molly", "diane", "sally", "oscar", "kitty",
    # Brand names
    "covid", "amazon", "google", "apple", "nike", "sony", "ford",
    "jeep", "gucci", "uber", "lyft", "tesla", "intel", "cisco",
    # Religious / mythological figures
    "jesus", "allah", "islam", "judaism", "satan", "buddha",
    "thor", "zeus", "odin", "hera", "loki", "mars", "venus",
    "apollo",
}

# ---------- Offensive / vulgar / slur terms ----------
# Explicit list so filtering doesn't depend on better-profanity being present.
# Kept deliberately broad for a family puzzle: profanity, anatomical/sexual
# vulgarity, and slurs. Length-agnostic — used by the 3–5 letter games too.
OFFENSIVE: set[str] = {
    # profanity
    "shit", "fuck", "crap", "damn", "piss", "cunt", "twat", "arse",
    "bitch", "whore", "slut", "bimbo", "prick", "dick", "cock",
    "wank", "turds", "turd", "fart", "farts",
    # anatomical / sexual
    "penis", "pussy", "vulva", "labia", "semen", "boobs", "boob",
    "tits", "titty", "teats", "pubes", "horny", "sperm", "porn",
    "orgy", "orgasm", "erect", "erection",
    # slurs (racial / homophobic / ableist)
    "spic", "kike", "chink", "gook", "wop", "dago", "coon", "negro",
    "fag", "fags", "faggot", "dyke", "tranny", "retard", "spaz",
    "cripple", "midget",
}


_PROFANITY_READY = False
_PROFANITY = None


def _profanity_check(word: str) -> bool:
    """Optional better-profanity backstop. Loads once; silently no-ops if the
    library isn't installed."""
    global _PROFANITY_READY, _PROFANITY
    if not _PROFANITY_READY:
        _PROFANITY_READY = True
        try:
            from better_profanity import profanity  # type: ignore
            profanity.load_censor_words()
            _PROFANITY = profanity
        except ImportError:
            _PROFANITY = None
    if _PROFANITY is None:
        return False
    return bool(_PROFANITY.contains_profanity(word))


def is_blocked(word: str) -> bool:
    """True if `word` is a proper noun, offensive term, or flagged by
    better-profanity (when available). Case-insensitive."""
    w = word.lower().strip()
    if not w:
        return False
    if w in BLOCKLIST or w in OFFENSIVE:
        return True
    return _profanity_check(w)
