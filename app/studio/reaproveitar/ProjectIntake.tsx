'use client';
import {useEffect,useState} from 'react';
import {EditingStyle,defaults} from '../EditingStyle';
import {ProjectName,SourcePicker} from '../ProjectFields';

async function uploadFile(file:File,notify:(message:string)=>void){
  const size=512*1024, total=Math.ceil(file.size/size), id=crypto.randomUUID(),start=Date.now();
  for(let index=0;index<total;index++){
    const remaining=index?Math.ceil((Date.now()-start)/index*(total-index)/60000):0;
    notify(`Enviando vídeo · ${Math.floor(index/total*100)}%${remaining?' · cerca de '+remaining+' min restantes':''}`);
    const response=await fetch('/api/studio/upload/chunk',{method:'POST',headers:{
      'x-upload-id':id,'x-chunk-index':String(index),'x-total-chunks':String(total),
      'x-file-name-utf8':encodeURIComponent(file.name),'x-file-type':file.type},
      body:file.slice(index*size,(index+1)*size)});
    const part=await response.json();
    if(!response.ok)throw Error(part.error||'Falha no envio do vídeo.');
    if(part.media)return String(part.media.id);
  }
  throw Error('O envio terminou sem um arquivo de vídeo disponível.');
}

export function ProjectIntake({onCreated,useStored=false}:{onCreated:(id:string)=>void;useStored?:boolean}){
  const [mode,setMode]=useState('file'),[name,setName]=useState(''),[url,setUrl]=useState('');
  const [stored,setStored]=useState(''),[file,setFile]=useState<File|null>(null),[preset,setPreset]=useState(defaults);
  const [busy,setBusy]=useState(false),[message,notify]=useState('');
  useEffect(()=>{if(useStored)setStored(new URLSearchParams(location.search).get('media')||'')},[useStored]);
  async function submit(existing=false){
    if(busy)return;
    setBusy(true);
    try{
      let payload;
      if(mode==='link'&&!existing){
        payload={action:'import',url:url.trim(),title:name.trim(),preset};
      }else{
        const id=existing?stored:await uploadFile(file!,notify);
        payload={action:'create',id,title:name.trim()||(existing?stored.replace(/^[^-]+-/,''):file!.name),preset};
      }
      notify('Adicionando o projeto à fila…');
      const response=await fetch('/api/studio/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok||!result.project)throw Error(result.error||'Falha ao criar projeto.');
      notify('Projeto na fila de edição.');onCreated(result.project);
    }catch(error){notify(error instanceof Error?error.message:'Falha ao processar o vídeo.')}
    finally{setBusy(false)}
  }
  return <form onSubmit={e=>{e.preventDefault();void submit()}}>
    <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
      <ProjectName value={name} onChange={setName}/><EditingStyle value={preset} onChange={setPreset}/>
      {stored&&<button type="button" className="btn" onClick={()=>void submit(true)}>Gerar cortes do arquivo armazenado</button>}
      <p>Envie um conteúdo próprio ou autorizado.</p>
      <div className="choiceRow">{[['file','Selecionar arquivo'],['link','Inserir link']].map(([key,label])=><button key={key} type="button" aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</div>
      {mode==='file'?<SourcePicker file={file} onChange={setFile} disabled={busy}/>:<label className="studioField">Link do vídeo<input type="url" pattern="https://.+" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label>}
      <button className="btn" disabled={busy||(mode==='file'?!file:!url.trim())}>{busy?'Processando…':mode==='file'?'Enviar e processar':'Importar e gerar cortes'}</button>
    </fieldset><p role="status">{message}</p>
  </form>
}
