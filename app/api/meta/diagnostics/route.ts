import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION || 'v27.0';
  if (!token) return NextResponse.json({ ok: false, stage: 'configuration', message: 'META_ACCESS_TOKEN não configurado no servidor.', required: ['META_APP_ID','META_APP_SECRET','META_REDIRECT_URI','META_ACCESS_TOKEN'] }, { status: 503 });
  const url = `https://graph.instagram.com/${version}/me?fields=id,username,account_type&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => ({ message: 'Resposta não-JSON da Meta' }));
  return NextResponse.json({ ok: response.ok, stage: 'meta-api', request: { method: 'GET', endpoint: `/me`, version }, status: response.status, response: body }, { status: response.ok ? 200 : 502 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const version = process.env.META_API_VERSION || 'v27.0';
  if (!token) return NextResponse.json({ ok: false, stage: 'validation', message: 'Informe um token.' }, { status: 400 });
  const response = await fetch(`https://graph.instagram.com/${version}/me?fields=id,username,account_type&access_token=${encodeURIComponent(token)}`, { cache: 'no-store' });
  const result = await response.json().catch(() => ({ message: 'Resposta não-JSON da Meta' }));
  return NextResponse.json({ ok: response.ok, stage: 'meta-api', request: { method: 'GET', endpoint: '/me', version }, status: response.status, response: result, persisted: false, message: response.ok ? 'Token validado. Ele não foi armazenado.' : 'A Meta rejeitou o token.' }, { status: response.ok ? 200 : 502 });
}
