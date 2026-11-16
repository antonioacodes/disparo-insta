import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';
const run = promisify(execFile);
export const runtime = 'nodejs';
export async function POST(request: Request){ const body=await request.json().catch(()=>({})); const mediaId=typeof body.mediaId==='string'?body.mediaId:''; if(!mediaId)return NextResponse.json({ok:false,error:'mediaId é obrigatório.'},{status:400}); const input=path.join(process.cwd(),'storage','media',mediaId); try{await fs.access(input);}catch{return NextResponse.json({ok:false,error:'Mídia não encontrada no armazenamento local.'},{status:404});} const outDir=path.join(process.cwd(),'storage','transcripts',mediaId); await fs.mkdir(outDir,{recursive:true}); const bin=process.env.WHISPER_BIN||'whisper'; try{await run(bin,[input,'--output_dir',outDir,'--output_format','json','--task','transcribe'],{timeout:30*60*1000}); const json=JSON.parse(await fs.readFile(path.join(outDir,`${path.parse(mediaId).name}.json`),'utf8')); return NextResponse.json({ok:true,mediaId,language:json.language,segments:json.segments});}catch(error){return NextResponse.json({ok:false,error:'Whisper não está instalado/configurado ou falhou.',details:error instanceof Error?error.message:String(error),setup:'Instale whisper localmente ou defina WHISPER_BIN no ambiente.'},{status:503});}}
