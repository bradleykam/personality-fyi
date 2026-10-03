/* Edge Function: geo-gate
 *
 * Blocks the ENTIRE site for visitors in sanctioned / restricted countries,
 * per US sanctions compliance. Runs on every path ('/*'). If the visitor's
 * country is on the blocklist, returns HTTP 451 (Unavailable For Legal
 * Reasons) and the request never reaches the app, signup, or any function —
 * so blocked-country visitors cannot sign up and therefore can never be in
 * the user list to receive an email.
 *
 * Comprehensively US-embargoed: CU, IR, KP, SY.
 * Added per owner request (targeted/sectoral sanctions): RU, BY, VE, MV, LB,
 * YE, SD, ZW.
 *
 * To change the list, edit BLOCKED below. Keep it in sync with the same
 * constant in netlify/functions/welcome-emails.js.
 */

const BLOCKED = new Set([
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'IQ', // Iraq
  'RU', // Russia
  'BY', // Belarus
  'VE', // Venezuela
  'MV', // Maldives
  'LB', // Lebanon
  'YE', // Yemen
  'SD', // Sudan
  'ZW', // Zimbabwe
]);

const BLOCK_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Not available in your region</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#faf9f6;color:#1a1a1a;
       display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center;padding:24px}
  .box{max-width:460px}
  h1{font-size:22px;margin:0 0 12px}
  p{font-size:15px;line-height:1.55;color:#555}
</style></head>
<body><div class="box">
  <h1>Personality.fyi isn't available in your region</h1>
  <p>Due to US sanctions and trade compliance requirements, Personality.fyi cannot be accessed from your location.</p>
  <p>If you believe you are seeing this in error, contact <a href="mailto:brad@personality.fyi">brad@personality.fyi</a>.</p>
</div></body></html>`;

export default async (request, context) => {
  const code = context.geo?.country?.code;
  if (code && BLOCKED.has(code.toUpperCase())) {
    return new Response(BLOCK_PAGE, {
      status: 451,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Geo-Block': code.toUpperCase(),
      },
    });
  }
  // Allowed (or country unknown): continue the edge chain / serve normally.
  // Stamp the visitor's country in a cookie so the app can persist it as
  // signup_country at login (powers the admin dashboard's Country column and
  // the country-based email geo-block fallback).
  const res = await context.next();
  if (code) {
    try {
      res.headers.append(
        'Set-Cookie',
        'pf_country=' + code.toUpperCase() + '; Path=/; Max-Age=2592000; SameSite=Lax',
      );
    } catch (_) {}
  }
  return res;
};

export const config = { path: '/*' };
