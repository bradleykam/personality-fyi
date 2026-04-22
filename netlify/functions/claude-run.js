// Remote Claude task runner.
//
// Receives a text instruction, sends it to Claude with a constrained edit protocol,
// commits the resulting edits to GitHub, and Netlify auto-deploys.
//
// Trigger: POST { task, secret }
// Secret: a shared secret (env: CLAUDE_RUN_SECRET) that the iOS Shortcut sends so
//         random passers-by can't spam this endpoint.
//
// Flow per request:
//   1. Verify secret
//   2. Fetch a small whitelist of files from GitHub (index.html + select others)
//   3. Call Claude API with a strict "return a JSON patch" protocol
//   4. Apply the patch (write new file contents) back to GitHub via the contents API
//   5. Netlify's GitHub integration picks up the push and auto-deploys
//
// Notes:
// - Files editable via this endpoint are limited via the FILE_ALLOWLIST constant.
//   Adding new files requires a local commit. This keeps the agent scoped.
// - Long edits can time out on Netlify's default 10s function budget. Set
//   `AWS_LAMBDA_JS_RUNTIME=nodejs18.x` and bump timeout to 26s if needed.

const FILE_ALLOWLIST = [
  'index.html',
  'netlify.toml',
  'tools/generate-blog.js',
  'supabase-schema.sql',
  'robots.txt'
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const GITHUB_TOKEN = process.env.GITHUB_PAT;
  const GITHUB_REPO = process.env.GITHUB_REPO || 'bradleykam/personality-fyi';
  const SHARED_SECRET = process.env.CLAUDE_RUN_SECRET;

  if (!ANTHROPIC_API_KEY || !GITHUB_TOKEN || !SHARED_SECRET) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server env missing' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'bad JSON' }) }; }

  const task = (body.task || '').toString().trim();
  const secret = (body.secret || '').toString();
  if (!task) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'missing task' }) };
  if (secret !== SHARED_SECRET) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'forbidden' }) };

  try {
    // 1. First pass: ask Claude which files (from the allowlist) need to change.
    //    Send just the list of file names + the task. No contents. Cheap prompt.
    const fileListMsg = `INSTRUCTION:\n${task}\n\nEDITABLE FILES (you may only propose edits to these):\n${FILE_ALLOWLIST.map(p => '- ' + p).join('\n')}\n\nReturn ONLY a JSON object: { "files": ["<path>", ...] } listing which files need edits. Empty array if nothing to change.`;
    const pickResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: 'You identify which files must change to satisfy a code task. You return ONLY a JSON object: { "files": [paths] }. No prose.',
        messages: [{ role: 'user', content: fileListMsg }]
      })
    });
    const pickData = await pickResp.json();
    if (!pickResp.ok) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'anthropic(pick)', detail: pickData }) };
    }
    let pick;
    try {
      const txt = ((pickData.content||[])[0]||{}).text || '';
      pick = JSON.parse(txt.replace(/^```(json)?/, '').replace(/```$/, '').trim());
    } catch(e) { pick = { files: [] }; }
    const targetPaths = (pick.files || []).filter(p => FILE_ALLOWLIST.includes(p));
    if (targetPaths.length === 0) {
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, noChanges: true, summary: 'no files identified for edit' }) };
    }

    // 2. Fetch only the files Claude asked for.
    const files = {};
    for (const path of targetPaths) {
      try {
        const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
          headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'personality-fyi-claude' }
        });
        if (!r.ok) continue;
        const j = await r.json();
        files[path] = { sha: j.sha, content: Buffer.from(j.content, 'base64').toString('utf8') };
      } catch (e) { console.warn('skip', path, e.message); }
    }

    // 3. Second pass: send the task + the actual file contents. Get full rewrites.
    const system = [
      'You are personality.fyi\u2019s autonomous code editor.',
      'You receive one plain-English instruction from the site owner and a set of files.',
      'You return ONLY a raw JSON object (no prose, no markdown) matching this schema:',
      '{ "edits": [ { "path": "<file>", "new_content": "<full new file content>" } ], "summary": "<one-sentence what you did>" }',
      'Rules:',
      '- Every edited file must appear in full \u2014 not a diff, not a patch. new_content replaces the file entirely.',
      '- Only edit files provided. If a change would need a file not provided, return edits: [] with a summary explaining why.',
      '- If the instruction is ambiguous, dangerous, or destructive, return edits: [] with summary: "refused: <reason>".',
      '- Keep changes minimal. Preserve all unrelated code exactly as-is.',
      '- Never change the paywall system, the auth system, the Stripe integration, or anything under /.netlify/functions/ unless the instruction explicitly names it.',
      '- Your entire response MUST be valid JSON. No fences. No commentary.'
    ].join('\n');

    const userMsg = [
      `INSTRUCTION:\n${task}`,
      '',
      'CURRENT FILES:',
      ...Object.entries(files).map(([p, f]) => `=== ${p} ===\n${f.content}`)
    ].join('\n\n');

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    const aiData = await anthropicResp.json();
    if (!anthropicResp.ok) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'anthropic', detail: aiData }) };
    }
    const rawText = (aiData.content && aiData.content[0] && aiData.content[0].text) || '';
    let plan;
    try {
      // Strip fences if the model slipped
      const cleaned = rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      plan = JSON.parse(cleaned);
    } catch (e) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'invalid JSON from model', raw: rawText.slice(0, 500) }) };
    }

    if (!Array.isArray(plan.edits) || plan.edits.length === 0) {
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, noChanges: true, summary: plan.summary || 'no changes' })
      };
    }

    // 3. Commit each edit to GitHub via the Contents API
    const results = [];
    for (const edit of plan.edits) {
      if (!FILE_ALLOWLIST.includes(edit.path)) {
        results.push({ path: edit.path, skipped: 'not in allowlist' });
        continue;
      }
      const existing = files[edit.path];
      const sha = existing ? existing.sha : undefined;
      const putResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${edit.path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'personality-fyi-claude',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `claude-run: ${(plan.summary || task).slice(0, 72)}`,
          content: Buffer.from(edit.new_content, 'utf8').toString('base64'),
          sha
        })
      });
      const putJson = await putResp.json();
      results.push({ path: edit.path, ok: putResp.ok, sha: putJson.content && putJson.content.sha, error: putResp.ok ? undefined : putJson.message });
    }

    // 4. Directly deploy the updated tree to Netlify (bypasses GitHub-build requirement).
    let deployResult = null;
    try {
      deployResult = await deployToNetlify(GITHUB_REPO, GITHUB_TOKEN, process.env.NETLIFY_PAT, process.env.NETLIFY_SITE_ID);
    } catch (e) {
      console.error('deployToNetlify failed:', e);
      deployResult = { error: e.message };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, summary: plan.summary, results, deploy: deployResult })
    };
  } catch (err) {
    console.error('claude-run error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

// ── Netlify direct-file deploy ─────────────────────────────────────
// Fetches the full repo tree from GitHub, uploads each file to Netlify via the
// file-manifest deploy API. This lets us push a live deploy without needing the
// Netlify<->GitHub OAuth integration installed.
const crypto = require('crypto');

async function deployToNetlify(repo, githubToken, netlifyToken, siteId) {
  if (!netlifyToken || !siteId) throw new Error('Netlify credentials missing');

  // 1. Get the default branch's latest tree recursively
  const treeResp = await fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, {
    headers: { 'Authorization': `Bearer ${githubToken}`, 'User-Agent': 'personality-fyi-claude' }
  });
  if (!treeResp.ok) throw new Error('github tree fetch failed: ' + treeResp.status);
  const tree = await treeResp.json();
  const blobs = (tree.tree || []).filter(x => x.type === 'blob');

  // 2. Filter out paths we don't want to deploy (functions dir, tools dir, config files)
  //    Netlify handles functions separately; tools are local dev; don't deploy those.
  const EXCLUDE_PATTERNS = [
    /^netlify\/functions\//,
    /^tools\//,
    /^node_modules\//,
    /^\.github\//,
    /^package.*\.json$/,
    /^\.gitignore$/,
    /^\.netlify/
  ];
  const includeBlobs = blobs.filter(b => !EXCLUDE_PATTERNS.some(rx => rx.test(b.path)));

  // 3. Fetch each file's raw bytes and compute its sha1 (Netlify uses sha1)
  const files = {};            // "/path" -> sha1
  const contents = {};         // sha1 -> Buffer
  for (const b of includeBlobs) {
    const blobResp = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${b.sha}`, {
      headers: { 'Authorization': `Bearer ${githubToken}`, 'User-Agent': 'personality-fyi-claude' }
    });
    if (!blobResp.ok) { console.warn('skip blob', b.path); continue; }
    const blobJson = await blobResp.json();
    const buf = Buffer.from(blobJson.content || '', blobJson.encoding || 'base64');
    const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
    files['/' + b.path] = sha1;
    contents[sha1] = buf;
  }

  // 4. Create a deploy with the manifest
  const createResp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${netlifyToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, async: false })
  });
  const createJson = await createResp.json();
  if (!createResp.ok) throw new Error('netlify create deploy failed: ' + JSON.stringify(createJson).slice(0, 300));
  const deployId = createJson.id;
  const required = createJson.required || [];

  // 5. Upload each required file
  for (const sha1 of required) {
    // Find path for this sha1
    const entry = Object.entries(files).find(([, v]) => v === sha1);
    if (!entry) continue;
    const path = entry[0];
    const buf = contents[sha1];
    if (!buf) continue;
    const upResp = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}/files${path}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${netlifyToken}`, 'Content-Type': 'application/octet-stream' },
      body: buf
    });
    if (!upResp.ok) {
      const txt = await upResp.text();
      console.warn('upload failed', path, upResp.status, txt.slice(0, 200));
    }
  }

  return { deploy_id: deployId, uploaded: required.length, total_files: Object.keys(files).length };
}
