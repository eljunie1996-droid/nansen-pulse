
const {server}=require('../lib/pulse.cjs');
const handler=server.listeners('request')[0];
function equal(a,b){return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest())}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');return res.end('Method not allowed')}
 const u=new URL(req.url,'http://localhost');
 const allowed=new Set(['/','/index.html','/wallet-lens.js','/thesis.js','/api/status','/api/universe','/api/enrich','/api/info','/api/snapshot']);
 if(!allowed.has(u.pathname)){res.statusCode=404;return res.end('Not found')}
 if(['/api/enrich','/api/info','/api/snapshot'].includes(u.pathname)){
  const chain=u.searchParams.get('chain'),address=u.searchParams.get('address')||'',tf=u.searchParams.get('timeframe')||'1h';
  if(!['solana','base','robinhood','arc','bnb','arbitrum','ethereum'].includes(chain)||!['1h','6h','24h','7d'].includes(tf)||(chain==='solana'?!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address):!/^0x[0-9a-fA-F]{40}$/.test(address))){res.statusCode=400;return res.end('Invalid chain, contract address or timeframe')}
 }
 if(u.pathname.startsWith('/api/')&&!process.env.NANSEN_API_KEY){res.statusCode=503;return res.end(JSON.stringify({error:'Demo API configuration incomplete.'}))}
 return handler(req,res);
};
