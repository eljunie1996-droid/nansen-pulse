const LIMIT=300;
const SCRIPT=`local used=tonumber(redis.call('GET',KEYS[1]) or '0'); if used>=tonumber(ARGV[1]) then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],172800); return 1`;
async function reserve({now=Date.now(),fetcher=fetch,env=process.env}={}){
 const url=env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL,token=env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN;
 if(!url||!token)throw Object.assign(new Error('Public demo quota storage is not configured.'),{status:503});
 // Calendar day in Vietnam, shared across all deployed instances and callers.
 const day=new Date(now+7*3600000).toISOString().slice(0,10);
 let response,json;
 try{response=await fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',SCRIPT,1,'pulse:nansen:daily:'+day,LIMIT]),signal:AbortSignal.timeout(8000)});json=await response.json()}catch{throw Object.assign(new Error('Quota service unavailable. No new Nansen request was sent.'),{status:503})}
 if(!response.ok||json.error||![0,1].includes(json.result))throw Object.assign(new Error('Quota service unavailable. No new Nansen request was sent.'),{status:503});
 if(json.result===0)throw Object.assign(new Error('Public demo reached 300 Nansen calls today. Try again after midnight Vietnam time.'),{status:429});
}
module.exports={reserve,LIMIT,SCRIPT};
