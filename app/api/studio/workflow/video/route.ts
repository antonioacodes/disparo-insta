import {open} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';

export async function GET(request:Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id') || '';
  const kind = params.get('kind');
  if (!/^[a-f0-9]{32}-\d+$/.test(id) || !['preview','final'].includes(kind||'')) return new Response(null,{status:400});
  const file = await open(path.join(process.cwd(),'storage','studio',id.split('-')[0],id+'-'+kind+'.mp4'),'r').catch(()=>null);
  if (!file) return new Response(null,{status:404});
  const {size} = await file.stat();
  const range = request.headers.get('range');
  const match = range?.match(/^bytes=(\d+)-(\d*)$/);
  const start = match ? Number(match[1]) : 0;
  const end = match?.[2] ? Math.min(size-1,Number(match[2])) : size-1;
  if ((range && !match) || start>end) { await file.close(); return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}}); }
  const headers = new Headers({'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':'private, no-store'});
  if(match) headers.set('Content-Range',`bytes ${start}-${end}/${size}`);
  return new Response(Readable.toWeb(file.createReadStream({start,end})) as ReadableStream<Uint8Array>,{status:match?206:200,headers});
}
