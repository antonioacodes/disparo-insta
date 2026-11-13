import { NextResponse } from 'next/server';

type DemoJob = { id: string; account: string; status: 'queued' | 'processing' | 'completed'; createdAt: string };
const jobs: DemoJob[] = [];

/** Demo-only queue endpoint. It never calls Instagram. Replace with BullMQ + Meta Graph API after OAuth/App Review. */
export async function GET() { return NextResponse.json({ mode: 'demo', jobs }); }

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const accounts = Array.isArray(body.accounts) ? body.accounts.filter((x: unknown): x is string => typeof x === 'string') : [];
  if (!accounts.length) return NextResponse.json({ error: 'Selecione ao menos uma conta.' }, { status: 400 });
  const createdAt = new Date().toISOString();
  const created = accounts.map((account, index) => ({ id: `demo-${Date.now()}-${index}`, account, status: 'queued' as const, createdAt }));
  jobs.push(...created);
  return NextResponse.json({ mode: 'demo', accepted: created.length, jobs: created }, { status: 202 });
}
