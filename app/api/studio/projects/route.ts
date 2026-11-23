import {requireStudioSession} from '../../../../lib/studioAccount';
import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const root = path.join(process.cwd(), 'storage', 'projects');
async function ensure() { await fs.mkdir(root, { recursive: true }); }

export async function GET() {
  const denied=await requireStudioSession();if(denied)return denied;

  await ensure();
  const files = (await fs.readdir(root)).filter((file) => file.endsWith('.json'));
  const projects = await Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))));
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  const denied=await requireStudioSession();if(denied)return denied;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
  if (!title || !brief) return NextResponse.json({ ok: false, error: 'Título e briefing são obrigatórios.' }, { status: 400 });
  await ensure();
  const id = `project-${Date.now()}`;
  const project = { id, title, brief, preset:body.preset, mode:body.mode, language:body.language, voice:body.voice, stage: 'briefing', media: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(root, `${id}.json`), JSON.stringify(project, null, 2));
  return NextResponse.json({ ok: true, project }, { status: 201 });
}

export async function DELETE(request:Request) {
  const denied=await requireStudioSession();if(denied)return denied;

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^project-\d+$/.test(id)) return NextResponse.json({error:'Projeto inválido.'},{status:400});
  await fs.rm(path.join(root,id+'.json'),{force:true});
  return NextResponse.json({ok:true});
}
