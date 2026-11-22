import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';
const run = promisify(execFile);
async function worker(args:string[]) {
  const {stdout} = await run('python3',['-m','studio.worker',...args],{timeout:15000,maxBuffer:8*1024*1024});
  return stdout.trim();
}

export async function GET() {
  try { return NextResponse.json(JSON.parse(await worker(['list']))); }
  catch { return NextResponse.json({error:'Falha ao consultar a fila do Studio.'},{status:503}); }
}

export async function POST(request:Request) {
  try {
    const {action,id,title,start,end,corrections,preset} = await request.json();
    if(action==='captions' && typeof id==='string' && /^[a-f0-9]{32}-\d+$/.test(id)) return NextResponse.json(JSON.parse(await worker(['captions',id])));
    if(action==='revise' && typeof id==='string' && /^[a-f0-9]{32}-\d+$/.test(id) && typeof title==='string' && Number.isFinite(start) && Number.isFinite(end)){
      return NextResponse.json({version:await worker(['revise',id,title.slice(0,200),String(start),String(end),JSON.stringify(corrections||{})])},{status:201});
    }
    if (action==='create' && typeof id==='string' && /^[\w.-]+$/.test(id) && typeof title==='string' && title.trim()) {
      return NextResponse.json({project:await worker(['create',id,title.trim().slice(0,200),JSON.stringify(preset||{})])},{status:201});
    }
    if (['approve','reject'].includes(action) && typeof id==='string' && /^[a-f0-9]{32}-\d+$/.test(id)) {
      await worker([action,id]);
      return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:'Solicitação inválida.'},{status:400});
  } catch { return NextResponse.json({error:'Operação recusada. Confira o arquivo e o estado atual do corte.'},{status:409}); }
}
