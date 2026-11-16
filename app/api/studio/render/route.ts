import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';
const run=promisify(execFile);
type Cut={start:number;end:number;approved:boolean};
export const runtime='nodejs';
export async function POST(request:Request){const body=await request.json().catch(()=>({}));const mediaId=typeof body.mediaId==='string'?body.mediaId:'';const cuts=Array.isArray(body.cuts)?body.cuts as Cut[]:[];if(!mediaId||!cuts.length)return NextResponse.json({ok:false,error:'mediaId e cortes são obrigatórios.'},{status:400});const approved=cuts.filter(c=>c.approved&&Number(c.end)>Number(c.start));if(!approved.length)return NextResponse.json({ok:false,error:'Aprove ao menos um corte válido.'},{status:400});const input=path.join(process.cwd(),'storage','media',mediaId);const dir=path.join(process.cwd(),'storage','renders');await fs.mkdir(dir,{recursive:true});const output=path.join(dir,`${Date.now()}-${path.parse(mediaId).name}-vertical.mp4`);const filters=approved.map((c,i)=>`[0:v]trim=start=${c.start}:end=${c.end},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v${i}]`).join(';');const concat=approved.map((_,i)=>`[v${i}]`).join('')+`concat=n=${approved.length}:v=1:a=0[outv]`;try{await run('ffmpeg',['-y','-i',input,'-filter_complex',`${filters};${concat}`,'-map','[outv]','-an','-c:v','libx264','-pix_fmt','yuv420p',output],{timeout:60*60*1000});return NextResponse.json({ok:true,output:path.relative(process.cwd(),output),cuts:approved.length});}catch(error){return NextResponse.json({ok:false,error:'FFmpeg falhou.',details:error instanceof Error?error.message:String(error)},{status:503});}}
