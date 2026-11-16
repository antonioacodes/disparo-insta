import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
export async function GET(_request: Request, { params }: { params: { id: string } }) { const safe = path.basename(params.id); try { const file = await fs.readFile(path.join(process.cwd(), 'storage', 'media', safe)); const ext = path.extname(safe).toLowerCase(); const type = ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'audio/mpeg'; return new NextResponse(file, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } }); } catch { return NextResponse.json({ ok: false, error: 'Mídia não encontrada.' }, { status: 404 }); } }
