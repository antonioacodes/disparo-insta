import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';
const run=promisify(execFile);
type Cut={start:number;end:number;approved:boolean;text?:string};
type CaptionStyle='classic'|'minimal'|'highlight';
export const runtime='nodejs';
export async function POST(request:Request){
 const body=await request.json().catch(()=>({}));
 const mediaId=typeof body.mediaId==='string'?body.mediaId:'';
 const cuts=Array.isArray(body.cuts)?body.cuts as Cut[]:[];
 const style:CaptionStyle=body.style==='minimal'||body.style==='highlight'?body.style:'classic';
 const format=body.format==='horizontal'?'horizontal':'vertical';
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(mediaId)||!cuts.length)return NextResponse.json({ok:false,error:'mediaId e cortes são obrigatórios.'},{status:400});
 const approved=cuts.filter(c=>c.approved&&Number(c.end)>Number(c.start));
 if(!approved.length)return NextResponse.json({ok:false,error:'Aprove ao menos um corte válido.'},{status:400});
 const input=path.join(process.cwd(),'storage','media',mediaId); const dir=path.join(process.cwd(),'storage','renders'); await fs.mkdir(dir,{recursive:true});
 const output=path.join(dir,`${Date.now()}-${path.parse(mediaId).name}-${format}.mp4`); const ass=path.join(dir,`${Date.now()}-captions.ass`);
 const colors={classic:'&H00FFFFFF',minimal:'&H00FFFFFF',highlight:'&H0000FFFF'};
 const ts=(n:number)=>{const h=Math.floor(n/3600);const m=Math.floor((n%3600)/60);const s=(n%60).toFixed(2).padStart(5,'0');return `${h}:${String(m).padStart(2,'0')}:${s}`};
 const lines=approved.map(c=>`Dialogue: 0,${ts(c.start-approved[0].start)},${ts(c.end-approved[0].start)},Main,,0,0,0,,${String(c.text||'').replace(/[{}]/g,'')}`).join('\n');
 await fs.writeFile(ass,`[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Main,Arial,${style==='highlight'?58:48},${colors[style]},&H00000000,&H00000000,&H99000000,1,0,0,0,100,100,0,0,1,3,1,2,60,60,180,1\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${lines}\n`);
 const dimensions=format==='horizontal'?['1920','1080']:['1080','1920'];
 const start=approved[0].start;
 const duration=approved[approved.length-1].end-start;
 const filter='scale='+dimensions.join(':')+':force_original_aspect_ratio=increase,crop='+dimensions.join(':')+',ass='+ass;
 try{await run('ffmpeg',['-y','-ss',String(start),'-i',input,'-t',String(duration),'-vf',filter,'-map','0:v:0','-map','0:a:0?','-c:a','aac','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',output],{timeout:60*60*1000});return NextResponse.json({ok:true,output:path.relative(process.cwd(),output),cuts:approved.length,style,format});}catch(error){await fs.rm(output,{force:true});return NextResponse.json({ok:false,error:'FFmpeg falhou.',details:error instanceof Error?error.message:String(error)},{status:503});}finally{await fs.rm(ass,{force:true});}
}
