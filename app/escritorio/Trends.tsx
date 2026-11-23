'use client';
import {useEffect,useState} from 'react';
import {TrendProgress,type ResearchProgress} from './TrendProgress';
import {ActionCard} from './Department';
import styles from './office.module.css';

type Platform='YouTube'|'Twitch';
type Item={title:string;creator:string;url:string|null;views?:string;category?:string;score?:number;seconds?:number|null;likes?:string|null;comments?:string|null;rate?:number;ageHours?:number;gain?:number;intervalHours?:number;published?:string};
type Report={progress?:ResearchProgress;id:number;query:string;state:string;created:number;platform:Platform;country:string;days:number;analysis:string|null;error:string|null;items:Item[]};
type Data={reports:Report[];sources:Record<Platform,boolean>;model:boolean};
export function Trends(){
  const [data,setData]=useState<Data|null>(null),[screen,go]=useState<'home'|'search'|'reports'>('home');
  const [query,setQuery]=useState(''),[country,region]=useState('BR'),[days,period]=useState(7);
  const [platform,source]=useState<Platform>('YouTube'),[selected,select]=useState<number|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[offline,setOffline]=useState(false);
  const [refresh,reload]=useState(0);
  const [confirmId,confirm]=useState<number|null>(null);
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
  const active=data?.reports.slice().reverse().find(r=>!['Concluída','Erro','Interrompida'].includes(r.state));
  const ranked=report?.items.filter(v=>v.score!==undefined)??[];
  const fast=ranked.filter(v=>(v.rate??0)>=1000);
  const measured=fast.filter(v=>v.gain!==undefined);
  const confirmed=new Set(measured.map(v=>v.creator)).size>=2;
  const verdict=confirmed?'Tendência aprovada na amostra':fast.length?'Potencial de tendência':'Sinais insuficientes';
  async function manage(action:'delete'|'cancel'){
    if(!report||busy)return;
    setBusy(true);setError('');
    try{
      const res=await fetch('/api/studio/trends',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:report.id})});
      const result=await res.json();
      if(!res.ok)throw Error(result.error);
      if(action==='delete')select(null);
      confirm(null);reload(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar relatório.')}
    finally{setBusy(false)}
  }
  return <section className={styles.trends}>
    {screen==='home'&&active&&<article><strong>{active.query}</strong><TrendProgress progress={active.progress}/><button onClick={()=>{select(active.id);go('reports')}}>Acompanhar pesquisa</button></article>}
    {error&&screen!=='search'&&<p role="alert">{error}</p>}
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
        <label>Data de publicação<select value={days} onChange={e=>period(Number(e.target.value))}><option value={0}>Hoje (Brasília)</option><option value={-1}>Ontem (Brasília)</option>{[1,3,7,30].map(d=><option key={d} value={d}>{d===1?'Últimas 24 horas':'Últimos '+d+' dias'}</option>)}</select></label></>:<p>Busca canais ao vivo agora, em todas as regiões.</p>}
      {data&&!data.sources[platform]&&<p>O acesso à API de {platform} precisa ser configurado na VPS.</p>}
      {data&&!data.model&&<p>Aguardando configuração do modelo de análise.</p>}
      {error&&<p role="alert">{error}</p>}
      <button disabled={busy||!data?.model||!data.sources[platform]}>{busy?'Enviando…':'Iniciar pesquisa'}</button>
    </form>}
    {screen==='reports'&&<><h3>Relatórios</h3>{selected===null?<div className={styles.reportList}>{!data?'Carregando…':data.reports.length===0?'Nenhuma pesquisa registrada.':data.reports.map(r=><button key={r.id} onClick={()=>select(r.id)}><strong>{r.query}</strong><small>{r.platform} · {r.state}</small></button>)}</div>:
      <><button onClick={()=>select(null)}>← Todos os relatórios</button>{!report?<p>Carregando relatório…</p>:<article>
        <h3>{report.query}</h3><p>{report.platform} · {new Date(report.created*1000).toLocaleDateString('pt-BR')} · {report.state==='Esperando'?'Na fila para retomar a pesquisa':report.state}</p>
        <footer className={styles.reportActions}>
          {['Concluída','Erro','Interrompida'].includes(report.state)?
            confirmId===report.id?<><span>Excluir este relatório do histórico?</span><button disabled={busy} onClick={()=>confirm(null)}>Manter</button><button disabled={busy} onClick={()=>void manage('delete')}>Confirmar exclusão</button></>:
            <button onClick={()=>confirm(report.id)}>Excluir relatório</button>:<button disabled={busy} onClick={()=>void manage('cancel')}>Interromper pesquisa</button>}
        </footer>
        <TrendProgress progress={report.progress}/>
        {report.error&&<p role="alert">{report.error}</p>}
        {ranked.length>0&&<div className={styles.verdict}>
          <small>Parecer editorial · {ranked.length} vídeos avaliados</small><h3>{verdict}</h3>
          <div className={styles.balance}><div><b>Sinal favorável</b><p>{fast.length?fast.length+' vídeo(s) atingiram pelo menos mil visualizações por hora.':'O melhor candidato para cortes tem índice de '+ranked[0].score+'%.'}</p></div>
          <div><b>Ponto de atenção</b><p>{confirmed?'A confirmação vale para os canais e o intervalo observados.':measured.length?'O sinal recente ainda está concentrado em poucos canais.':'Sem medições repetidas de alta, o ritmo representa a média desde a publicação.'}</p></div></div>
          <details><summary>Critério de aprovação</summary><p>Dois canais distintos com pelo menos mil novas visualizações por hora entre duas consultas. O índice de cortes mede prioridade editorial.</p></details>
        </div>}
        {report.analysis&&<details open={report.platform!=='YouTube'}><summary>Análise da IA · por onde começar</summary><p>{report.analysis}</p></details>}
        {report.items.some(v=>v.score!==undefined)&&<><h4>Melhores opções para cortes</h4><small>O índice de indicação combina ritmo de visualizações, duração, idade e engajamento disponível.</small></>}
        {report.state==='Concluída'&&!report.items.length&&<p>Nenhum resultado para estes filtros.</p>}
        <ul>{report.items.map((v,i)=><li key={i}>{v.score!==undefined&&<strong>#{i+1} · {v.score}% de indicação para cortes</strong>}<strong>{v.title}</strong>{v.url&&<a href={v.url} target="_blank" rel="noreferrer">Abrir no {report.platform} ↗</a>}
          <small>{v.creator} · {report.platform}{v.views?' · '+Number(v.views).toLocaleString('pt-BR')+' visualizações':''}</small>
          {v.score!==undefined&&<><span>{Number(v.rate).toLocaleString('pt-BR')} views/h {v.gain!==undefined?'entre medições ('+v.gain.toLocaleString('pt-BR')+' novas em '+v.intervalHours+' h)':'em média desde a publicação'} · publicado há {v.ageHours} h</span>
          {v.seconds!=null&&<span>{v.seconds>=900?'Vídeo longo, com espaço para selecionar vários trechos.':v.seconds<180?'Vídeo curto, com pouca margem para extrair novos cortes.':'Duração intermediária para selecionar trechos.'}</span>}
          <small>{v.seconds!=null?'Duração '+Math.floor(v.seconds/60)+' min '+v.seconds%60+' s':'Duração indisponível'} · {v.likes!=null?Number(v.likes).toLocaleString('pt-BR')+' curtidas':'Curtidas indisponíveis'} · {v.comments!=null?Number(v.comments).toLocaleString('pt-BR')+' comentários':'Comentários indisponíveis'}</small></>}</li>)}</ul>

      </article>}</>}</>}
  </section>
}
