import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const root=path.join(process.cwd(),'storage','media');
const meta=path.join(process.cwd(),'storage','media-meta');
export async function GET(){await fs.mkdir(root,{recursive:true});await fs.mkdir(meta,{recursive:true});const files=(await fs.readdir(root)).filter(f=>!f.startsWith('.'));const items=await Promise.all(files.map(async id=>{const stat=await fs.stat(path.join(root,id));let originalName=id;let bytes=stat.size;try{const m=JSON.parse(await fs.readFile(path.join(meta,id.split('-')[0]+'.json'),'utf8'));originalName=m.media.originalName;bytes=m.media.bytes;}catch{}return {id,originalName,bytes,updatedAt:stat.mtime.toISOString()};}));return NextResponse.json({ok:true,media:items});}
