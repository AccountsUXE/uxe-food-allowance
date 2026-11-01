'use strict';
const express = require('express');
const path = require('path');
const redis = require('redis');

const PORT = process.env.PORT || 10000;
// Real code is set via the ACCESS_CODE environment variable on Render (never committed).
const ACCESS_CODE = (process.env.ACCESS_CODE || 'change-me').trim();
const REDIS_URL = process.env.REDIS_URL || process.env.KEY_VALUE_URL || '';

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

// ---- Redis (Render Key Value) with lazy connect + reconnect ----
let client = null, ready = false;
async function getClient() {
  if (client && ready) return client;
  if (!client) {
    client = redis.createClient({
      url: REDIS_URL,
      socket: { reconnectStrategy: (r) => Math.min(r * 200, 3000) }
    });
    client.on('error', (e) => { ready = false; console.error('redis error', e.message); });
    client.on('ready', () => { ready = true; });
  }
  if (!client.isOpen) { try { await client.connect(); } catch (e) { console.error('connect fail', e.message); } }
  ready = client.isOpen;
  return client;
}

const SIG = (no) => 'sig:' + no;
const APPR = 'config:approvers';

// ---- auth ----
function checkCode(req) {
  const c = (req.get('x-access-code') || req.query.code || '').trim();
  return ACCESS_CODE && c === ACCESS_CODE;
}
app.post('/api/login', (req, res) => {
  const c = ((req.body && req.body.code) || '').trim();
  res.json({ ok: !!(ACCESS_CODE && c === ACCESS_CODE) });
});
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  if (!checkCode(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
});

// ---- data ----
app.get('/api/data', async (req, res) => {
  try {
    const c = await getClient();
    const progress = {};
    for await (const key of c.scanIterator({ MATCH: 'sig:*', COUNT: 100 })) {
      const no = key.slice(4);
      const raw = await c.get(key);
      if (!raw) continue;
      let doc; try { doc = JSON.parse(raw); } catch (e) { continue; }
      const days = {};
      Object.keys(doc.days || {}).forEach((d) => { if (doc.days[d]) days[d] = true; });
      progress[no] = { no, days };
    }
    let approvers = {};
    const ar = await c.get(APPR);
    if (ar) { try { approvers = JSON.parse(ar); } catch (e) {} }
    res.json({ progress, approvers });
  } catch (e) { res.status(500).json({ error: 'server', detail: e.message }); }
});

app.get('/api/sig/:no', async (req, res) => {
  try {
    const c = await getClient();
    const raw = await c.get(SIG(req.params.no));
    res.json(raw ? JSON.parse(raw) : { days: {} });
  } catch (e) { res.status(500).json({ error: 'server' }); }
});

app.post('/api/sign/:no', async (req, res) => {
  try {
    const { day, img } = req.body || {};
    if (!day || !img) return res.status(400).json({ error: 'day and img required' });
    const c = await getClient();
    const raw = await c.get(SIG(req.params.no));
    const doc = raw ? JSON.parse(raw) : { days: {} };
    doc.days = doc.days || {};
    doc.days[day] = { img, ts: new Date().toISOString() };
    await c.set(SIG(req.params.no), JSON.stringify(doc));
    res.json({ ok: true, days: doc.days });
  } catch (e) { res.status(500).json({ error: 'server', detail: e.message }); }
});

app.post('/api/unsign/:no', async (req, res) => {
  try {
    const { day } = req.body || {};
    const c = await getClient();
    const raw = await c.get(SIG(req.params.no));
    if (raw) {
      const doc = JSON.parse(raw);
      if (doc.days) delete doc.days[day];
      await c.set(SIG(req.params.no), JSON.stringify(doc));
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'server' }); }
});

app.get('/api/approvers', async (req, res) => {
  try { const c = await getClient(); const ar = await c.get(APPR); res.json(ar ? JSON.parse(ar) : {}); }
  catch (e) { res.status(500).json({ error: 'server' }); }
});
app.post('/api/approver', async (req, res) => {
  try {
    const { role, img } = req.body || {};
    if (role !== 'prepared' && role !== 'approved') return res.status(400).json({ error: 'bad role' });
    const c = await getClient();
    const ar = await c.get(APPR);
    const doc = ar ? JSON.parse(ar) : {};
    if (img) doc[role] = { img, ts: new Date().toISOString() }; else delete doc[role];
    await c.set(APPR, JSON.stringify(doc));
    res.json({ ok: true, approvers: doc });
  } catch (e) { res.status(500).json({ error: 'server' }); }
});

app.get('/healthz', (req, res) => res.json({ ok: true, redis: ready }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('listening on ' + PORT));
