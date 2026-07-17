import os

import pytest

_ENV_VARS = [
    "AUDITREACH_REDDIT_CLIENT_ID",
    "AUDITREACH_REDDIT_CLIENT_SECRET",
    "AUDITREACH_REDDIT_USERNAME",
    "AUDITREACH_REDDIT_PASSWORD",
    "AUDITREACH_YOUTUBE_API_KEY",
]


@pytest.fixture(autouse=True)
def _clean_credential_env_vars():
    """
    Every test starts with a clean slate for auditreach's BYOK env-var
    overrides, so a variable left set by one test (or by the host shell)
    never leaks into another test's assertions about keyring fallback
    behavior.
    """
    saved = {name: os.environ.pop(name, None) for name in _ENV_VARS}
    yield
    for name, value in saved.items():
        if value is not None:
            os.environ[name] = value
        else:
            os.environ.pop(name, None)
