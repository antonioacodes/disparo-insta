import {NextRequest,NextResponse} from 'next/server';

export async function middleware(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(path==='/entrar'||path==='/api/account/signin'||path==='/api/account/session')return NextResponse.next();

  // Account endpoints check the session in the same transaction as the action.
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.get('sec-fetch-site')==='cross-site')return new NextResponse(null,{status:403});
  const navigation=req.headers.get('sec-fetch-mode')==='navigate';
  if(path.startsWith('/api/account/')&&!navigation)return NextResponse.next();

  const token=req.cookies.get('studio_session')?.value;
  if(token){
    try{
      const port=process.env.STUDIO_INTERNAL_PORT||process.env.PORT||(process.env.NODE_ENV==='production'?'3010':'3000');
      const session=await fetch('http://127.0.0.1:'+port+'/api/account/session',{
        headers:{cookie:'studio_session='+encodeURIComponent(token)},cache:'no-store'
      });
      if(session.ok)return NextResponse.next();
      if(session.status!==401)return new NextResponse('Serviço de contas indisponível',{status:503});
    }catch{return new NextResponse('Serviço de contas indisponível',{status:503})}
  }
  if(path.startsWith('/api/')&&!navigation)return NextResponse.json({error:'Entre no Studio para continuar.'},{status:401});
  return new NextResponse(null,{status:303,headers:{Location:'/entrar','Cache-Control':'private, no-store'}});
}
export const config={matcher:['/((?!_next/static/|_next/image$|favicon\\.ico$).*)']};
