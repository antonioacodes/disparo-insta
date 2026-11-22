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
  if(project !== null){
    if(!/^[a-f0-9]{32}$/.test(project)) return NextResponse.json({error:'Projeto inválido.'},{status:400});
    try {return NextResponse.json(JSON.parse(await worker(['history',project])));}
    catch {return NextResponse.json({error:'Falha ao carregar o histórico.'},{status:503});}
  }
  try { return NextResponse.json(JSON.parse(await worker(['list']))); }
  catch { return NextResponse.json({error:'Falha ao consultar a fila do Studio.'},{status:503}); }
}

export async function POST(request:Request) {
  try {
    const {action,id,title,start,end,corrections,preset,deletePreview,url} = await request.json();
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
