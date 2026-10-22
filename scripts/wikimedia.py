"""Access to the Wikimedia services under their rules: a User-Agent with a
contact address (otherwise the limit drops to 10 requests a minute), at most
3 requests in parallel, and Retry-After honoured."""
import os
import time

import requests

MAX_PARALLEL = 3
# Pause after each request, per worker: 200 requests a minute at most.
PAUSE = float(os.environ.get("WIKIMEDIA_PAUSE", "0.4"))


def user_agent():
    value = os.environ.get("WIKIMEDIA_USER_AGENT", "")
    if "@" not in value and "https://" not in value:
        raise SystemExit(
            'Set WIKIMEDIA_USER_AGENT with a contact, an e-mail address or a URL, for example '
            '"WorldUp/1.0 (https://github.com/axel-lung/world_up)".'
        )
    return value


def session(**headers):
    s = requests.Session()
    s.headers.update({"User-Agent": user_agent(), **headers})
    return s


def request(s, method, url, timeout=120, **kwargs):
    """Sends the request, waiting as long as Retry-After asks on a 429 or 503."""
    for attempt in range(8):
        r = s.request(method, url, timeout=timeout, **kwargs)
        if r.status_code not in (429, 503):
            r.raise_for_status()
            return r
        value = r.headers.get("retry-after", "")
        wait = int(value) + 1 if value.isdigit() else 10 * (attempt + 1)
        print(f"HTTP {r.status_code}, waiting {wait} s", flush=True)
        time.sleep(wait)
    raise SystemExit(f"{url}: still refused after 8 attempts")
