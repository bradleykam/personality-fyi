#!/usr/bin/env python3
"""quora_monitor.py — daily Quora question discovery + Claude-drafted answers.

Login-free version: questions are discovered via DuckDuckGo (site:quora.com).
No Playwright, no cookies, no Quora session needed.

Cron / launchd schedule (currently runs daily 9:15am via ~/Library/LaunchAgents/com.personalityfyi.quora-monitor.plist):
    15 9 * * *  .venv/bin/python quora_monitor.py >> monitor.log 2>&1

Flow:
  1. For each MBTI search query, fetch DuckDuckGo results restricted to quora.com
     from the past month (&df=m). Parse result URLs.
  2. Keep only question URLs. Derive question text from the URL slug
     (Quora URLs already encode the question, e.g. /What-is-an-INFJ → "What is an INFJ").
  3. Dedupe against quora_seen.json.
  4. Filter out career/job/workplace questions.
  5. Take up to 10 (no view count available without login, so order is as-returned).
  6. For each question, call /claude on personality.fyi to draft a reply.
  7. Write quora_drafts.html.
  8. Append drafted URLs to quora_seen.json.

Dependencies:
    pip install requests
"""
from __future__ import annotations
import html
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, unquote, quote_plus

try:
    import requests
except ImportError:
    print('requests is required: pip install requests')
    sys.exit(1)

try:
    from ddgs import DDGS
except ImportError:
    print('ddgs is required: pip install ddgs')
    sys.exit(1)


# ── Config ─────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
SEEN_FILE = ROOT / 'quora_seen.json'
OUTPUT_FILE = ROOT / 'quora_drafts.html'

SEARCH_QUERIES = [
    'MBTI',
    'Myers Briggs',
    'personality type',
    'introvert extrovert',
    'INFJ INTJ ENFP ENTP',
]

EXCLUDE_PATTERNS = [
    r'\bcareer(s)?\b', r'\bjob(s)?\b', r'\bworkplace\b',
    r'\bsalary\b', r'\bresume\b', r'\bhiring\b', r'\binterview(s|ing)?\b',
    r'\bprofession(s|al)?\b', r'\bemployer\b', r'\bemployee\b',
    r'\bmake money\b', r'\bbest (careers?|jobs?)\b',
]
EXCLUDE_RX = [re.compile(p, re.IGNORECASE) for p in EXCLUDE_PATTERNS]

MAX_DRAFTS = 10
CLAUDE_MODEL = 'claude-sonnet-4-20250514'
CLAUDE_MAX_TOKENS = 600
CLAUDE_ENDPOINT = 'https://personality.fyi/.netlify/functions/claude'

CLAUDE_SYSTEM = (
    "You answer Quora questions about MBTI and personality types. Write a "
    "specific, genuinely useful answer to the question. Reference personality.fyi "
    "naturally at most once — only if directly relevant. Never sound promotional. "
    "Do not mention careers or job fit. Direct, conversational tone. 200–350 words."
)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)



# ── Seen-URL persistence ──────────────────────────────────────────
def load_seen():
    if not SEEN_FILE.exists():
        return set()
    try:
        return set(json.loads(SEEN_FILE.read_text()))
    except Exception:
        return set()


def save_seen(seen):
    SEEN_FILE.write_text(json.dumps(sorted(seen), indent=2))


# ── URL → question text ───────────────────────────────────────────
def question_from_url(url: str) -> str:
    """Derive the question text from a Quora URL's slug.
    /What-does-it-mean-to-be-an-INFJ → 'What does it mean to be an INFJ'
    If the slug ends with a hash/answer slug we strip it.
    """
    path = urlparse(url).path
    # Strip leading slash and any trailing segments after the first
    # (Quora slugs are at the top level: /Slug-here)
    parts = [p for p in path.split('/') if p]
    if not parts:
        return ''
    slug = parts[0]
    # Replace dashes with spaces, handle URL encoding
    text = unquote(slug).replace('-', ' ').strip()
    # Quora sometimes adds a ?share or numeric suffix; clean
    text = re.sub(r'\s+', ' ', text)
    # Ensure it ends with a ? if it's clearly a question
    if text and not text.endswith('?') and re.match(r'^(what|why|how|who|where|when|are|is|do|does|can|should|would|could|will|which|if)\b', text, re.IGNORECASE):
        text += '?'
    return text


# ── DuckDuckGo search via ddgs (handles their anti-bot challenges) ─
def ddg_search(query: str, max_results: int = 30) -> list[str]:
    """Run `site:quora.com <query>` via the ddgs package, past-month filter."""
    q = f'site:quora.com {query}'
    try:
        with DDGS() as ddg:
            results = list(ddg.text(q, max_results=max_results, timelimit='m'))
    except Exception as exc:
        print(f'  DDG error for "{query}": {exc}')
        return []
    return [r.get('href') for r in results if r.get('href')]


# ── Filter + rank ─────────────────────────────────────────────────
def is_excluded(text: str) -> bool:
    return any(rx.search(text) for rx in EXCLUDE_RX)


def looks_mbti(text: str) -> bool:
    t = text.lower()
    return bool(re.search(
        r'mbti|myers[- ]?briggs|personality type|introvert|extrovert|cognitive function|[ie][ns][tf][jp]',
        t
    ))


def is_question_url(url: str) -> bool:
    """Quora question URLs have exactly one path segment (the slug). Profiles, topics,
    answers, etc. have deeper paths — filter those out."""
    path = urlparse(url).path.strip('/')
    if not path:
        return False
    if '/' in path:
        # Exception: Quora sometimes has /q/slug/... — treat the /q/ form as a question too.
        return path.startswith('q/')
    # Exclude known non-question top-level slugs
    non_q = {'login', 'signup', 'about', 'careers', 'press', 'contact', 'privacy',
             'search', 'feed', 'topic', 'profile', 'notification', 'answer',
             'home', 'notifications', 'q', 'pin'}
    first = path.split('?')[0].lower()
    return first not in non_q


def gather_candidates(seen: set[str]) -> list[dict]:
    """Run all queries, dedupe, filter. Returns up to MAX_DRAFTS dicts."""
    seen_in_this_run: set[str] = set()
    out: list[dict] = []
    for q in SEARCH_QUERIES:
        urls = ddg_search(q, max_results=30)
        print(f'  "{q}" → {len(urls)} raw URLs')
        for url in urls:
            clean = url.split('?')[0].split('#')[0].rstrip('/')
            # Normalize protocol
            if clean.startswith('http://'):
                clean = 'https://' + clean[len('http://'):]
            if clean in seen or clean in seen_in_this_run:
                continue
            if not is_question_url(clean):
                continue
            text = question_from_url(clean)
            if not text or len(text) < 15:
                continue
            if is_excluded(text):
                continue
            if not looks_mbti(text):
                continue
            seen_in_this_run.add(clean)
            out.append({'url': clean, 'text': text, 'answer_count': None, 'view_count': None})
            if len(out) >= MAX_DRAFTS:
                return out
        # polite delay
        time.sleep(1.2)
    return out


# ── Claude draft via /claude Netlify function ─────────────────────
def draft_answer(question: dict) -> str:
    user_msg = f'Question: "{question["text"]}"\n\nWrite the reply now.'
    payload = {
        'model': CLAUDE_MODEL,
        'max_tokens': CLAUDE_MAX_TOKENS,
        'system': CLAUDE_SYSTEM,
        'messages': [{'role': 'user', 'content': user_msg}],
    }
    try:
        r = requests.post(CLAUDE_ENDPOINT, json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        return f'[Claude error: {exc}]'
    content = data.get('content') or []
    if not content:
        err = data.get('error', {}).get('message') if isinstance(data.get('error'), dict) else data.get('error')
        return f'[empty response{": " + err if err else ""}]'
    first = content[0]
    return (first.get('text') if isinstance(first, dict) else str(first)).strip()


# ── HTML output ───────────────────────────────────────────────────
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Quora drafts — {date}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f5f1; color: #111; margin: 0; padding: 2rem; line-height: 1.6; }}
  .wrap {{ max-width: 780px; margin: 0 auto; }}
  header {{ border-bottom: 1px solid #d4cfc7; padding-bottom: 1rem; margin-bottom: 2rem; }}
  h1 {{ font-size: 22px; margin: 0 0 0.25rem; }}
  .meta {{ font-size: 13px; color: #7a7670; letter-spacing: 0.03em; text-transform: uppercase; }}
  .q {{ background: #fff; border: 1px solid #d4cfc7; border-radius: 6px; padding: 1.25rem 1.5rem; margin-bottom: 1.25rem; }}
  .q h2 {{ font-size: 17px; margin: 0 0 0.5rem; }}
  .q h2 a {{ color: #111; text-decoration: none; }}
  .q h2 a:hover {{ color: #c8411a; text-decoration: underline; }}
  .q .info {{ font-size: 12px; color: #7a7670; margin-bottom: 0.75rem; }}
  .draft {{ background: #fafaf7; border: 1px solid #ece9e2; border-radius: 4px; padding: 1rem 1.25rem; font-size: 14px; white-space: pre-wrap; }}
  .row {{ display: flex; justify-content: flex-end; gap: 8px; margin-top: 0.5rem; }}
  .btn {{ font-family: inherit; font-size: 12px; padding: 6px 12px; border: 1px solid #d4cfc7; border-radius: 4px; background: #fff; color: #333; cursor: pointer; }}
  .btn:hover {{ border-color: #111; color: #111; }}
  hr {{ border: 0; border-top: 1px solid #ece9e2; margin: 1.5rem 0; }}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>Quora drafts</h1>
  <div class="meta">Generated: {date} · {count} draft{plural}</div>
</header>
{body}
</div>
<script>
function copyText(btn) {{
  const pre = btn.parentElement.previousElementSibling;
  const text = pre.textContent || pre.innerText || '';
  navigator.clipboard.writeText(text).then(() => {{
    const orig = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => btn.textContent = orig, 1500);
  }});
}}
</script>
</body>
</html>
"""


def render_html(drafts: list[dict]) -> str:
    parts = []
    for d in drafts:
        info = 'Source: DuckDuckGo (site:quora.com, past month)'
        parts.append(
            '<div class="q">'
            f'<h2><a href="{html.escape(d["url"])}" target="_blank" rel="noopener">{html.escape(d["text"])}</a></h2>'
            f'<div class="info">{html.escape(info)}</div>'
            f'<div class="draft">{html.escape(d["draft"])}</div>'
            '<div class="row"><button class="btn" onclick="copyText(this)">Copy draft</button></div>'
            '</div>'
        )
    body = '\n<hr>\n'.join(parts) if parts else '<p>No new questions this run.</p>'
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    n = len(drafts)
    return HTML_TEMPLATE.format(date=now, count=n, plural='' if n == 1 else 's', body=body)


# ── Main ──────────────────────────────────────────────────────────
def main() -> None:
    seen = load_seen()
    print(f'{len(seen)} URLs already seen.')
    print('Discovering questions via DuckDuckGo…')
    candidates = gather_candidates(seen)
    print(f'  {len(candidates)} fresh candidates after filters')

    if not candidates:
        OUTPUT_FILE.write_text(render_html([]))
        print(f'Wrote empty {OUTPUT_FILE}. No new questions.')
        return

    drafts: list[dict] = []
    for i, q in enumerate(candidates, 1):
        print(f'  [{i}/{len(candidates)}] {q["text"][:70]}…')
        q['draft'] = draft_answer(q)
        drafts.append(q)
        time.sleep(0.4)

    OUTPUT_FILE.write_text(render_html(drafts))
    print(f'Wrote {OUTPUT_FILE} ({len(drafts)} drafts).')

    for d in drafts:
        seen.add(d['url'])
    save_seen(seen)
    print(f'Updated {SEEN_FILE} (now {len(seen)} URLs seen).')


if __name__ == '__main__':
    main()
