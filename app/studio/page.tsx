'use client';
import { useState } from 'react';
import DashboardShell from '../components/DashboardShell';

type Stage = 'briefing' | 'roteiro' | 'cortes' | 'aprovacao' | 'exportacao';
const stages: { id: Stage; label: string }[] = [
  { id: 'briefing', label: 'Briefing' }, { id: 'roteiro', label: 'Roteiro' }, { id: 'cortes', label: 'Cortes' }, { id: 'aprovacao', label: 'Aprovação' }, { id: 'exportacao', label: 'Exportação' },
];

export default function Studio() {
  const [stage, setStage] = useState<Stage>('briefing');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [saved, setSaved] = useState(false);
  const current = stages.findIndex((item) => item.id === stage);
  const next = () => setStage(stages[Math.min(current + 1, stages.length - 1)].id);
  return <DashboardShell active="Studio"><main className="main">
    <div className="top"><div><p className="eyebrow">Produção de conteúdo</p><h1 className="title">Studio</h1></div><span className="badge warn">Rascunho local</span></div>
    <div className="card" style={{ marginBottom: 24 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>{stages.map((item, index) => <button key={item.id} onClick={() => setStage(item.id)} className={index <= current ? 'btn' : 'btn secondary'} style={{ flex: 1, minWidth: 120 }}>{index + 1}. {item.label}</button>)}</div></div>
    {stage === 'briefing' && <div className="card"><h2>Novo projeto</h2><p style={{ color: '#73758a' }}>Crie um projeto de vídeo e avance pelas etapas. Nada será publicado sem sua aprovação.</p><label style={{ display: 'block', marginTop: 16 }}>Nome do projeto<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Shorts da semana" style={{ display: 'block', width: '100%', padding: 12, marginTop: 6, border: '1px solid #e7e8f0', borderRadius: 9 }} /></label><label style={{ display: 'block', marginTop: 16 }}>Objetivo e contexto<textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Tema, público, oferta, tom e referências" rows={6} style={{ display: 'block', width: '100%', padding: 12, marginTop: 6, border: '1px solid #e7e8f0', borderRadius: 9, resize: 'vertical' }} /></label><button className="btn" style={{ marginTop: 16 }} onClick={() => { setSaved(true); next(); }} disabled={!title.trim() || !brief.trim()}>Salvar briefing e continuar</button>{saved && <p className="trend">Briefing salvo nesta sessão. Banco de dados será conectado na próxima etapa.</p>}</div>}
    {stage !== 'briefing' && <div className="card"><h2>{stages[current].label}</h2><p style={{ color: '#73758a' }}>Projeto: {title || 'Sem título'}</p><div style={{ padding: 20, background: '#f6f7fb', borderRadius: 10, margin: '18px 0' }}>Esta etapa está preparada para receber o processamento real. Ainda não há conteúdo fictício sendo exibido.</div><button className="btn" onClick={next} disabled={current === stages.length - 1}>{current === stages.length - 1 ? 'Etapa final' : 'Avançar etapa'}</button></div>}
    <div className="section"><div className="section-head"><h2>Destinos</h2></div><div className="card"><p style={{ color: '#73758a', margin: 0 }}>Nenhum canal conectado. O YouTube será conectado via OAuth; Instagram dependerá da autorização oficial da Meta.</p></div></div>
  </main></DashboardShell>;
}
