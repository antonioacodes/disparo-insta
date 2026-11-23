import {requireStudioSession} from '../../../../../lib/studioAccount';
import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const denied=await requireStudioSession();if(denied)return denied;
const safe=path.basename(params.id);try{const file=await fs.readFile(path.join(process.cwd(),'storage','media',safe));const ext=path.extname(safe).toLowerCase();const type=ext==='.mkv'?'video/x-matroska':ext==='.mp4'?'video/mp4':ext==='.webm'?'video/webm':ext==='.mov'?'video/quicktime':'audio/mpeg';return new NextResponse(file,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=3600'}});}catch{return NextResponse.json({ok:false,error:'Mídia não encontrada.'},{status:404});}}
export async function DELETE(_request:Request,{params}:{params:{id:string}}){
  const denied=await requireStudioSession();if(denied)return denied;
const safe=path.basename(params.id);try{await fs.rm(path.join(process.cwd(),'storage','media',safe),{force:true});const hash=safe.split('-')[0];await fs.rm(path.join(process.cwd(),'storage','media-meta',hash+'.json'),{force:true});await fs.rm(path.join(process.cwd(),'storage','transcripts',safe),{recursive:true,force:true});return NextResponse.json({ok:true,deleted:safe});}catch{return NextResponse.json({ok:false,error:'Não foi possível excluir a mídia.'},{status:500});}}
