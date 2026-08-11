Deno.serve((request) => {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') === 'success' ? 'success' : 'cancel';
  const success = status === 'success';
  const title = success ? 'GroSharey subscription active' : 'Checkout canceled';
  const message = success
    ? 'Payment was received. You can return to GroSharey now.'
    : 'Nothing was charged. You can return to GroSharey and try again whenever you are ready.';

  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#F4F7F2;color:#102C25;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:420px;background:#fff;border:1px solid #dfe5df;border-radius:28px;padding:32px;margin:20px;text-align:center}a{display:inline-block;margin-top:18px;padding:14px 22px;background:#164f42;color:white;border-radius:14px;text-decoration:none;font-weight:700}</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p><a href="grosharey:///">Open GroSharey</a></div></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
