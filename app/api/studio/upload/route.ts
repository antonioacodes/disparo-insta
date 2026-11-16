import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const allowed = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const maxBytes = 500 * 1024 * 1024;
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  const projectId = form.get('projectId');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Envie um arquivo de vídeo ou áudio.' }, { status: 400 });
  if (!allowed.has(file.type)) return NextResponse.json({ ok: false, error: `Formato não suportado: ${file.type || 'desconhecido'}. Use MP4, MOV, WebM, MP3 ou WAV.` }, { status: 415 });
  if (file.size > maxBytes) return NextResponse.json({ ok: false, error: 'O arquivo excede o limite de 500 MB.' }, { status: 413 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = `${Date.now()}-${safeName}`;
  const dir = path.join(process.cwd(), 'storage', 'media');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ ok: true, media: { id, originalName: file.name, mimeType: file.type, bytes: file.size, projectId: typeof projectId === 'string' ? projectId : null, storedAt: new Date().toISOString() } }, { status: 201 });
}
