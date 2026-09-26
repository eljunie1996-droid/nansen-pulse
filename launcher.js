const {spawn}=require('node:child_process');
const http=require('node:http');
function probe(){return new Promise(resolve=>{const req=http.get('http://localhost:3000/api/status',res=>{let body='';res.on('data',s=>{body+=s;if(body.length>10000)req.destroy()});res.on('end',()=>{try{resolve(JSON.parse(body))}catch{resolve({occupied:true})}})});req.setTimeout(1500,()=>req.destroy());req.on('error',e=>resolve(e.code==='ECONNREFUSED'?null:{occupied:true}))})}
function open(){if(process.platform==='win32')spawn('cmd',['/c','start','','http://localhost:3000'],{windowsHide:true,stdio:'ignore'}).unref()}
async function main(){
 if(Number(process.versions.node.split('.')[0])<22){console.error('Nansen Pulse needs Node.js 22 or newer.');process.exitCode=1;return}
 const running=await probe();
 if(running){if(running.app==='nansen-pulse'&&running.version==='5.22'){console.log('Nansen Pulse is already running. Opening it now.');open();return}
 console.error('Port 3000 is already in use, possibly by an older Nansen Pulse. Close that server before starting this version. Your current app has not been stopped.');process.exitCode=1;return}
 const child=spawn(process.execPath,['server.js'],{cwd:__dirname,stdio:'inherit'});child.on('exit',code=>{process.exitCode=code||0});child.on('error',e=>{console.error(e.message);process.exitCode=1});
}
if(require.main===module)main();
module.exports={probe};





