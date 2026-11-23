import {requireStudioSession} from '../../../../../lib/studioAccount';
import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
export const runtime='nodejs';
const maxChunk=1024*1024;
const mediaRoot=path.join(process.cwd(),'storage','media');
const metaRoot=path.join(process.cwd(),'storage','media-meta');
export async function POST(request:Request){
  const denied=await requireStudioSession();if(denied)return denied;
const h=request.headers;const uploadId=h.get('x-upload-id')||'';const index=Number(h.get('x-chunk-index'));const total=Number(h.get('x-total-chunks'));const encodedName=h.get('x-file-name-utf8');
let originalName:string;
try {
  originalName=path.basename(encodedName ? decodeURIComponent(encodedName) : h.get('x-file-name')||'upload.bin');
} catch {
  return NextResponse.json({ok:false,error:'Nome do arquivo inválido.'},{status:400});
}
const name=originalName.replace(/[^a-zA-Z0-9._-]/g,'_');const mime=h.get('x-file-type')||'application/octet-stream';if(!/^[a-zA-Z0-9_-]{1,64}$/.test(uploadId)||!Number.isInteger(index)||!Number.isInteger(total)||index<0||index>=total)return NextResponse.json({ok:false,error:'Cabeçalhos de upload inválidos.'},{status:400});const data=Buffer.from(await request.arrayBuffer());if(data.length>maxChunk)return NextResponse.json({ok:false,error:'Chunk excede 1 MB.'},{status:413});const dir=path.join(process.cwd(),'storage','chunks',uploadId);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,String(index)),data);const files=await fs.readdir(dir);if(files.length<total)return NextResponse.json({ok:true,complete:false,index,total});await fs.mkdir(mediaRoot,{recursive:true});await fs.mkdir(metaRoot,{recursive:true});const temp=path.join(mediaRoot,`.${uploadId}-${name}.part`);const hash=createHash('sha256');const handle=await fs.open(temp,'w');let bytes=0;try{for(let i=0;i<total;i++){const chunk=await fs.readFile(path.join(dir,String(i)));hash.update(chunk);bytes+=chunk.length;await handle.writeFile(chunk);}}finally{await handle.close();}const digest=hash.digest('hex');const metas=await fs.readdir(metaRoot);for(const metaFile of metas){try{const meta=JSON.parse(await fs.readFile(path.join(metaRoot,metaFile),'utf8'));if(meta.sha256===digest&&meta.bytes===bytes){await fs.rm(temp,{force:true});await fs.rm(dir,{recursive:true,force:true});return NextResponse.json({ok:true,complete:true,reused:true,media:meta.media},{status:200});}}catch{}}const id=`${digest}-${name}`;const out=path.join(mediaRoot,id);await fs.rename(temp,out);const media={id,originalName,mimeType:mime,bytes,sha256:digest};await fs.writeFile(path.join(metaRoot,`${digest}.json`),JSON.stringify({sha256:digest,bytes,media},null,2));await fs.rm(dir,{recursive:true,force:true});return NextResponse.json({ok:true,complete:true,reused:false,media},{status:201});}