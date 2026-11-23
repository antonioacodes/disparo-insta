import {execute} from '../../../../lib/studioAccount';
import {NextRequest,NextResponse} from 'next/server';
export const dynamic='force-dynamic';
const cookie='studio_session';
async function handle(req:NextRequest,action:string){
  if(!(req.method==='GET'?['session','users']:['signin','signout','create','presence','password']).includes(action))return new NextResponse(null,{status:404});
  if(req.method==='POST'&&(!req.headers.get('content-type')?.includes('application/json')||req.headers.get('sec-fetch-site')==='cross-site'))return new NextResponse(null,{status:403});
  try{
    const payload=req.method==='GET'?{}:await req.json();
    const result=await execute(action,{...payload,token:req.cookies.get(cookie)?.value??''});
    const response=NextResponse.json(action==='signin'&&result.token?{ok:true}:result,{status:Number(result.status)||200,headers:{'Cache-Control':'private, no-store'}});
    if(action==='signin'&&typeof result.token==='string')response.cookies.set(cookie,result.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:Number(result.maxAge)});
    if(action==='signout'||(action==='password'&&result.ok))response.cookies.delete(cookie);
    return response;
  }catch{return NextResponse.json({error:'Serviço de contas indisponível.'},{status:503})}
}
export const GET=(r:NextRequest,c:{params:{action:string}})=>handle(r,c.params.action);
export const POST=GET;
