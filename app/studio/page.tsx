'use client';
import Link from 'next/link';
import { Film, Layers3, Sparkles } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
const options = [
  { href: '/studio/criar', icon: Sparkles, title: 'Criar do zero', text: 'Briefing, roteiro, imagens, narração e vídeo a partir de uma ideia.', badge: 'Em preparação', tone: 'warn' },
  { href: '/studio/reaproveitar', icon: Film, title: 'Reaproveitar e editar', text: 'Envie um vídeo próprio ou autorizado para transcrever, cortar, legendar e adaptar.', badge: 'Disponível', tone: 'ok' },
  { href: '/studio/referencia', icon: Layers3, title: 'Adaptar referência', text: 'Use referências autorizadas para criar uma nova versão, com idioma, voz e identidade ajustáveis.', badge: 'Disponível com autorização', tone: 'ok' },
];
export default function Studio(){return <DashboardShell active="Studio"><main className="main"><p className="eyebrow">Produção de conteúdo</p><h1 className="title">Studio</h1><p style={{color:'#73758a',maxWidth:720}}>Escolha como deseja iniciar. Todo conteúdo passa por revisão antes de qualquer publicação.</p><div className="grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginTop:24}}>{options.map(({href,icon:Icon,title,text,badge,tone})=><Link href={href} className="card" key={href} style={{textDecoration:'none',color:'inherit',minHeight:230}}><span className="icon"><Icon size={21}/></span><h2 style={{margin:'22px 0 10px',fontFamily:'Space Grotesk'}}>{title}</h2><p style={{color:'#73758a',lineHeight:1.5}}>{text}</p><span className={`badge ${tone}`} style={{display:'inline-block',marginTop:12}}>{badge}</span></Link>)}</div><div className="section"><div className="section-head"><h2>Regra de direitos</h2></div><div className="card"><p style={{margin:0,color:'#73758a'}}>Use somente vídeos, áudios, imagens e referências próprios ou autorizados. A plataforma não fará scraping ou cópia automática de perfis de terceiros.</p></div></div></main></DashboardShell>}
