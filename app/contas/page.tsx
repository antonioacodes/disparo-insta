import Link from 'next/link';
export default function Contas(){return <main className="main"><p className="eyebrow">Dados reais</p><h1 className="title">Contas</h1><div className="card" style={{marginTop:24}}><p>Nenhuma conta conectada. A conexão oficial será feita por OAuth da Meta.</p><Link className="btn" href="/diagnostico">Abrir diagnóstico</Link></div></main>}
