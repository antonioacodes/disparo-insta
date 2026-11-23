import {requireStudioSession} from '../../../../lib/studioAccount';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';
const exec=promisify(execFile);
async function call(args:string[]){
  const {stdout}=await exec('python3',['-m','studio.worker',...args],{timeout:15000,maxBuffer:2*1024*1024});
  return JSON.parse(stdout);
}
export async function GET(){
  const denied=await requireStudioSession();if(denied)return denied;

  try{return NextResponse.json(await call(['trend-list']))}
  catch{return NextResponse.json({error:'Não foi possível carregar as pesquisas.'},{status:503})}
}
export async function POST(request:Request){
  const denied=await requireStudioSession();if(denied)return denied;

  const origin=request.headers.get('origin');
  if(origin && new URL(origin).host!==request.headers.get('host'))
    return NextResponse.json({error:'Origem inválida.'},{status:403});
  try{
    const {query,country,days,platform,action,id}=await request.json();
    if(action==='cancel'||action==='delete'){
      if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Relatório inválido.'},{status:400});
      const result=await call(['trend-manage',String(id),action]);
      return NextResponse.json(result,{status:result.ok?200:409});
    }
    if(typeof query!=='string'||query.trim().length<2||query.length>120||!['YouTube','Twitch'].includes(platform)||
       typeof country!=='string'||!/^[A-Z]{2}$/.test(country)||![-1,0,1,3,7,30].includes(days))
      return NextResponse.json({error:'Confira o tema e os filtros.'},{status:400});
    const result=await call(['trend-submit',query,country,String(days),platform]);
    return NextResponse.json(result,{status:result.error?409:202});
  }catch{return NextResponse.json({error:'Não foi possível iniciar a pesquisa.'},{status:503})}
}
