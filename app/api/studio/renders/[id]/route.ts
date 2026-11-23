import {requireStudioSession} from '../../../../../lib/studioAccount';
import { promises as fs } from 'fs'; import path from 'path'; import { NextResponse } from 'next/server';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const denied=await requireStudioSession();if(denied)return denied;
const file=path.join(process.cwd(),'storage','renders',path.basename(params.id));try{const data=await fs.readFile(file);return new NextResponse(data,{headers:{'Content-Type':'video/mp4','Cache-Control':'private, max-age=3600'}})}catch{return NextResponse.json({ok:false,error:'Render não encontrado.'},{status:404})}}
