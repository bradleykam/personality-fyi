# MBTI influencer roster

Goal: a comprehensive, verified roster of creators producing MBTI / Myers-Briggs / personality-typing content across YouTube, Substack, Instagram, X, TikTok, and podcasts.

## Files

- `mbti-influencers.csv` — canonical roster. Append-only. De-duplicated by canonical URL or handle.
- `seen-handles.txt` — running de-dupe set (one canonical key per line).
- `seed-queries.txt` — search queries used to discover candidates.
- `notes.md` — research log per batch.

## Schema (mbti-influencers.csv)

```
display_name,primary_channel,youtube_url,substack_url,instagram_url,x_url,tiktok_url,podcast_url,website_url,bio_short,topic_focus,source
```

- `display_name` — public name as creator presents (e.g. "Heidi Priebe")
- `primary_channel` — one of: youtube, substack, instagram, x, tiktok, podcast, website
- `*_url` — full URL or empty
- `bio_short` — under 160 chars, scraped from one of the channel bios
- `topic_focus` — comma-separated tags, e.g. "INTJ, cognitive functions, type compatibility"
- `source` — discovery query that surfaced them (for traceability)

## Adding rows

1. Run a discovery agent with a fresh seed query (see seed-queries.txt).
2. Verify each candidate has at least one live MBTI-focused channel.
3. Look up cross-platform handles from their bio / link-in-bio site.
4. Append to mbti-influencers.csv.
5. Add the canonical key (lowest-position non-empty URL) to seen-handles.txt.

## Target

Thousands of rows. We grow incrementally — 50–200 verified rows per research pass.
