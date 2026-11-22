'use client';
import {useCallback,useEffect,useState} from 'react';
type Project={id:string;title:string;media:string};
type Clip={id:string;project:string;title:string;state:string;score:number;rationale:string;start:number;end:number};
type Job={kind:string;entity:string;state:string;error:string|null};
type Verdict={geral:number; dimensoes:Record<string,number>; resumo:string; sugestao:string; personas:{perfil:string;motivo:string}[]; erro?:string};
function Audience({v,pending}:{v?:Verdict;pending:string}){
  if(!v || v.erro) return <p><small>Público simulado · {v?.erro||pending}</small></p>;
  const color=v.geral<40?'#ba3434':v.geral<75?'#ba740b':'#208456';
  return <details style={{padding:12,background:'#f7f7fb',borderRadius:12}}><summary style={{cursor:'pointer'}}>
    <span style={{display:'inline-grid',placeItems:'center',borderRadius:'50%',width:58,height:58,verticalAlign:'middle',background:`conic-gradient(${color} ${v.geral}%,#dedee6 0)`}}>
      <strong style={{display:'grid',placeItems:'center',background:'white',borderRadius:'50%',width:46,height:46}}>{v.geral}</strong>
    </span> Público simulado · {v.geral}/100</summary><p>{v.resumo}</p>
    {Object.entries(v.dimensoes).map(([name,n])=><p key={name}>{name} · {n}/100 <meter min={0} max={100} value={n}/></p>)}
    <p><strong>Ajuste sugerido</strong> {v.sugestao}</p>
    {v.personas.map(person=><p key={person.perfil}><strong>{person.perfil}</strong> · {person.motivo}</p>)}
  </details>;
}
export default function Workflow(){
  const [data,setData]=useState<{projects:Project[];clips:Clip[];jobs:Job[];audience?:Record<string,Verdict>;audienceEnabled?:boolean;revisions?:{id:string;parent:string}[]}>({projects:[],clips:[],jobs:[]});
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
    const poll=()=>refresh().catch(e=>setError(e.message));
    void poll();
    fetch('/api/studio/media',{cache:'no-store'}).then(r=>r.json()).then(d=>setFiles(d.media||[])).catch(()=>setError('Falha ao carregar os vídeos.'));
    const timer=setInterval(poll,5000);
    return ()=>clearInterval(timer);
  },[refresh]);
  async function act(action:string,id:string,title='',start?:number,end?:number,corrections?:Record<string,string>){
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/studio/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,title,start,end,corrections,preset})});
      if(!r.ok) throw Error((await r.json()).error);
      if(action==='captions'){const rows=await r.json();setCaptions(previous=>({...previous,[id]:rows}));}else await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.');}finally{setBusy(false);}
  }
  function stage(c:Clip){
    const job=data.jobs.find(j=>j.entity===c.id && j.kind===(c.state==='approved'?'final':'preview'));
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
        <strong>{source?.originalName||p.title}</strong><p>{roots.size} cortes · {approved.size} aprovados · {rejected.size} com rejeição</p><small>Transcrição em português · Original {source?(source.bytes/1048576).toFixed(1)+' MB':'indisponível'}</small></button>
    })}</div><h2>Produção e revisão</h2>{!selected&&<p>Selecione um projeto acima para revisar os cortes.</p>}
    {error&&<p role="alert">{error}</p>}
    {files.filter(f=>!data.projects.some(p=>p.media===f.id)).map(f=><p key={f.id}>{f.originalName} <a className="btn secondary" href={'/studio/reaproveitar?media='+encodeURIComponent(f.id)}>Configurar cortes</a></p>)}
    {data.projects.filter(p=>p.id===selected).map(p=><article className="card" key={p.id}><h3>{p.title}</h3>
      {data.jobs.filter(j=>j.entity===p.id).filter(j=>j.state!=='done').map(j=><p key={j.entity+j.state}>{j.error||(({running:'Processando',queued:'Na fila'} as Record<string,string>)[j.state]||j.state)}</p>)}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,320px),1fr))',gap:16}}>{data.clips.filter(c=>c.project===p.id&&!parents.has(c.id)).map(original=><article key={original.id} style={{padding:18,border:'1px solid #dedeea',borderRadius:18,background:'#fff',boxShadow:'0 4px 18px #2824430d'}}>
      {data.clips.filter(c=>root(c.id)===original.id).map((c,index)=><section key={c.id}><small style={{fontWeight:700,color:'#5737aa'}}>{stage(c)} · Versão {index+1}</small><h3>{c.title}</h3><p>{Math.round(c.start)}–{Math.round(c.end)} s · Sugestão de revisão · {c.score}/100 · {c.rationale}</p>
        <Audience v={data.audience?.[c.id]} pending={c.state==='detected'?'Aguardando prévia':data.audienceEnabled?'Aguardando avaliação':'Modelo de público não configurado'}/>
        {c.state==='detected'&&<details><summary>Assistir ao trecho original</summary><video preload="none" controls style={{width:'100%'}} src={'/api/studio/media/'+encodeURIComponent(p.media)+'#t='+c.start+','+c.end}/></details>}
        {data.jobs.filter(j=>j.entity===c.id&&j.state==='failed').map(j=><p role="alert" key={j.kind}>{j.error}</p>)}
        {c.state!=='detected'&&<video preload="none" poster={'/api/studio/workflow/poster?id='+c.id} controls playsInline style={{height:300,width:'100%',objectFit:'contain',background:'#171523',borderRadius:12}} src={'/api/studio/workflow/video?id='+c.id+'&kind='+(c.state==='rendered'?'final':'preview')}/>}
        {c.state==='pending_review'?<p><button className="btn" style={{background:'#17643e',color:'white'}} disabled={busy} onClick={()=>act('approve',c.id)}>✓ Aprovar e exportar</button> <button className="btn" style={{background:'#fff1ef',color:'#962922',border:'1px solid #e8b7b2'}} disabled={busy} onClick={()=>act('reject',c.id)}>× Rejeitar</button><small style={{display:'block',marginTop:8}}>Aprovar gera o arquivo final. Rejeitar encerra a revisão desta versão.</small></p>:null}
        <details><summary>Ajustar corte e legendas</summary><p>Ao salvar, você recebe outra prévia para comparar. A versão anterior continua no histórico.</p><form onSubmit={event=>{
          event.preventDefault();
          const fields=new FormData(event.currentTarget);
          const edits:Record<string,string>={};
          for(const row of captions[c.id]||[]) edits[String(row.id)]=String(fields.get('caption-'+row.id)??row.text);
          void act('revise',c.id,String(fields.get('title')),Number(fields.get('start')),Number(fields.get('end')),edits);
        }}>
          <label>Título <input name="title" required defaultValue={c.title}/></label>
          <label>Início (s) <input name="start" required type="number" min="0" step="any" defaultValue={c.start}/></label>
          <label>Fim (s) <input name="end" required type="number" min="0" step="any" defaultValue={c.end}/></label>
          <button type="button" disabled={busy} onClick={()=>act('captions',c.id)}>Carregar legendas</button>
          {(captions[c.id]||[]).map(row=><label key={row.id}>{row.start.toFixed(1)} s <input name={'caption-'+row.id} defaultValue={row.text} maxLength={1000}/></label>)}
          <button disabled={busy}>Salvar versão e gerar prévia</button>
        </form></details>
      </section>)}</article>)}</div></article>)}</section>;
}
