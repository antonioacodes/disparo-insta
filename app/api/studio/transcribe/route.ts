import {requireStudioSession} from '../../../../lib/studioAccount';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
const run = promisify(execFile);
const jobs = new Map<string, {status:string; mediaId:string; segments?:unknown[]; error?:string}>();
export const runtime = 'nodejs';
export async function POST(request: Request){
  const denied=await requireStudioSession();if(denied)return denied;
 const body=await request.json().catch(()=>({})); const mediaId=typeof body.mediaId==='string'?body.mediaId:''; if(!mediaId)return NextResponse.json({ok:false,error:'mediaId é obrigatório.'},{status:400}); const input=path.join(process.cwd(),'storage','media',mediaId); try{await fs.access(input);}catch{return NextResponse.json({ok:false,error:'Mídia não encontrada no armazenamento local.'},{status:404});} const existing=Array.from(jobs.values()).find(j=>j.mediaId===mediaId&&(j.status==='queued'||j.status==='running'));if(existing)return NextResponse.json({ok:true,jobId:Array.from(jobs.entries()).find(([,j])=>j===existing)?.[0],status:existing.status},{status:202});const jobId=randomUUID();jobs.set(jobId,{status:'queued',mediaId});void processJob(jobId,mediaId,input);return NextResponse.json({ok:true,jobId,status:'queued'},{status:202});}
export async function GET(request:Request){
  const denied=await requireStudioSession();if(denied)return denied;
const id=new URL(request.url).searchParams.get('jobId')||'';const job=jobs.get(id);if(!job)return NextResponse.json({ok:false,error:'Processamento não encontrado.'},{status:404});return NextResponse.json({ok:true,jobId:id,...job,status:job.status});}
async function processJob(jobId:string,mediaId:string,input:string){const job=jobs.get(jobId)!;job.status='running';const outDir=path.join(process.cwd(),'storage','transcripts',mediaId);await fs.mkdir(outDir,{recursive:true});try{const bin=process.env.WHISPER_BIN||'whisper';const model=process.env.WHISPER_MODEL||'tiny';const result=await run(bin,[input,'--model',model,'--output_dir',outDir,'--output_format','json','--task','transcribe','--device','cpu','--language','pt','--fp16','False'],{timeout:30*60*1000});const jsonFile=(await fs.readdir(outDir)).find(name=>name.endsWith('.json'));if(!jsonFile)throw new Error(`Whisper não gerou JSON. Modelo: ${model}. Saída: ${result.stdout||'(vazia)'}. Erro: ${result.stderr||'(vazio)'}`);const json=JSON.parse(await fs.readFile(path.join(outDir,jsonFile),'utf8'));job.status='complete';job.segments=json.segments;}catch(error){job.status='error';job.error=error instanceof Error?error.message:String(error);}}