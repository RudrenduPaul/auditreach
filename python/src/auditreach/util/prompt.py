"""
Interactive prompts for `auditreach auth`. Ported from src/util/prompt.ts.

The TypeScript version hand-rolls raw-terminal keystroke handling to echo
'*' for each character of a secret. This port uses the stdlib `getpass`
module instead: it achieves the same goal (a secret typed at a prompt never
appears in scrollback or a screen-share) with less custom terminal-handling
code, at the cost of not echoing an asterisk per keystroke -- `getpass`
shows nothing at all while typing, which is the standard, well-audited
approach for secret prompts in Python and a strictly more conservative
default than character-echoing.
"""
from __future__ import annotations

import getpass


def prompt_text(question: str) -> str:
    """Prompts for a plain-text value (non-secret). Echoes normally."""
    return input(question).strip()


def prompt_secret(question: str) -> str:
    """
    Prompts for a secret value (API key, client secret, password) without
    echoing it back to the terminal.
    """
    return getpass.getpass(question)
