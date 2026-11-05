// 在内存中执行真实 Pages Function，验证工具路由白名单和认证头转发。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const source = await fs.readFile(new URL('../functions/api/[[path]].ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { onRequest } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const originalFetch = globalThis.fetch;
const received = [];
globalThis.fetch = async (url, options) => {
  received.push({ url: String(url), ...options });
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': 'CF_Authorization=test-only; Secure' } });
};
try {
  const env = { TENCENT_BACKEND_ORIGIN: 'https://backend.example', CF_ACCESS_CLIENT_ID: 'test-id', CF_ACCESS_CLIENT_SECRET: 'test-secret' };
  for (const [method, path] of [
    ['GET', '/capabilities'], ['GET', '/articles?q=test'], ['POST', '/articles'],
    ['GET', '/articles/abc'], ['PATCH', '/articles/abc'], ['POST', '/articles/abc/copy'],
    ['GET', '/gallery'], ['POST', '/images'], ['PATCH', '/images/abc'], ['GET', '/images/abc/file'],
  ]) {
    const request = new Request(`https://blog.example/api/agent/v1${path}`, {
      method, headers: { Authorization: 'Bearer test-key' },
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(received.at(-1).headers.get('Authorization'), 'Bearer test-key');
    assert.equal(received.at(-1).headers.get('CF-Access-Client-Secret'), 'test-secret');
    assert.equal(received.at(-1).url, `https://backend.example/api/agent/v1${path}`);
  }
  for (const [method, path] of [
    ['POST', '/api/admin/login'], ['POST', '/api/admin/public-deploy'], ['GET', '/api/admin/agent-keys'],
    ['POST', '/api/agent/v1/articles/abc/publish'], ['DELETE', '/api/agent/v1/articles/abc'],
    ['GET', '/api/agent/v1/unknown'], ['PUT', '/api/agent/v1/images/abc/file'],
  ]) {
    const count = received.length;
    assert.equal((await onRequest({ request: new Request(`https://blog.example${path}`, { method }), env })).status, 404);
    assert.equal(received.length, count);
  }
  const form = new FormData();
  form.append('image', new Blob(['image contents'], { type: 'image/png' }), 'test.png');
  const upload = new Request('https://blog.example/api/agent/v1/images', { method: 'POST', body: form });
  await onRequest({ request: upload, env });
  const forwarded = new Response(received.at(-1).body, { headers: received.at(-1).headers });
  assert.equal((await forwarded.formData()).get('image').name, 'test.png');
  console.log('Agent proxy: allowed routes, blocked admin/publication routes, Bearer/Access headers and multipart body passed.');
} finally { globalThis.fetch = originalFetch; }
