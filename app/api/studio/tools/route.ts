import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';
const run = promisify(execFile);
async function check(command: string, args: string[]) { try { const { stdout } = await run(command, args); return { available: true, version: stdout.split('\n')[0] }; } catch { return { available: false }; } }
export async function GET(){ return NextResponse.json({ ffmpeg: await check('ffmpeg',['-version']), ffprobe: await check('ffprobe',['-version']), whisper: await check(process.env.WHISPER_BIN || 'whisper',['--help']) }); }
