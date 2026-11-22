'use client';
import {useCallback,useEffect,useState} from 'react';
type Project={id:string;title:string;media:string};
type Clip={id:string;project:string;title:string;state:string;score:number;rationale:string;start:number;end:number};
type Job={entity:string;state:string;error:string|null};
export default function Workflow(){
  const [data,setData]=useState<{projects:Project[];clips:Clip[];jobs:Job[]}>({projects:[],clips:[],jobs:[]});
  const [files,setFiles]=useState<{id:string;originalName:string}[]>([]);
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
  async function act(action:string,id:string,title='',start?:number,end?:number){
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/studio/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,title,start,end})});
      if(!r.ok) throw Error((await r.json()).error);
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.');}finally{setBusy(false);}
  }
  return <section className="section"><h2>Produção e revisão</h2>{error&&<p role="alert">{error}</p>}
    {files.filter(f=>!data.projects.some(p=>p.media===f.id)).map(f=><p key={f.id}>{f.originalName} <button disabled={busy} onClick={()=>act('create',f.id,f.originalName)}>Gerar sugestões</button></p>)}
    {data.projects.map(p=><article className="card" key={p.id}><h3>{p.title}</h3>
      {data.jobs.filter(j=>j.entity===p.id||j.entity.startsWith(p.id+'-')).filter(j=>j.state!=='done').map(j=><p key={j.entity+j.state}>{j.error||(({running:'Processando',queued:'Na fila'} as Record<string,string>)[j.state]||j.state)}</p>)}
      {data.clips.filter(c=>c.project===p.id).map(c=><section key={c.id}><h4>{c.title}</h4><p>{Math.round(c.start)}–{Math.round(c.end)} s · Prioridade {c.score}/100 · {c.rationale}</p>
        {c.state!=='detected'&&<video preload="none" controls style={{maxHeight:300,maxWidth:'100%'}} src={'/api/studio/workflow/video?id='+c.id+'&kind='+(c.state==='rendered'?'final':'preview')}/>}
        {c.state==='pending_review'?<p><button disabled={busy} onClick={()=>act('approve',c.id)}>Aprovar e exportar</button> <button disabled={busy} onClick={()=>act('reject',c.id)}>Rejeitar</button></p>:<p>{({approved:'Exportação na fila',rendered:'Arquivo final pronto',rejected:'Rejeitado',detected:'Preparando prévia'} as Record<string,string>)[c.state]}</p>}
        <details><summary>Editar em nova versão</summary><form onSubmit={event=>{
          event.preventDefault();
          const fields=new FormData(event.currentTarget);
          void act('revise',c.id,String(fields.get('title')),Number(fields.get('start')),Number(fields.get('end')));
        }}>
          <label>Título <input name="title" required defaultValue={c.title}/></label>
          <label>Início (s) <input name="start" required type="number" min="0" step="any" defaultValue={c.start}/></label>
          <label>Fim (s) <input name="end" required type="number" min="0" step="any" defaultValue={c.end}/></label>
          <button disabled={busy}>Salvar versão e gerar prévia</button>
        </form></details>
      </section>)}</article>)}</section>;
}
