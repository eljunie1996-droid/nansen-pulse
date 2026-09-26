const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const h=fs.readFileSync(__dirname+'/public/index.html','utf8'),s=h.match(/<script>([\s\S]*?)<\/script>/)[1];const stub={classList:{contains:()=>false,add(){},remove(){},toggle(){}},style:{},addEventListener(){},querySelectorAll:()=>[],innerHTML:''};const ctx=vm.createContext({WalletLens:require('./public/wallet-lens'),Intl,Map,Set,Date,localStorage:{getItem:()=>null},document:{getElementById:()=>stub,querySelectorAll:()=>[],addEventListener(){}},requestAnimationFrame(){},setTimeout(){},setInterval(){}});vm.runInContext(s.replace(/loadUniverse\(false\);\s*$/,''),ctx);const run=x=>vm.runInContext(x,ctx);
run(`var token={id:'test',chain:'base',token_address:'0xtest',token_symbol:'<img>',price_usd:2,price_change:.02};flowById.set('test',{ok:true,timeframe:'1h',fetched_at:new Date().toISOString(),data:{smart_trader_net_flow_usd:0,smart_trader_wallet_count:0,top_pnl_net_flow_usd:-5000,top_pnl_wallet_count:1}})`);
const a=run('orbitView(token)');assert.match(a,/unknown/);assert.match(a,/neutral/);assert.match(a,/outflow/);assert.match(a,/&lt;img&gt;/);assert.doesNotMatch(a,/NaN/);assert.match(a,/\$2.00/);assert.match(a,/Research more at Nansen/);assert.match(run("orbitView(token,'7d',true)"),/Waiting for Nansen data/);run("orbitSelection='top_pnl'");assert.match(run('orbitView(token)'),/heading|Top PnL/);console.log('PASS: orbit distinguishes missing/zero/negative flows, escaped symbols, selected groups and isolated windows');

assert.equal(run('money(0.000001)'),'+<$0.01');assert.equal(run('money(-0.000001)'),'−<$0.01');assert.equal(run('money(null)'),'—');assert.equal(run('money(0)'),'$0.00');
assert.match(run('renderWindowComparison(token)'),/No activity reported/);
assert.match(run('renderWindowComparison(token)'),/Flow unavailable/);
run("orbitManual=false;orbitView(token)");assert.equal(run('orbitSelection'),'top_pnl');
const lens=require('./public/wallet-lens').analyze({flow:{ok:true,data:{smart_trader_net_flow_usd:9000},fetched_at:new Date().toISOString()}});assert.equal(lens.kind,'loading');
console.log('PASS: tiny nonzero amounts, missing vs zero, strongest group default and deferred interpretation');

run("renderCard=()=>{};DATA.views.foryou=[token];state.mode='foryou';token.token_age_hours=200;explorerTf='1h'");
run("setExplorerTimeframe('7d')");assert.equal(run('explorerTf'),'7d');
run("token.token_age_hours=2;setExplorerTimeframe('6h')");assert.equal(run('explorerTf'),'7d');
assert.match(run("explorerButtons(token,'1h')"),/disabled aria-disabled/);
assert.match(run("explorerButtons(token,'1h')"),/setExplorerTimeframe/);
run("token.token_age_hours=200;fetchFlow=async()=>({ok:true});fetchSnapshot=async()=>({ok:true});renderDetail=()=>{};openDetail()");assert.equal(run('detailTf'),'7d');
console.log('PASS: explorer selection, young-token gating and Evidence timeframe inheritance');
