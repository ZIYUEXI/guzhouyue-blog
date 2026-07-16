type PagesEnv = {
  TENCENT_BACKEND_ORIGIN?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
};

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function copyProxyHeaders(headers: Headers) {
  const copied = new Headers();
  headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      copied.set(key, value);
    }
  });
  return copied;
}

function isAllowedPublicApiRequest(request: Request, pathname: string) {
  if (request.method === 'GET' && pathname === '/api/health') {
    return true;
  }

  return request.method === 'POST' && /^\/api\/articles\/[^/]+\/comments$/.test(pathname);
}

export const onRequest: PagesFunction<PagesEnv> = async ({ request, env }) => {
  const backendOrigin = env.TENCENT_BACKEND_ORIGIN?.replace(/\/+$/, '');
  if (!backendOrigin) {
    return Response.json({ error: 'TENCENT_BACKEND_ORIGIN is not configured.' }, { status: 502 });
  }

  const requestUrl = new URL(request.url);
  if (!isAllowedPublicApiRequest(request, requestUrl.pathname)) {
    return Response.json({ error: 'This API route is not exposed on the public site.' }, { status: 404 });
  }

  const targetUrl = new URL(`${backendOrigin}${requestUrl.pathname}${requestUrl.search}`);
  const headers = copyProxyHeaders(request.headers);
  headers.set('X-Forwarded-Host', requestUrl.host);
  headers.set('X-Forwarded-Proto', requestUrl.protocol.replace(':', ''));
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers.set('CF-Access-Client-Id', env.CF_ACCESS_CLIENT_ID);
    headers.set('CF-Access-Client-Secret', env.CF_ACCESS_CLIENT_SECRET);
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  const responseHeaders = copyProxyHeaders(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
