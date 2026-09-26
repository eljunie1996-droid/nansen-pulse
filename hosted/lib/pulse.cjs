const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

let API_KEY = process.env.NANSEN_API_KEY || '';
const PORT = 3000;
const API_BASE = 'https://api.nansen.ai';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const CHAINS = ['solana','base','robinhood','arc','bnb','arbitrum','ethereum'];
const SCREEN_CACHE_MS = 10 * 60 * 1000;
const FLOW_CACHE_MS = 10 * 60 * 1000;
const INFO_CACHE_MS = 5 * 60 * 1000;
const SNAPSHOT_CACHE_MS = 5 * 60 * 1000;
const SNAPSHOT_TIMEFRAMES = new Set(['1h','6h','24h','7d']);
const MAX_PAGES_PER_CHAIN = 2; // up to 2,000 screener rows per chain if Nansen has more than one page
const PER_PAGE = 1000;

let universeCache = null;
let universeCacheAt = 0;
let universeInFlight = null;
const flowCache = new Map();
const infoCache = new Map();
const snapshotCache = new Map();
const pendingRequests = new Map();
const FAILURE_CACHE_MS = 15000;
const APP_VERSION = '5.22';
function once(key,fn){if(pendingRequests.has(key))return pendingRequests.get(key);const promise=Promise.resolve().then(fn).finally(()=>pendingRequests.delete(key));pendingRequests.set(key,promise);return promise;}
let totals = { calls: 0, credits: 0, errors: [] };

const MAJOR_ROOT = new Map([
  ['BTC','BTC'],['WBTC','BTC'],['CBBTC','BTC'],['TBTC','BTC'],
  ['ETH','ETH'],['WETH','ETH'],['STETH','ETH'],['WSTETH','ETH'],['WEETH','ETH'],['RETH','ETH'],
  ['SOL','SOL'],['WSOL','SOL'],['JITOSOL','SOL'],['MSOL','SOL'],
  ['BNB','BNB'],['WBNB','BNB'],
  ['XRP','XRP'],['LINK','LINK'],['DOGE','DOGE'],['ADA','ADA'],['AVAX','AVAX'],['TRX','TRX']
]);

function num(v){ if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; }
function nonNull(...xs){ return xs.find(x => x !== null && x !== undefined) ?? null; }
function keyOf(chain,address){ return `${chain}:${chain === 'solana' ? String(address) : String(address).toLowerCase()}`; }
function canonicalSymbol(symbol){ return String(symbol || '').trim().toUpperCase(); }
function majorRoot(symbol){ return MAJOR_ROOT.get(canonicalSymbol(symbol)) || null; }
function valuationOf(t){ return nonNull(num(t.market_cap_usd), num(t.fdv)); }
function isLarge(t){ const v = valuationOf(t); return v !== null && v >= 1e9; }
function isMajorLike(t){ return majorRoot(t.token_symbol) !== null; }
function isDegen(t){
  if (isLarge(t) || isMajorLike(t)) return false;
  const v = valuationOf(t);
  // Broad universe on purpose: unknown valuation remains eligible.
  return v === null || v < 500e6;
}
function isChainFeedEligible(t){ return !isLarge(t) && !isMajorLike(t); }
function sortNum(v){ const x = num(v); return x === null ? -Infinity : x; }

async function nansenPost(endpoint, body){
  await require('./quota.cjs').reserve();
  totals.calls++;
  const res = await fetch(API_BASE + endpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json', 'apikey': API_KEY },
    body: JSON.stringify(body)
  });
  const used = Number(res.headers.get('x-nansen-credits-used') || 0);
  if (Number.isFinite(used)) totals.credits += used;
  const requestId = res.headers.get('x-request-id') || null;
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!res.ok) {
    const message = data?.message || data?.detail || `HTTP ${res.status}`;
    totals.errors.push({ endpoint, status: res.status, message, request_id: requestId });
    const err = new Error(`${endpoint}: ${message}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function screenerPage(chain,page){
  return nansenPost('/api/v1/token-screener', {
    chains: [chain],
    timeframe: '1h',
    pagination: { page, per_page: PER_PAGE },
    filters: {
      trader_type: 'all',
      include_stablecoins: false,
      include_native_tokens: true
    },
    order_by: [{ field: 'volume', direction: 'DESC' }]
  });
}

async function fetchChainUniverse(chain){
  const rows = [];
  let lastPage = false;
  let pages = 0;
  let error = null;
  for (let page = 1; page <= MAX_PAGES_PER_CHAIN; page++) {
    try {
      const r = await screenerPage(chain,page);
      pages++;
      if (Array.isArray(r.data)) rows.push(...r.data);
      lastPage = !!r.pagination?.is_last_page;
      if (lastPage) break;
    } catch (e) {
      error = e.message;
      break;
    }
  }
  return { chain, rows, pages, lastPage, error };
}

async function mapLimit(items, limit, fn){
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function normalizeToken(raw){
  if (!raw?.chain || !raw?.token_address || !raw?.token_symbol) return null;
  return {
    id: keyOf(raw.chain, raw.token_address),
    chain: raw.chain,
    token_address: raw.token_address,
    token_symbol: raw.token_symbol,
    token_age_days: num(raw.token_age_days),
    token_age_hours: num(raw.token_age_hours),
    token_deployment_date: raw.token_deployment_date || null,
    market_cap_usd: num(raw.market_cap_usd),
    fdv: num(raw.fdv),
    fdv_mc_ratio: num(raw.fdv_mc_ratio),
    liquidity: num(raw.liquidity),
    price_usd: num(raw.price_usd),
    price_change: num(raw.price_change),
    volume: num(raw.volume),
    buy_volume: num(raw.buy_volume),
    sell_volume: num(raw.sell_volume),
    netflow: num(raw.netflow),
    nof_traders: num(raw.nof_traders),
    nof_buyers: num(raw.nof_buyers),
    nof_sellers: num(raw.nof_sellers),
    nof_buys: num(raw.nof_buys),
    nof_sells: num(raw.nof_sells),
    inflow_fdv_ratio: num(raw.inflow_fdv_ratio),
    outflow_fdv_ratio: num(raw.outflow_fdv_ratio)
  };
}

function dedupeExact(tokens){
  const m = new Map();
  for (const t of tokens) {
    if (!t) continue;
    const old = m.get(t.id);
    if (!old || sortNum(t.volume) > sortNum(old.volume)) m.set(t.id,t);
  }
  return [...m.values()];
}

function dedupeLarge(tokens){
  const m = new Map();
  for (const t of tokens) {
    if (!isLarge(t) && !isMajorLike(t)) continue;
    const root = majorRoot(t.token_symbol) || canonicalSymbol(t.token_symbol);
    const old = m.get(root);
    if (!old) { m.set(root,t); continue; }
    // Prefer actual large-cap valuation, then greater market cap, liquidity and volume.
    const oldScore = (isLarge(old)?1e30:0) + sortNum(old.market_cap_usd)*1e6 + sortNum(old.liquidity)*1e3 + sortNum(old.volume);
    const newScore = (isLarge(t)?1e30:0) + sortNum(t.market_cap_usd)*1e6 + sortNum(t.liquidity)*1e3 + sortNum(t.volume);
    if (newScore > oldScore) m.set(root,t);
  }
  return [...m.values()];
}

function toPublic(t){
  const valuation = valuationOf(t);
  return {
    ...t,
    valuation_usd: valuation,
    is_large: isLarge(t),
    is_major_like: isMajorLike(t),
    is_degen: isDegen(t),
    chain_feed_eligible: isChainFeedEligible(t)
  };
}

async function buildUniverse(){
  totals = { calls: 0, credits: 0, errors: [] };
  const results = await mapLimit(CHAINS, 3, fetchChainUniverse);
  if (results.every(r => r.error && !r.rows.length)) {
    throw Object.assign(new Error('All chains failed: ' + results.map(r => `${r.chain}: ${r.error}`).join(' | ')), {status:502});
  }
  const all = dedupeExact(results.flatMap(r => r.rows.map(normalizeToken).filter(Boolean)));

  // Keep every raw token in the master inventory. Classification only creates views; it does not delete data.
  const publicAll = all.map(toPublic);
  const large = dedupeLarge(all).sort((a,b) => sortNum(b.volume)-sortNum(a.volume)).map(toPublic);
  const chain = all.filter(isChainFeedEligible).sort((a,b) => sortNum(b.volume)-sortNum(a.volume)).map(toPublic);
  const degen = all.filter(isDegen).sort((a,b) => sortNum(b.volume)-sortNum(a.volume)).map(toPublic);

  // For You is deliberately NOT a recommendation model yet. It is a neutral base order by 1H volume.
  const forYou = [...chain];

  const byChain = {};
  for (const ch of CHAINS) {
    byChain[ch] = {
      raw: publicAll.filter(t => t.chain === ch).length,
      chain: chain.filter(t => t.chain === ch).length,
      degen: degen.filter(t => t.chain === ch).length
    };
  }

  const source = Object.fromEntries(results.map(r => [r.chain, {
    rows: r.rows.length,
    pages: r.pages,
    is_last_page: r.lastPage,
    truncated_after_max_pages: !r.lastPage && r.pages >= MAX_PAGES_PER_CHAIN,
    error: r.error
  }]));

  const payload = {
    generated_at: new Date().toISOString(),
    timeframe: '1h',
    views: { foryou: forYou, large, degen, chains: chain },
    counts: {
      raw: publicAll.length,
      foryou: forYou.length,
      large: large.length,
      degen: degen.length,
      chains: chain.length,
      by_chain: byChain
    },
    source,
    meta: {
      ordering: 'For You is temporarily ordered by 1H volume. No recommendation/decision module is active.',
      degen_definition: 'Broad inventory: non-major, non-large token with valuation < $500M when known; unknown valuation remains eligible.',
      chains_definition: 'All non-large, non-major tokens on the selected chain. Large-cap majors are kept in Large Cap to avoid cross-tab duplication.',
      api_calls: totals.calls,
      credits_used: totals.credits,
      errors: totals.errors
    }
  };
  universeCache = payload;
  universeCacheAt = Date.now();

  console.log('\n[Universe rebuilt]');
  for (const ch of CHAINS) {
    const c = byChain[ch];
    console.log(`  ${ch.padEnd(10)} raw=${String(c.raw).padStart(4)} chain=${String(c.chain).padStart(4)} degen=${String(c.degen).padStart(4)}`);
  }
  console.log(`  TOTAL raw=${publicAll.length} | large=${large.length} | degen=${degen.length} | chains=${chain.length}`);
  console.log(`  API calls=${totals.calls} | credits=${totals.credits}`);
  if (totals.errors.length) console.log('  Partial errors:', totals.errors.map(e => `${e.endpoint} ${e.status||''} ${e.message}`).join(' | '));
  return payload;
}

async function getUniverse(force=false){
  if (!force && universeCache && Date.now()-universeCacheAt < SCREEN_CACHE_MS) return universeCache;
  if (universeInFlight) return universeInFlight;
  universeInFlight = buildUniverse().catch(e=>{
    if(universeCache)return {...universeCache,stale:true,refresh_error:e.message};
    throw e;
  }).finally(() => { universeInFlight = null; });
  return universeInFlight;
}

function getFlow(chain,address,timeframe='1h'){if(!SNAPSHOT_TIMEFRAMES.has(timeframe))throw Object.assign(new Error('Unsupported timeframe'),{status:400});return once(`flow:${keyOf(chain,address)}:${timeframe}`,()=>loadFlow(chain,address,timeframe));}
async function loadFlow(chain,address,timeframe){
  const k = `${keyOf(chain,address)}:${timeframe}`;
  const cached = flowCache.get(k);
  if (cached && Date.now()-cached.at < (cached.value.ok?FLOW_CACHE_MS:FAILURE_CACHE_MS)) return {...cached.value, cached:true};
  try {
    const r = await nansenPost('/api/v1/tgm/flow-intelligence', { chain, token_address: address, timeframe: timeframe==='24h'?'1d':timeframe });
    const data = Array.isArray(r.data) ? (r.data[0] || null) : null;
    const value = { ok:true, data, timeframe, warnings:r.warnings || [], fetched_at:new Date().toISOString() };
    flowCache.set(k,{at:Date.now(),value});
    return {...value,cached:false};
  } catch (e) {
    const value = { ok:false, data:null, error:e.message, fetched_at:new Date().toISOString() };
    flowCache.set(k,{at:Date.now(),value});
    return {...value,cached:false};
  }
}

function getInfo(chain,address,timeframe='1h'){return once(`info:${keyOf(chain,address)}:${timeframe}`,()=>loadInfo(chain,address,timeframe));}
async function loadInfo(chain,address,timeframe='1h'){
  if (!SNAPSHOT_TIMEFRAMES.has(timeframe)) throw Object.assign(new Error('Unsupported timeframe'), {status:400});
  const k = `${keyOf(chain,address)}:${timeframe}`;
  const cached = infoCache.get(k);
  if (cached && Date.now()-cached.at < (cached.value.ok?INFO_CACHE_MS:FAILURE_CACHE_MS)) return {...cached.value,cached:true};
  try {
    const r = await nansenPost('/api/v1/tgm/token-information', { chain, token_address: address, timeframe:timeframe==='24h'?'1d':timeframe });
    const value = { ok:!!r.data, data:r.data || null, timeframe, fetched_at:new Date().toISOString() };
    infoCache.set(k,{at:Date.now(),value});
    return {...value,cached:false};
  } catch (e) {
    const value = { ok:false, data:null, error:e.message, fetched_at:new Date().toISOString() };
    infoCache.set(k,{at:Date.now(),value});
    return {...value,cached:false};
  }
}

function getSnapshot(chain,address,timeframe){return once(`snapshot:${keyOf(chain,address)}:${timeframe}`,()=>loadSnapshot(chain,address,timeframe));}
async function loadSnapshot(chain,address,timeframe){
  if (!SNAPSHOT_TIMEFRAMES.has(timeframe)) {
    const err = new Error(`Unsupported timeframe: ${timeframe}`);
    err.status = 400;
    throw err;
  }
  const k = `${keyOf(chain,address)}:${timeframe}`;
  const cached = snapshotCache.get(k);
  if (cached && Date.now()-cached.at < (cached.value.ok&&!cached.value.participation_error?SNAPSHOT_CACHE_MS:FAILURE_CACHE_MS)) return {...cached.value,cached:true};
  try {
    // Dedicated single-token Screener request so price_change and all market
    // participation metrics are guaranteed to come from the selected timeframe.
    const r = await nansenPost('/api/v1/token-screener', {
      chains: [chain],
      timeframe,
      pagination: { page: 1, per_page: 10 },
      filters: {
        token_address: address,
        trader_type: 'all',
        include_stablecoins: true,
        include_native_tokens: true
      }
    });
    const rows = Array.isArray(r.data) ? r.data : [];
    const exact = rows.find(x => x?.chain === chain && keyOf(chain,x.token_address) === keyOf(chain,address)) || null;
    const data = exact ? normalizeToken(exact) : null;
    let participationError = null;
    if (data) {
      const info = await getInfo(chain,address,timeframe);
      const spot = info.ok ? info.data?.spot_metrics : null;
      data.nof_buyers = num(spot?.unique_buyers);
      data.nof_sellers = num(spot?.unique_sellers);
      data.nof_buys = num(spot?.total_buys);
      data.nof_sells = num(spot?.total_sells);
      data.participation_source = spot ? 'token-information' : null;
      participationError = info.error || (!spot ? 'Buyer/seller data unavailable for this timeframe.' : null);
    }
    const value = data
      ? { ok:true, data, timeframe, source:'token-screener', participation_error:participationError, fetched_at:new Date().toISOString() }
      : { ok:false, data:null, timeframe, source:'token-screener', error:'No Token Screener row returned for this token/timeframe.', fetched_at:new Date().toISOString() };
    snapshotCache.set(k,{at:Date.now(),value});
    console.log(`[snapshot] ${chain} ${String(address).slice(0,8)}… ${timeframe} ${value.ok?'OK':'NO DATA'}${data?.price_change != null ? ` price_change_raw=${data.price_change} display≈${(data.price_change*100).toFixed(4)}%` : ''}`);
    return {...value,cached:false};
  } catch (e) {
    const value = { ok:false, data:null, timeframe, source:'token-screener', error:e.message, fetched_at:new Date().toISOString() };
    snapshotCache.set(k,{at:Date.now(),value});
    return {...value,cached:false};
  }
}

function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status, { 'content-type': type, 'cache-control':'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveStatic(req,res){
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR,urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res,403,'Forbidden','text/plain');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res,404,'Not found','text/plain');
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'application/octet-stream';
  send(res,200,fs.readFileSync(file),type);
}

const server = http.createServer(async (req,res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname === '/api/universe') {
      const force = false; // Hosted demo always respects the shared instance cache.
      return send(res,200,await getUniverse(force));
    }
    if (u.pathname === '/api/enrich') {
      const chain = u.searchParams.get('chain');
      const address = u.searchParams.get('address');
      if (!chain || !address) return send(res,400,{error:'chain and address are required'});
      return send(res,200,await getFlow(chain,address,u.searchParams.get('timeframe') || '1h'));
    }
    if (u.pathname === '/api/info') {
      const chain = u.searchParams.get('chain');
      const address = u.searchParams.get('address');
      if (!chain || !address) return send(res,400,{error:'chain and address are required'});
      return send(res,200,await getInfo(chain,address,u.searchParams.get('timeframe') || '1h'));
    }
    if (u.pathname === '/api/snapshot') {
      const chain = u.searchParams.get('chain');
      const address = u.searchParams.get('address');
      const timeframe = u.searchParams.get('timeframe') || '1h';
      if (!chain || !address) return send(res,400,{error:'chain and address are required'});
      if (!SNAPSHOT_TIMEFRAMES.has(timeframe)) return send(res,400,{error:'timeframe must be one of 1h, 6h, 24h, 7d'});
      return send(res,200,await getSnapshot(chain,address,timeframe));
    }
    if (u.pathname === '/api/status') {
      return send(res,200,{app:'nansen-pulse',version:APP_VERSION,universe_cached:!!universeCache,universe_age_s:universeCacheAt?Math.round((Date.now()-universeCacheAt)/1000):null,flow_cache:flowCache.size,info_cache:infoCache.size,snapshot_cache:snapshotCache.size,total_api_calls:totals.calls,total_credits:totals.credits});
    }
    return serveStatic(req,res);
  } catch (e) {
    console.error('[server]',e);
    return send(res,e.status || 500,{error:e.message,payload:e.payload || null});
  }
});

function openBrowser(url){
  try {
    if (process.platform === 'win32') spawn('cmd',['/c','start','',url],{detached:true,stdio:'ignore'}).unref();
    else if (process.platform === 'darwin') spawn('open',[url],{detached:true,stdio:'ignore'}).unref();
    else spawn('xdg-open',[url],{detached:true,stdio:'ignore'}).unref();
  } catch {}
}
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 3000 is already in use. Close the other server or open http://localhost:3000.':error.message);process.exitCode=1});
function start(){
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log('\n========================================');
    console.log(' NANSEN PULSE V5.22');
    console.log('========================================');
    console.log('Open:',url);
    console.log('Initial universe: up to 2 Screener pages x 7 chains.');
    console.log('Flow data is lazy-loaded only for cards you are near.');
    console.log('Full Data snapshots are lazy-loaded per timeframe: 1h / 6h / 24h / 7d.');
    console.log('Each new timeframe = Screener + Token Information, cached for 5 minutes.');
    console.log('No Heat / Direction / quality gate is active.');
    console.log('Close this CMD window to stop.\n');
    openBrowser(url);
  });
}

if (require.main === module) {
const {Writable}=require('node:stream');
let mute=false;
const output=new Writable({write(chunk,encoding,done){if(!mute)process.stdout.write(chunk,encoding);done()}});
const rl = readline.createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
console.log('\n========================================');
console.log(' NANSEN PULSE V5.22');
console.log('========================================\n');
rl.question('Paste Nansen API key: ', key => {
  mute=false;process.stdout.write('\n');
  API_KEY = String(key || '').trim();
  rl.close();
  if (!API_KEY) { console.log('API key is empty.'); process.exit(1); }
  start();
});
mute=true;

}
module.exports = {keyOf,normalizeToken,getSnapshot,getInfo,getFlow,getUniverse,server};





