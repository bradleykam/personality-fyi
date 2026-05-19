#!/usr/bin/env python3
"""find_popular.py — one-off: find popular MBTI Quora questions by answer count.

Flow:
  1. Use ddgs to pull candidate MBTI question URLs from DuckDuckGo (no login).
  2. Visit each with Playwright (to get the JS-rendered answer-count element).
  3. Sort by answer count desc. Print top 20.
"""
from __future__ import annotations
import asyncio
import re
import time
from urllib.parse import urlparse

from ddgs import DDGS
from playwright.async_api import async_playwright

QUERIES = [
    'MBTI',
    'Myers Briggs',
    'INTJ personality',
    'ENFP personality',
    'INFJ personality',
    'introvert extrovert',
    'cognitive functions MBTI',
]

EXCLUDE = re.compile(r'\bcareer|\bjob|\bworkplace|\bresume|\bsalary', re.IGNORECASE)
NON_QUESTION = {
    'login', 'signup', 'about', 'careers', 'press', 'contact', 'privacy',
    'search', 'feed', 'topic', 'profile', 'notifications', 'answer',
    'home', 'q', 'pin',
}


def is_question(url: str) -> bool:
    path = urlparse(url).path.strip('/')
    if not path or '/' in path:
        return False
    first = path.split('?')[0].lower()
    return first not in NON_QUESTION


def title_from_url(url: str) -> str:
    slug = urlparse(url).path.strip('/').split('/')[0]
    return slug.replace('-', ' ')


def collect_urls() -> list[str]:
    seen = set()
    urls = []
    with DDGS() as ddg:
        for q in QUERIES:
            try:
                results = list(ddg.text(f'site:quora.com {q}', max_results=30, timelimit='y'))
            except Exception as exc:
                print(f'  "{q}" error: {exc}')
                continue
            added = 0
            for r in results:
                href = (r.get('href') or '').split('?')[0].split('#')[0].rstrip('/')
                if href.startswith('http://'):
                    href = 'https://' + href[len('http://'):]
                if not href or href in seen:
                    continue
                if 'quora.com' not in href or not is_question(href):
                    continue
                title = title_from_url(href)
                if not re.search(r'mbti|myers|personality|intj|intp|entj|entp|infj|infp|enfj|enfp|istj|isfj|estj|esfj|istp|isfp|estp|esfp|introvert|extrovert|cognitive function', title, re.IGNORECASE):
                    continue
                if EXCLUDE.search(title):
                    continue
                seen.add(href)
                urls.append(href)
                added += 1
            print(f'  "{q}" → {added} new URLs')
            time.sleep(1.0)
    return urls


async def answer_counts(urls: list[str]) -> list[dict]:
    out: list[dict] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 900},
        )
        page = await context.new_page()
        for i, url in enumerate(urls, 1):
            try:
                await page.goto(url, wait_until='domcontentloaded', timeout=25000)
                await asyncio.sleep(2.5)
                # Extract answer count text from the DOM. Quora usually shows "X Answers" in a header.
                data = await page.evaluate("""() => {
                    const txt = document.body.innerText || '';
                    // Try multiple patterns
                    const pats = [
                        /(\\d[\\d,]*)\\s+Answers?\\b/i,
                        /(\\d[\\d,]*)\\s+answers were posted/i,
                    ];
                    for (const p of pats) {
                        const m = txt.match(p);
                        if (m) return { count: parseInt(m[1].replace(/,/g,''), 10), raw: m[0] };
                    }
                    return { count: null, raw: '' };
                }""")
                count = data.get('count')
                print(f'  [{i}/{len(urls)}] {count or "—":>6}  {title_from_url(url)[:80]}')
                out.append({'url': url, 'title': title_from_url(url), 'answers': count})
            except Exception as exc:
                print(f'  [{i}/{len(urls)}] ERR {exc}')
                out.append({'url': url, 'title': title_from_url(url), 'answers': None})
            # small delay to be polite
            await asyncio.sleep(0.5)
        await browser.close()
    return out


async def main() -> None:
    print('Collecting Quora URLs via DuckDuckGo...')
    urls = collect_urls()
    print(f'Total candidates: {len(urls)}')
    if not urls:
        return
    # Cap at 60 to keep runtime reasonable
    urls = urls[:60]
    print(f'Fetching answer counts for {len(urls)} questions...')
    results = await answer_counts(urls)
    results.sort(key=lambda r: (r['answers'] or 0), reverse=True)
    print()
    print('=== Top 20 by answer count ===')
    for r in results[:20]:
        c = r['answers'] if r['answers'] is not None else '—'
        print(f'  {str(c):>6}  {r["url"]}')


if __name__ == '__main__':
    asyncio.run(main())
