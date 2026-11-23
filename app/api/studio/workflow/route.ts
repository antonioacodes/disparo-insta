import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';
const run = promisify(execFile);
async function worker(args:string[]) {
  const {stdout} = await run('python3',['-m','studio.worker',...args],{timeout:15000,maxBuffer:8*1024*1024});
  return stdout.trim();
}

export async function GET(request:Request) {
  const project = new URL(request.url).searchParams.get('history');
  if(new URL(request.url).searchParams.has('roteiros')){
    try{return NextResponse.json(JSON.parse(await worker(['roteiros','list',''])))}catch{return NextResponse.json({error:'Roteiros indisponíveis.'},{status:503})}
  }
  if(project !== null){
    if(!/^[a-f0-9]{32}$/.test(project)) return NextResponse.json({error:'Projeto inválido.'},{status:400});
    try {return NextResponse.json(JSON.parse(await worker(['history',project])));}
    catch {return NextResponse.json({error:'Falha ao carregar o histórico.'},{status:503});}
  }
  try {
    const office=new URL(request.url).searchParams.has('office');
    const result=JSON.parse(await worker([office?'office':'list']));
    if(office)result.reviewEnabled=process.env.STUDIO_ACTIVITY_REVIEW_ENABLED==='1';
    return NextResponse.json(result);
  }
  catch { return NextResponse.json({error:'Falha ao consultar a fila do Studio.'},{status:503}); }
}

export async function POST(request:Request) {
  try {
    const {action,id,title,start,end,corrections,preset,deletePreview,url,payload} = await request.json();
    if(action==='activity-review'){
      if(process.env.STUDIO_ACTIVITY_REVIEW_ENABLED!=='1')return NextResponse.json({error:'Decisões aguardam confirmação da proteção de acesso ao Studio.'},{status:403});
      if(!['briefing','script','video','preview','trend','job'].includes(payload?.kind)||!['approve','reject'].includes(payload?.decision)||typeof id!=='string'||id.length>100)
        return NextResponse.json({error:'Decisão inválida.'},{status:400});
      const result=JSON.parse(await worker(['activity-review',payload.kind,id,payload.decision,JSON.stringify(payload.options??{})]));
      return NextResponse.json(result,{status:result.error?409:200});
    }
    if(typeof action==='string' && action.startsWith('roteiros/')){
      const operation=action.slice('roteiros/'.length);
      if (!['briefing','gerar','aprovar','rejeitar','nova-versao','produzir','regenerar','aprovar-video','retomar'].includes(operation))
        return NextResponse.json({error:'Ação indisponível.'},{status:400});
      const body=JSON.stringify(payload??{});
      if(body.length>40000)return NextResponse.json({error:'Briefing muito extenso.'},{status:400});
      const result=JSON.parse(await worker(['roteiros',operation,String(id??''),body]));
      return NextResponse.json(result,{status:result.error?409:200});
    }
    if(action==='import' && typeof url==='string' && url.startsWith('https://') && url.length<=4096 && typeof title==='string'){
      return NextResponse.json({project:await worker(['import',url,title.trim().slice(0,200)||'Vídeo por link',JSON.stringify(preset||{})])},{status:202});
    }
    if(action==='delete-project' && typeof id==='string' && /^[a-f0-9]{32}$/.test(id)){
      await worker(['delete-project',id]);
      return NextResponse.json({ok:true});
    }
    if(action==='captions' && typeof id==='string' && /^[a-f0-9]{32}-\d+$/.test(id)) return NextResponse.json(JSON.parse(await worker(['captions',id])));
    if(action==='revise' && typeof id==='string' && /^[a-f0-9]{32}-\d+$/.test(id) && typeof title==='string' && Number.isFinite(start) && Number.isFinite(end)){
      return NextResponse.json({version:await worker(['revise',id,title.slice(0,200),String(start),String(end),JSON.stringify(corrections||{})])},{status:201});
    }
    if (action==='create' && typeof id==='string' && /^[\w.-]+$/.test(id) && typeof title==='string' && title.trim()) {
      return NextResponse.json({project:await worker(['create',id,title.trim().slice(0,200),JSON.stringify(preset||{})])},{status:201});
    }
    if (['approve','reject'].includes(action) && typeof id==='string' && /^[a-f0-9]{32}-\d+$/.test(id)) {
      await worker(action==='reject' && deletePreview===true?[action,id,'delete-preview']:[action,id]);
      return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:'Solicitação inválida.'},{status:400});
  } catch { return NextResponse.json({error:'Operação recusada. Confira o arquivo e o estado atual do corte.'},{status:409}); }
}
