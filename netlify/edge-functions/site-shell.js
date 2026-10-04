// Every standalone HTML destination uses the same app shell. Embedded requests
// retain the original page, including its scripts, forms, and access controls.
export default async function siteShell(request, context) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/.netlify/') || url.searchParams.get('_content') === '1') return;
  const response = await context.next();
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  const original = await response.text();
  if (original.includes('id="app-sidebar"')) return new Response(original,response);
  const shellResponse = await fetch(new URL('/index.html', url));
  if (!shellResponse.ok) return new Response(original,response);
  let shell = await shellResponse.text();
  const title = original.match(/<title>[\s\S]*?<\/title>/i)?.[0];
  if (title) shell = shell.replace(/<title>[\s\S]*?<\/title>/i,title);
  const canonical = original.match(/<link[^>]+rel="canonical"[^>]*>/i)?.[0];
  if (canonical) shell = shell.replace(/<link[^>]+rel="canonical"[^>]*>/i,canonical);
  const contentURL = url.pathname + url.search;
  const config = JSON.stringify({url:contentURL,title:title?.replace(/<[^>]+>/g,'') || 'Personality.fyi'}).replace(/</g,'\\u003c');
  shell = shell.replace('<head>', '<head><script>window.PF_CONTENT_PAGE='+config+';</script>');
  const headers = new Headers(response.headers);
  headers.delete('content-length'); headers.delete('etag'); headers.delete('content-encoding');
  return new Response(shell,{status:response.status,headers});
}
export const config = { path: '/*' };
