'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ProductionProgress} from './ProductionProgress';
import {Check, X, SlidersHorizontal, Captions, Save} from 'lucide-react';
type Project={id:string;title:string;media:string};
type Clip={id:string;project:string;title:string;state:string;score:number;rationale:string;start:number;end:number};
type Job={kind:string;entity:string;state:string;error:string|null};
type Verdict={motor?:string;geral:number; dimensoes:Record<string,number>; resumo:string; sugestao:string; personas:{perfil:string;motivo:string}[]; erro?:string};
const guide='https://github.com/antonioacodes/disparo-insta/blob/feat/painel-fila-meta/docs/teste-tinytroupe.md';
function Audience({v,status,clip,removed}:{v?:Verdict;status?:string;clip:Clip;removed:boolean}){
  if(!v || v.erro){
    let message='Aguardando a avaliação com '+status+'.';
    if(status==='disabled') message='Avaliação desativada no processador do Studio.';
    if(status==='offline') message='O processador do Studio está offline.';
    if(!status || status==='unknown') message='O processador ainda não informou a configuração de público.';
    if(clip.state==='detected') message='A avaliação pode começar quando a prévia ficar pronta.';
    if(clip.state==='rejected'||removed) message='Esta versão está encerrada sem uma avaliação.';
    return <details className="reviewDetail"><summary>Teste de público <small>{v?.erro?'Falhou':clip.state==='rejected'||removed?'Encerrado':status==='disabled'?'Desativado':status==='offline'?'Processador offline':clip.state==='detected'?'Aguardando prévia':'Sem nota'}</small></summary>
      <p>{v?.erro||message}</p><p>Cinco perfis simulados avaliam gancho, engajamento, clareza e ritmo.</p>
      <a href={guide} target="_blank" rel="noreferrer">Como ativar e testar o TinyTroupe</a></details>;
  }
  const color=v.geral<40?'#ba3434':v.geral<75?'#ba740b':'#208456';
  return <details style={{padding:12,background:'#f7f7fb',borderRadius:12}}><summary style={{cursor:'pointer'}}>
    <span style={{display:'inline-grid',placeItems:'center',borderRadius:'50%',width:58,height:58,verticalAlign:'middle',background:`conic-gradient(${color} ${v.geral}%,#dedee6 0)`}}>
      <strong style={{display:'grid',placeItems:'center',background:'white',borderRadius:'50%',width:46,height:46}}>{v.geral}</strong>
    </span> {v.motor || "Ollama"} · Público simulado · {v.geral}/100</summary><p>{v.resumo}</p>
    {Object.entries(v.dimensoes).map(([name,n])=><p key={name}>{name} · {n}/100 <meter min={0} max={100} value={n}/></p>)}
    <p><strong>Ajuste sugerido</strong> {v.sugestao}</p>
    {v.personas.map(person=><p key={person.perfil}><strong>{person.perfil}</strong> · {person.motivo}</p>)}
  </details>;
}
function timecode(seconds:number){
  const total=Math.floor(seconds);
  return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');
}
function SelectionReason({clip}:{clip:Clip}){
  if(clip.rationale==='Revisão manual') return <p className="clipTime">Versão ajustada manualmente</p>;
  const rules=clip.rationale.startsWith('Duração e limites de fala');
  return <details className="reviewDetail"><summary>Por que este trecho foi escolhido?</summary>
    <p><strong>{clip.score}/100 · {rules?'Prioridade pelas regras de seleção':'Avaliação editorial'}</strong></p>
    {rules?<ul><li>Trechos de 30 a 65 segundos são candidatos. A duração preferida é 45 segundos.</li>
      {clip.rationale.includes('abertura')&&<li>A primeira fala contém uma pergunta ou uma expressão como “como” ou “por que”.</li>}
      {clip.rationale.includes('pontuada')&&<li>A última fala termina com pontuação na transcrição.</li>}</ul>:<p>{clip.rationale}</p>}
    <p>Essa nota ajuda a escolher trechos para revisão. A reação estimada dos espectadores aparece no teste de público.</p>
  </details>;
}
type Brief={id:string;title:string;brief?:string;language?:string;stage:string};
type Info={width?:number;height?:number;fps?:number;format?:string;codec?:string;language?:string};
export default function Workflow({briefs,reload}:{briefs:Brief[];reload:()=>Promise<void>}){
  const deleteDialog=useRef<HTMLDialogElement>(null);
  const [target,setTarget]=useState<{id:string;title:string}|null>(null);
  function deleteButton(project:{id:string;title:string}){
    return <button className="btn secondary" disabled={busy} onClick={()=>{setError('');setTarget(project);deleteDialog.current?.showModal()}}>Excluir projeto</button>;
  }
  async function confirmDeletion(){
    if(!target)return;
    setBusy(true);setError('');
    try{
      const response=target.id.startsWith('project-')
        ? await fetch('/api/studio/projects?id='+encodeURIComponent(target.id),{method:'DELETE'})
        : await fetch('/api/studio/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete-project',id:target.id})});
      if(!response.ok)throw Error('Falha ao excluir. Tente novamente.');
      await Promise.all([refresh(),reload()]);
      const media=await fetch('/api/studio/media',{cache:'no-store'}).then(r=>r.json());
      setFiles(media.media||[]);select('');deleteDialog.current?.close();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao excluir.');}finally{setBusy(false);}
  }
  const dialog=useRef<HTMLDialogElement>(null);
  const [rejectId,setRejectId]=useState('');
  const [deletePreview,setDeletePreview]=useState(true);
  const [data,setData]=useState<{cache?:Record<string,{expires:number;removed:number}>;info?:Record<string,Info>;projects:Project[];clips:Clip[];jobs:Job[];audience?:Record<string,Verdict>;audienceStatus?:string;revisions?:{id:string;parent:string}[]}>({projects:[],clips:[],jobs:[]});
  const parents=new Map((data.revisions||[]).map(r=>[r.id,r.parent] as const));
  function root(id:string){while(parents.has(id)) id=parents.get(id)!;return id;}
  const [selected,select]=useState('');
  const [preset,setPreset]=useState({captions:'generate',facecam:'off',font:'DejaVu Sans',animation:'off'});
  const [captions,setCaptions]=useState<Record<string,{id:number;text:string;start:number}[]>>({});
  const [files,setFiles]=useState<{id:string;originalName:string;bytes:number}[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const response=await fetch('/api/studio/workflow',{cache:'no-store'});
    if(!response.ok) throw Error('Falha ao carregar os projetos.');
    setData(await response.json());
  },[]);
  useEffect(()=>{
    select(new URLSearchParams(location.search).get('project')||'');
    const poll=()=>refresh().catch(e=>setError(e.message));
    void poll();
    fetch('/api/studio/media',{cache:'no-store'}).then(r=>r.json()).then(d=>setFiles(d.media||[])).catch(()=>setError('Falha ao carregar os vídeos.'));
    const timer=setInterval(poll,5000);
    return ()=>clearInterval(timer);
  },[refresh]);
  async function act(action:string,id:string,title='',start?:number,end?:number,corrections?:Record<string,string>){
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/studio/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,title,start,end,corrections,preset,deletePreview:action==='reject'&&deletePreview})});
      if(!r.ok) throw Error((await r.json()).error);
      if(action==='reject') dialog.current?.close();
      if(action==='captions'){const rows=await r.json();setCaptions(previous=>({...previous,[id]:rows}));}else await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.');}finally{setBusy(false);}
  }
  function stage(c:Clip){
    const job=data.jobs.find(j=>j.entity===c.id && j.kind===(c.state==='approved'?'final':'preview'));
    if(data.cache?.[c.id]?.removed && c.state==='pending_review') return 'Prévia expirada';
    if(job?.state==='failed') return 'Falha ao gerar vídeo';
    if(c.state==='detected') return job?.state==='running'?'Gerando prévia':'Prévia na fila';
    return ({pending_review:'Pronto para assistir',approved:'Exportando',rendered:'Vídeo final pronto',rejected:'Rejeitado'} as Record<string,string>)[c.state]||c.state;
  }
  return <section className="section"><h2>Projetos em andamento</h2><div className="grid">{data.projects.map(p=>{
      const clips=data.clips.filter(c=>c.project===p.id);
      const roots=new Set(clips.map(c=>root(c.id)));
      const approved=new Set(clips.filter(c=>['approved','rendered'].includes(c.state)).map(c=>root(c.id)));
      const rejected=new Set(clips.filter(c=>c.state==='rejected'&&!approved.has(root(c.id))).map(c=>root(c.id)));
      const source=files.find(f=>f.id===p.media);
      return <button type="button" className="card" key={p.id} aria-pressed={selected===p.id} onClick={()=>select(p.id)} style={{textAlign:'left',borderColor:selected===p.id?'#6648cf':undefined}}>
        <strong>{p.title||source?.originalName}</strong><p>{roots.size} cortes · {approved.size} aprovados · {rejected.size} com rejeição</p><small>Transcrição em português · Original {source?(source.bytes/1048576).toFixed(1)+' MB':'indisponível'}</small></button>
    })}{briefs.map(b=><button type="button" className="card" key={b.id} aria-pressed={selected===b.id} onClick={()=>select(b.id)}><strong>{b.title}</strong><p>Briefing registrado</p></button>)}</div><h2>Produção e revisão</h2>{!selected&&<p>Selecione um projeto acima para revisar os cortes.</p>}
    <dialog ref={deleteDialog} className="card" aria-labelledby="purge-title"><h3 id="purge-title">Excluir {target?.title}?</h3><p>O projeto, seus cortes, versões, avaliações e exportações serão apagados definitivamente. O vídeo original será excluído se nenhum outro projeto o usar.</p><p>Se houver um corte em processamento, a limpeza ocorrerá ao terminar essa tarefa.</p><button className="btn secondary" disabled={busy} onClick={()=>deleteDialog.current?.close()}>Cancelar</button> <button className="btn" style={{background:'#ae3333'}} disabled={busy} onClick={confirmDeletion}>Excluir definitivamente</button>{error&&<p role="alert">{error}</p>}</dialog>
    <dialog ref={dialog} aria-labelledby="reject-heading" className="card"><h3 id="reject-heading">Rejeitar esta versão?</h3><p>{data.clips.find(c=>c.id===rejectId)?.title}</p><label><input type="checkbox" checked={deletePreview} onChange={e=>setDeletePreview(e.target.checked)}/> Excluir o vídeo desta prévia da VPS</label><p>O original e as outras versões continuam disponíveis.</p><button className="btn secondary" disabled={busy} onClick={()=>dialog.current?.close()}>Cancelar</button> <button className="btn" disabled={busy} onClick={()=>act('reject',rejectId)}>Confirmar rejeição</button>{error&&<p role="alert">{error}</p>}</dialog>
    {briefs.filter(b=>b.id===selected).map(b=><article className="card" key={b.id}><h3>{b.title}</h3>{deleteButton(b)}<p>{b.brief}</p>{b.language&&<p>Idioma do projeto · {b.language}</p>}</article>)}
    {error&&<p role="alert">{error}</p>}
    {files.filter(f=>!data.projects.some(p=>p.media===f.id)).map(f=><p key={f.id}>{f.originalName} <a className="btn secondary" href={'/studio/reaproveitar?media='+encodeURIComponent(f.id)}>Configurar cortes</a></p>)}
    {data.projects.filter(p=>p.id===selected).map(p=><article className="card" key={p.id}><h3>{p.title}</h3><p>{files.find(f=>f.id===p.media)?.originalName||p.media}</p>
      {(()=>{const m=data.info?.[p.id];return <p>{[m?.width&&m.height&&`${m.width} × ${m.height}`,m?.format && (p.media.split('.').pop()?.toUpperCase() || m.format),m?.codec,m?.fps&&`${m.fps} FPS`,m?.language&&m.language!=='und'?'Idioma do áudio · '+m.language:'Idioma do áudio não informado','Transcrição · Português'].filter(Boolean).join(' · ')}</p>})()}
      {deleteButton(p)}
      {data.jobs.filter(j=>j.entity===p.id && j.kind==='purge').filter(j=>j.state!=='done').map(j=><p key={j.entity+j.state}>{j.error||(j.kind==='purge'?'Exclusão solicitada':j.kind==='import'?(j.state==='running'?'Baixando e preparando o vídeo':'Importação na fila'):null)||(({running:'Processando',queued:'Na fila'} as Record<string,string>)[j.state]||j.state)}</p>)}
      <ProductionProgress project={p.id} jobs={data.jobs} clipIds={new Set(data.clips.filter(c=>c.project===p.id).map(c=>c.id))} offline={data.audienceStatus==='offline'}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,320px),1fr))',gap:16}}>{data.clips.filter(c=>c.project===p.id&&!parents.has(c.id)&&(c.state!=='detected'||data.clips.some(v=>parents.has(v.id)&&root(v.id)===c.id&&v.state!=='detected'))).map(original=><article key={original.id} className="clipCard">
      {data.clips.filter(c=>root(c.id)===original.id).map((c,index)=>c.state==='detected'?null:<section className="clipVersion" key={c.id}>
        <header><span className="clipState">{stage(c)}</span><small>Versão {index+1}</small></header>
        <h3>{c.title}</h3><p className="clipTime">{timecode(c.start)} a {timecode(c.end)} no original · {Number((c.end-c.start).toFixed(1))} s de duração</p>

        {data.jobs.filter(j=>j.entity===c.id&&j.state==='failed').map(j=><p role="alert" key={j.kind}>{j.error}</p>)}
        {c.state!=='rendered'&&!!data.cache?.[c.id]&&<p><small>{data.cache[c.id].removed?'Arquivo da prévia excluído':`Prévia será excluída automaticamente em ${Math.max(0,Math.ceil((data.cache[c.id].expires-Date.now()/1000)/86400))} dia(s)`}</small></p>}
        {c.state!=='detected'&&(c.state==='rendered'||!data.cache?.[c.id]?.removed)&&<video preload="none" poster={'/api/studio/workflow/poster?id='+c.id} controls playsInline style={{height:300,width:'100%',objectFit:'contain',background:'#171523',borderRadius:12}} src={'/api/studio/workflow/video?id='+c.id+'&kind='+(c.state==='rendered'?'final':'preview')}/>}
        {c.state==='pending_review'?<div className="clipActions"><button className="reviewBtn approve" disabled={busy||!!data.cache?.[c.id]?.removed} onClick={()=>act('approve',c.id)}><Check size={16}/> Aprovar e exportar</button> <button className="reviewBtn reject" disabled={busy} onClick={()=>{setError('');setRejectId(c.id);setDeletePreview(true);dialog.current?.showModal()}}><X size={16}/> Rejeitar</button></div>:null}
        <SelectionReason clip={c}/>
        <Audience v={data.audience?.[c.id]} status={data.audienceStatus} clip={c} removed={!!data.cache?.[c.id]?.removed}/>
        <details className="reviewDetail"><summary><SlidersHorizontal size={16}/> Editar corte e legendas</summary><p>Ao salvar, você recebe outra prévia para comparar. A versão anterior continua no histórico.</p><form className="clipEditor" onSubmit={event=>{
          event.preventDefault();
          const fields=new FormData(event.currentTarget);
          if(Number(fields.get('end'))<=Number(fields.get('start'))){setError('O fim do corte precisa ser posterior ao início.');return;}
          const edits:Record<string,string>={};
          for(const row of captions[c.id]||[]) edits[String(row.id)]=String(fields.get('caption-'+row.id)??row.text);
          void act('revise',c.id,String(fields.get('title')),Number(fields.get('start')),Number(fields.get('end')),edits);
        }}>
          <label>Título do corte<input maxLength={200} name="title" required defaultValue={c.title}/></label>
          <div className="clipBounds"><label>Início no original (s) <input name="start" required type="number" min="0" step="any" defaultValue={c.start}/></label>
          <label>Fim no original (s) <input name="end" required type="number" min="0" step="any" defaultValue={c.end}/></label></div>
          <button className="reviewBtn secondary" type="button" disabled={busy} onClick={()=>act('captions',c.id)}><Captions size={16}/> Carregar legendas</button>
          {(captions[c.id]||[]).map(row=><label key={row.id}>{row.start.toFixed(1)} s <input name={'caption-'+row.id} defaultValue={row.text} maxLength={1000}/></label>)}
          <button className="reviewBtn primary" disabled={busy}><Save size={16}/> Salvar nova versão</button>
        </form></details>
      </section>)}</article>)}</div></article>)}</section>;
}
