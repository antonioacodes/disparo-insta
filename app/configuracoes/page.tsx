import Link from 'next/link';
export default function Configuracoes(){return <main className="main"><p className="eyebrow">Servidor</p><h1 className="title">Configurações</h1><div className="card" style={{marginTop:24}}><p>Configure as variáveis da Meta no ambiente do servidor e valide a integração.</p><Link className="btn" href="/diagnostico">Testar integração</Link></div></main>}
