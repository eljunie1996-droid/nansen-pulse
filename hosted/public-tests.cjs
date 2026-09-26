const assert=require('node:assert/strict');
const handler=require('./api/index');
async function request(url){let body='';const res={statusCode:200,setHeader(){},writeHead(c){this.statusCode=c},end(s){body=String(s)}};await handler({url,method:'GET',headers:{host:'localhost'}},res);return {status:res.statusCode,body}}
(async()=>{assert.match((await request('/')).body,/Nansen Pulse/);assert.equal((await request('/lib/pulse.cjs')).status,404);assert.equal((await request('/api/snapshot?chain=base&address=bad')).status,400);delete process.env.NANSEN_API_KEY;assert.equal((await request('/api/universe')).status,503);console.log('PASS: public UI without password; source blocked; parameters validated; absent API key fails closed')})().catch(e=>{console.error(e);process.exitCode=1});
