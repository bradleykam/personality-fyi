# Quora MBTI question monitor

Finds recent MBTI questions on Quora, drafts a reply for each via Claude, writes a local `quora_drafts.html` you can open in a browser and copy-paste from.

## Install

```bash
cd tools/quora
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

Create a `.env` in this directory (or at the repo root):
```
ANTHROPIC_API_KEY=sk-ant-...
```

## First-time login

```bash
python quora_auth.py
```
A browser window opens. Log into Quora manually. When you see your Quora home feed, press Enter in the terminal. Your session is saved to `quora_session.json`.

Re-run `quora_auth.py` whenever the script reports "Quora session expired — re-run auth script to refresh cookies."

## Daily run

```bash
python quora_monitor.py
```

Opens `quora_drafts.html` — that's today's batch. It overwrites each run.

## Cron

```
15 9 * * * cd /Users/bradk/Desktop/typeread_backup/tools/quora && /usr/bin/env python3 quora_monitor.py >> monitor.log 2>&1
```

## Files

- `quora_auth.py` — one-time manual-login flow
- `quora_monitor.py` — daily runner (discovery + draft + HTML output)
- `quora_session.json` — saved cookies (gitignored)
- `quora_seen.json` — URLs already drafted (gitignored)
- `quora_drafts.html` — today's output (gitignored)
- `.env` — API key (gitignored)

## Notes

- Quora's DOM changes often. If searches return 0 candidates or answer bodies come back empty, selectors in `quora_monitor.py` (particularly `EXTRACT_JS` and the selector inside `fetch_top_answers`) may need a tweak. Log output from each run tells you where to look.
- Automated access to Quora is against their ToS. Use at your own risk and respect rate limits.
