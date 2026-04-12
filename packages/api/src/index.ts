import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './middleware/auth.js';

// Startup validation
const required = ['GEMINI_API_KEY', 'SESSION_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  console.error('[startup] Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

// Import DB to initialise schema on startup
import './db/client.js';

import authRouter from './routes/auth.js';
import childrenRouter from './routes/children.js';
import storiesRouter from './routes/stories.js';
import metricsRouter from './routes/metrics.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Global rate limit
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Auth rate limit
const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

// Routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/children', childrenRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/metrics', metricsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Metrics dashboard — serves static HTML, metrics loaded client-side via fetch
app.get('/dashboard', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(getDashboardHtml());
});

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dreamy Tales — Metrics Dashboard</title>
<meta http-equiv="refresh" content="30">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0d1b3e;color:#fff;padding:32px;min-height:100vh}
  h1{color:#ffd53d;font-size:28px;margin-bottom:8px}
  .sub{color:rgba(255,255,255,.5);margin-bottom:32px;font-size:14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:24px}
  .card{background:#162247;border:1.5px solid rgba(255,213,61,.15);border-radius:16px;padding:20px}
  .card .lbl{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:8px}
  .card .val{font-size:32px;font-weight:800;color:#ffd53d}
  .card .unit{font-size:13px;color:rgba(255,255,255,.5);margin-top:4px}
  #status{color:rgba(255,255,255,.4);font-size:14px}
  a{color:#ffd53d}
</style>
</head>
<body>
<h1>&#11088; Dreamy Tales Metrics</h1>
<p class="sub">Local dashboard &#8212; auto-refreshes every 30s. <a href="/api/metrics">Raw JSON</a></p>
<div id="status">Loading&#8230;</div>
<div class="grid" id="grid"></div>
<script>
(function(){
  var CARDS=[
    {k:'users',label:'Total Users',unit:'registered parents'},
    {k:'children',label:'Total Children',unit:'profiles created'},
    {k:'stories',label:'Total Stories',unit:'stories ready'},
    {k:'storiesLast7',label:'Stories (7d)',unit:'generated'},
    {k:'storiesPerWeek',label:'Stories/User/Week',unit:'target: \u2265 4'},
    {k:'avgSession',label:'Avg Session',unit:'target: \u2265 8 min'},
    {k:'p50',label:'Latency P50',unit:'story generation'},
    {k:'p95',label:'Latency P95',unit:'target: < 8s'},
    {k:'safety',label:'Safety Pass Rate',unit:'target: \u2265 99.9%'},
    {k:'totalCost',label:'Total AI Cost',unit:'Claude API spend'},
    {k:'costPerStory',label:'Cost / Story',unit:'per generation'},
    {k:'cost7d',label:'Cost (7 days)',unit:'recent spend'},
  ];

  function render(vals){
    var grid=document.getElementById('grid');
    while(grid.firstChild) grid.removeChild(grid.firstChild);
    CARDS.forEach(function(c){
      var card=document.createElement('div'); card.className='card';
      var lbl=document.createElement('div'); lbl.className='lbl'; lbl.textContent=c.label;
      var val=document.createElement('div'); val.className='val'; val.textContent=vals[c.k]||'\u2014';
      var unit=document.createElement('div'); unit.className='unit'; unit.textContent=c.unit;
      card.appendChild(lbl); card.appendChild(val); card.appendChild(unit);
      grid.appendChild(card);
    });
  }

  function fmt(v,decimals){ return v!=null?String(Math.round(v*Math.pow(10,decimals||0))/Math.pow(10,decimals||0)):'—'; }

  fetch('/api/metrics',{credentials:'include'}).then(function(r){
    if(!r.ok){ document.getElementById('status').textContent='Not logged in — open the app first and log in.'; return; }
    return r.json();
  }).then(function(d){
    if(!d) return;
    document.getElementById('status').textContent='';
    render({
      users: fmt(d.totals&&d.totals.users),
      children: fmt(d.totals&&d.totals.children),
      stories: fmt(d.totals&&d.totals.stories),
      storiesLast7: fmt(d.totals&&d.totals.storiesLast7),
      storiesPerWeek: fmt(d.storiesPerUserPerWeek,1),
      avgSession: d.avgSessionLengthMin!=null ? fmt(d.avgSessionLengthMin,1)+'m' : '—',
      p50: d.storyGenerationLatency&&d.storyGenerationLatency.p50Ms!=null ? Math.round(d.storyGenerationLatency.p50Ms/1000)+'s' : '—',
      p95: d.storyGenerationLatency&&d.storyGenerationLatency.p95Ms!=null ? Math.round(d.storyGenerationLatency.p95Ms/1000)+'s' : '—',
      safety: d.contentSafetyPassRate!=null ? d.contentSafetyPassRate+'%' : '—',
      totalCost: '$'+fmt(d.totalApiCostUsd,4),
      costPerStory: '$'+fmt(d.avgCostPerStoryUsd,4),
      cost7d: '$'+fmt(d.costLast7DaysUsd,4),
    });
  }).catch(function(e){
    document.getElementById('status').textContent='Error: '+String(e);
  });
})();
</script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`[api] Dreamy Tales API  →  http://localhost:${PORT}`);
  console.log(`[api] Metrics dashboard →  http://localhost:${PORT}/dashboard`);
});

export default app;
