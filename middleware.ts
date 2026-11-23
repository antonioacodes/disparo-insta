import {NextRequest,NextResponse} from 'next/server';
export async function middleware(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(path==='/entrar'||path.startsWith('/api/account/')||path==='/api/youtube/callback')return NextResponse.next();
  if(path.startsWith('/api/'))return NextResponse.next();
  const cookie=req.cookies.get('studio_session');
  if(cookie){
    try{
      const session=await fetch('http://127.0.0.1:'+(process.env.STUDIO_INTERNAL_PORT||process.env.PORT||'3000')+'/api/account/session',{headers:{cookie:'studio_session='+encodeURIComponent(cookie.value)},cache:'no-store'});
      if(session.ok){
        if(req.method!=='GET'&&req.headers.get('sec-fetch-site')==='cross-site')return new NextResponse(null,{status:403});
        return NextResponse.next();
      }
    }catch{return new NextResponse('Serviço de contas indisponível',{status:503})}
  }
  return path.startsWith('/api/')?NextResponse.json({error:'Entre no Studio para continuar.'},{status:401}):new NextResponse(null,{status:307,headers:{Location:'/entrar'}});
}
export const config={matcher:['/((?!_next/static|_next/image|office/|favicon.ico).*)']};
