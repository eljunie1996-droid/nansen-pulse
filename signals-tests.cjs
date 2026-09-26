const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const script=fs.readFileSync(__dirname+'/public/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const stub={classList:{contains:()=>false,add(){},remove(){},toggle(){}},style:{},addEventListener(){},querySelectorAll:()=>[],innerHTML:''};
const ctx=vm.createContext({WalletLens:require('./public/wallet-lens'),console,Intl,Map,Set,Date,localStorage:{getItem:()=>null},document:{getElementById:()=>stub,querySelectorAll:()=>[],addEventListener(){}},requestAnimationFrame(){},setTimeout(){},setInterval(){}});
vm.runInContext(script.replace(/loadUniverse\(false\);\s*$/,''),ctx);const run=s=>vm.runInContext(s,ctx);
(async()=>{
run(`DATA.generated_at=new Date().toISOString();DATA.views.foryou=Array.from({length:70},(_,i)=>({id:'x'+i,token_address:'x'+i,chain:'base',token_symbol:'X'+i,token_age_hours:300,volume:100000-i}));state.mode='signals';var calls=0;fetchFlow=async(t,tf='1h')=>{calls++;const r={ok:true,timeframe:tf,fetched_at:new Date().toISOString(),data:{smart_trader_net_flow_usd:-5000,top_pnl_net_flow_usd:-3000,smart_trader_wallet_count:5}};flowById.set(flowKey(t,tf),r);return r};fetchSnapshot=async(t,tf)=>{calls++;const r={ok:true,fetched_at:new Date().toISOString(),data:{volume:100000,price_change:.1}};snapshotByKey.set(snapshotKey(t,tf),r);return r};renderSignals()`);
assert.equal(run('calls'),0);assert.equal(run('signalCandidates().length'),60);await run('scanSignals()');assert.equal(run('signalCursor'),6);assert.equal(run('calls'),12);assert.match(stub.innerHTML,/Price up/);assert.equal(run("signalEvidence(DATA.views.foryou[0]).rank"),3);
run("snapshotByKey.delete(snapshotKey(DATA.views.foryou[0],'1h'))");assert.equal(run('signalEvidence(DATA.views.foryou[0]).rank'),0);
run("detailToken=DATA.views.foryou[1]");const html=run('renderWindowComparison(detailToken)');assert.match(html,/overlapping windows/);assert.match(html,/Not loaded/);await run('loadWindowComparison()');for(const tf of ['1h','6h','24h','7d'])assert.equal(run(`flowById.get(flowKey(detailToken,'${tf}')).timeframe`),tf);
run("detailToken={id:'young',token_age_hours:2}");assert.equal((run('renderWindowComparison(detailToken)').match(/Too young/g)||[]).length,12);
console.log('PASS: opt-in scan, six-token batches, sixty-token scope, evidence-driven matches, missing snapshot exclusion, comparison windows and young-token gating');
})().catch(e=>{console.error(e);process.exitCode=1});
