#!/usr/bin/env python3
"""quora_auth.py — one-time Quora login.

Opens a Playwright browser window pointing at Quora. You log in manually in that
window. As soon as the auth cookie appears, cookies are saved to
quora_session.json and the browser closes automatically. No terminal input needed.

Usage:
    pip install playwright
    python -m playwright install chromium
    python quora_auth.py
"""
from __future__ import annotations
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

SESSION_FILE = Path(__file__).resolve().parent / 'quora_session.json'
AUTH_COOKIE_NAMES = {'m-b', 'm-s', 'q-m', 'm-b-lc'}
POLL_SECONDS = 2
TIMEOUT_MINUTES = 10


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={'width': 1280, 'height': 900},
        )
        page = await context.new_page()
        await page.goto('https://www.quora.com/', wait_until='domcontentloaded')

        print('Browser opened. Log in to Quora in the window that just appeared.')
        print(f'Watching for login cookie (timeout {TIMEOUT_MINUTES} min)...')

        elapsed = 0
        saved = False
        while elapsed < TIMEOUT_MINUTES * 60:
            cookies = await context.cookies()
            has_auth = any(
                c.get('name') in AUTH_COOKIE_NAMES and 'quora.com' in (c.get('domain') or '')
                for c in cookies
            )
            if has_auth:
                state = await context.storage_state()
                SESSION_FILE.write_text(json.dumps(state, indent=2))
                print(f'Login detected. Saved {len(state.get("cookies", []))} cookies to {SESSION_FILE}')
                saved = True
                break
            await asyncio.sleep(POLL_SECONDS)
            elapsed += POLL_SECONDS

        if not saved:
            print('Timed out waiting for login.')

        await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
