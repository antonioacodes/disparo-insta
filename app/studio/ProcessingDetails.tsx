'use client';
import {useEffect,useState} from 'react';

type EventRow={id:number;at:number;kind:string;message:string;title:string|null};
const names:Record<string,string>={analyze:'Análise do vídeo',preview:'Prévia',final:'Exportação',import:'Importação',purge:'Exclusão'};

export function ProcessingDetails({project}:{project:string}){
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<EventRow[]|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try{
        const r=await fetch('/api/studio/workflow?history='+encodeURIComponent(project),{cache:'no-store',signal:controller.signal});
        if(!r.ok)throw Error();
        const events=await r.json();
        if(!controller.signal.aborted){setRows(events);setError(false);}
      }catch{if(!controller.signal.aborted)setError(true);}
      if(!controller.signal.aborted)timer=setTimeout(poll,5000);
    }
    void poll();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[project,open]);
  return <details className="reviewDetail" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>Ver detalhes de processamento</summary>
    {error&&<p role="status">Não foi possível atualizar os detalhes. Tentando novamente…</p>}
    {rows?.length?<ol className="processHistory">{rows.map(e=><li key={e.id}>
      <time dateTime={new Date(e.at*1000).toISOString()}>{new Date(e.at*1000).toLocaleTimeString('pt-BR')}</time>
      <span><strong>{names[e.kind]||e.kind}{e.title?' · '+e.title:''}</strong><br/>{e.message}</span>
    </li>)}</ol>:<p>{rows?'Ainda não há etapas registradas para este projeto.':'Carregando etapas…'}</p>}
  </details>;
}
