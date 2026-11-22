import path from 'node:path';
import { readFile, stat, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const pending = new Map<string, Promise<Buffer>>();
let tail: Promise<unknown> = Promise.resolve();

async function cover(project: string, id: string) {
  const dir = path.join(process.cwd(), 'storage', 'studio', project);
  const jpg = path.join(dir, id + '-poster.jpg');
  try { return await readFile(jpg); } catch {}
  const input = path.join(dir, id + '-preview.mp4');
  await stat(input);
  await run('ffmpeg', ['-nostdin','-loglevel','error','-y','-ss','0.5','-i',input,'-frames:v','1','-vf','scale=320:-2','-threads','1',jpg+'.tmp.jpg'], {timeout:20000});
  await rename(jpg+'.tmp.jpg',jpg);
  return readFile(jpg);
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  const match = /^([a-f0-9]{32})-\d+$/.exec(id);
  if (!match) return new Response(null,{status:400});
  let task = pending.get(id);
  if (!task) {
    task = tail.then(()=>cover(match[1],id));
    pending.set(id,task);
    tail = task.catch(()=>undefined).finally(()=>pending.delete(id));
  }
  try { return new Response(new Uint8Array(await task),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400'}}); }
  catch { return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}}); }
}
