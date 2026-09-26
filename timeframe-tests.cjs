const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {getFlow}=require('./server');const {analyze}=require('./public/wallet-lens');
(async()=>{
 const requests=[];global.fetch=async(url,opts)=>{const b=JSON.parse(opts.body);requests.push(b);return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({data:[{smart_trader_net_flow_usd:-10000,smart_trader_wallet_count:5}]})}};
 for(const tf of ['1h','6h','24h','7d']){const r=await getFlow('base','0xtest',tf);assert.equal(r.timeframe,tf);assert.equal(r.ok,true)}
 assert.deepEqual(requests.map(x=>x.timeframe),['1h','6h','1d','7d']);await getFlow('base','0xtest','7d');assert.equal(requests.length,4);assert.throws(()=>getFlow('base','x','2h'),/Unsupported/);
 for(const tf of ['1h','6h','24h','7d']){const at=new Date().toISOString();const result=analyze({market:{price_change:.1,volume:100000},marketAt:at,marketTimeframe:tf,flowTimeframe:tf,flow:{ok:true,timeframe:tf,fetched_at:at,data:{smart_trader_net_flow_usd:-10000}}});assert.equal(result.kind,'divergence');assert.match(result.summary,new RegExp(tf==='24h'?'1D':tf.toUpperCase()))}
 const html=fs.readFileSync(__dirname+'/public/index.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const stub={classList:{contains:()=>true,add(){},remove(){},toggle(){}},style:{},addEventListener(){},querySelectorAll:()=>[],innerHTML:''};
 const ctx=vm.createContext({WalletLens:{analyze},console,URL,Intl,Map,Set,Date,localStorage:{getItem:()=>null},document:{getElementById:()=>stub,querySelectorAll:()=>[],addEventListener(){}},setTimeout(){},setInterval(){},requestAnimationFrame(){}});
 vm.runInContext(script.replace(/loadUniverse\(false\);\s*$/,''),ctx);const run=s=>vm.runInContext(s,ctx);
 run(`var resolves={};getJSON=url=>new Promise(resolve=>resolves[new URL(url,'http://localhost').searchParams.get('timeframe')]=resolve);renderCard=()=>{};renderDetail=()=>{};var token={id:'test',chain:'base',token_address:'0xtest',token_age_hours:999};detailToken=token;var a=fetchFlow(token,'7d');var b=fetchFlow(token,'1h');`);
 const respond=tf=>run(`resolves['${tf}']({ok:true,timeframe:'${tf}',data:{smart_trader_wallet_count:${tf==='7d'?70:1}},fetched_at:new Date().toISOString()})`);
 respond('1h');await run('b');respond('7d');await run('a');assert.equal(run("flowById.get(flowKey(token,'1h')).data.smart_trader_wallet_count"),1);assert.equal(run("flowById.get(flowKey(token,'7d')).data.smart_trader_wallet_count"),70);
 run("detailTf='6h'");assert.equal(run("walletContext(token,detailTf).kind"),'loading');
 run("var old=fetchFlow(token,'6h')");run("resolves['6h']({ok:true,data:{}})");await run('old');assert.equal(run("flowById.get(flowKey(token,'6h')).ok"),false);
 console.log('PASS: all four upstream windows, per-window cache, matched price comparisons, out-of-order responses and old-server rejection');
})().catch(e=>{console.error(e);process.exitCode=1});

