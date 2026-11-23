'use client';
import {useEffect,useState} from 'react';
import {TrendProgress,type ResearchProgress} from './TrendProgress';
import {ActionCard} from './Department';
import styles from './office.module.css';

type Platform='YouTube'|'Twitch';
type Item={title:string;creator:string;url:string|null;views?:string;category?:string};
type Report={progress?:ResearchProgress;id:number;query:string;state:string;created:number;platform:Platform;country:string;days:number;analysis:string|null;error:string|null;items:Item[]};
type Data={reports:Report[];sources:Record<Platform,boolean>;model:boolean};
export function Trends(){
  const [data,setData]=useState<Data|null>(null),[screen,go]=useState<'home'|'search'|'reports'>('home');
  const [query,setQuery]=useState(''),[country,region]=useState('BR'),[days,period]=useState(7);
  const [platform,source]=useState<Platform>('YouTube'),[selected,select]=useState<number|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[offline,setOffline]=useState(false);
  const [refresh,reload]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try{
        const response=await fetch('/api/studio/trends',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error();
        const result=await response.json();
        if(!controller.signal.aborted){setData(result);setOffline(false)}
      }catch{if(!controller.signal.aborted)setOffline(true)}
      if(!controller.signal.aborted)timer=setTimeout(poll,5000);
    }
    void poll();
    return ()=>{controller.abort();clearTimeout(timer)};
  },[refresh]);
  async function search(){
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/studio/trends',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query,country:platform==='Twitch'?'BR':country,days:platform==='Twitch'?1:days,platform})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error);
      select(result.id);go('reports');reload(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'Falha ao iniciar a pesquisa.')}
    finally{setBusy(false)}
  }
  const report=data?.reports.find(r=>r.id===selected);
  const active=data?.reports.slice().reverse().find(r=>!['Concluída','Erro'].includes(r.state));
  return <section className={styles.trends}>
    {screen==='home'&&active&&<article><strong>{active.query}</strong><TrendProgress progress={active.progress}/><button onClick={()=>{select(active.id);go('reports')}}>Acompanhar pesquisa</button></article>}
    {offline&&<p role="alert">Falha ao atualizar as pesquisas. Tentando reconectar…</p>}
    {screen!=='home'&&<button onClick={()=>{go('home');setError('')}}>← Tendências</button>}
    {screen==='home'&&<div className={styles.actions}>
      <ActionCard title="Pesquisar tendências" caption="Escolher tema e plataforma" onClick={()=>go('search')}/>
      <ActionCard title="Relatórios" caption="Consultar pesquisas dos últimos 30 dias" onClick={()=>{select(null);go('reports')}}/>
    </div>}
    {screen==='search'&&<form onSubmit={e=>{e.preventDefault();void search()}}>
      <label>Tema ou palavras-chave<input required minLength={2} maxLength={120} value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div>{['GTA e jogos de mundo aberto','Receitas rápidas','Inteligência artificial'].map(s=><button type="button" key={s} onClick={()=>setQuery(s)}>{s}</button>)}</div>
      <label>Plataforma<select value={platform} onChange={e=>source(e.target.value as Platform)}><option>YouTube</option><option>Twitch</option></select></label>
      {platform==='YouTube'?<><label>País de disponibilidade<select value={country} onChange={e=>region(e.target.value)}><option value="BR">Brasil</option><option value="PT">Portugal</option><option value="US">Estados Unidos</option></select></label>
        <label>Publicados nos últimos<select value={days} onChange={e=>period(Number(e.target.value))}>{[1,3,7,30].map(d=><option key={d} value={d}>{d} {d===1?'dia':'dias'}</option>)}</select></label></>:<p>Busca canais ao vivo agora, em todas as regiões.</p>}
      {data&&!data.sources[platform]&&<p>O acesso à API de {platform} precisa ser configurado na VPS.</p>}
      {data&&!data.model&&<p>Aguardando configuração do modelo de análise.</p>}
      {error&&<p role="alert">{error}</p>}
      <button disabled={busy||!data?.model||!data.sources[platform]}>{busy?'Enviando…':'Iniciar pesquisa'}</button>
    </form>}
    {screen==='reports'&&<><h3>Relatórios</h3>{selected===null?<div>{!data?'Carregando…':data.reports.length===0?'Nenhuma pesquisa registrada.':data.reports.map(r=><button key={r.id} onClick={()=>select(r.id)}>{r.query} · {r.platform} · {r.state}</button>)}</div>:
      <><button onClick={()=>select(null)}>← Todos os relatórios</button>{!report?<p>Carregando relatório…</p>:<article>
        <h3>{report.query}</h3><p>{report.platform} · {new Date(report.created*1000).toLocaleDateString('pt-BR')} · {report.state==='Esperando'?'Aguardando liberação do processamento do Studio':report.state}</p>
        <TrendProgress progress={report.progress}/>
        {report.error&&<p role="alert">{report.error}</p>}
        {report.analysis&&<p>{report.analysis}</p>}
        {report.state==='Concluída'&&!report.items.length&&<p>Nenhum resultado para estes filtros.</p>}
        <ul>{report.items.map((v,i)=><li key={i}>{v.url?<a href={v.url} target="_blank" rel="noreferrer">{v.title}</a>:<strong>{v.title}</strong>}
          <small>{v.creator} · {report.platform}{v.views?' · '+Number(v.views).toLocaleString('pt-BR')+' visualizações':''}</small></li>)}</ul>
      </article>}</>}</>}
  </section>
}
