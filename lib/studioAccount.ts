import {spawn} from 'node:child_process';
import {cookies,headers} from 'next/headers';
export async function execute(action:string,data:object){
  return new Promise<Record<string,unknown>>((resolve,reject)=>{
    const proc=spawn('python3',['-m','studio.accounts',action],{stdio:['pipe','pipe','ignore'],timeout:10000});
    let out='';proc.stdout.on('data',s=>out+=s);proc.once('error',reject);
    proc.once('close',code=>{try{if(code)throw Error();resolve(JSON.parse(out))}catch(e){reject(e)}});
    proc.stdin.on('error',reject);proc.stdin.end(JSON.stringify(data));
  });
}

export async function studioSession(){
  const token=cookies().get('studio_session')?.value;
  if(!token)return null;
  const user=await execute('session',{token});
  return typeof user.id==='number'?user:null;
}
export async function requireStudioSession(){
  if(['cross-site','same-site'].includes(headers().get('sec-fetch-site')||''))return new Response(null,{status:403});
  return await studioSession()?null:Response.json({error:'Entre no Studio para continuar.'},{status:401});
}
