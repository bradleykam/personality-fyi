#!/usr/bin/env python3
"""Second debug: visit home first to let session settle, then search."""
from __future__ import annotations
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

SESSION = Path(__file__).resolve().parent / 'quora_session.json'


async def main() -> None:
    state = json.loads(SESSION.read_text())
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)   # headed to see what's happening
        context = await browser.new_context(
            storage_state=state,
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={'width': 1280, 'height': 900},
        )
        page = await context.new_page()

        # Step 1: visit home
        await page.goto('https://www.quora.com/', wait_until='networkidle', timeout=30000)
        title1 = await page.title()
        url1 = page.url
        is_logged_in = await page.evaluate("""() => {
            // Logged-in indicators: avatar nav, /feed path, specific div
            return !!document.querySelector('[aria-label="Your own profile page"], a[href="/notifications"], a[href*="/profile/"]');
        }""")
        print(f'Home: title={title1!r}, url={url1}, logged_in_heuristic={is_logged_in}')

        # Step 2: go to search
        await page.goto('https://www.quora.com/search?q=MBTI&type=question&time=month', wait_until='networkidle', timeout=30000)
        await asyncio.sleep(3)
        title2 = await page.title()
        url2 = page.url
        print(f'Search: title={title2!r}, url={url2}')

        # Count useful anchors
        count = await page.evaluate("""() => {
            const a = document.querySelectorAll('a');
            const useful = Array.from(a).filter(x => {
              const h = x.getAttribute('href') || '';
              return /quora\\.com\\/[A-Za-z0-9]/.test(h) && !/\\/(login|signup|feed|notif|answer|topic|search|about)/i.test(h);
            });
            return { total: a.length, useful: useful.length, samples: useful.slice(0, 5).map(x => ({
              href: x.getAttribute('href'),
              text: (x.textContent || '').trim().slice(0, 150)
            })) };
        }""")
        print('Anchor summary:', json.dumps(count, indent=2))

        input('Press enter to close...')
        await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
