// Vercel serverless function: POST /api/rpc
import { proxyRpc } from './_proxy.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'POST only.' }));
    return;
  }
  let body = req.body;
  if (body == null) {
    body = '';
    for await (const chunk of req) body += chunk;
  }
  const out = await proxyRpc(body);
  res.statusCode = out.status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(out.body);
}
