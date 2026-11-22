'use client';
import { useMemo, useState } from 'react';

type Segment = {start:number; end:number; text?:string};
type Props = {segments:Segment[]; mediaId:string; style:string; format:string};

function group(segments:Segment[], target:number) {
  const groups:Segment[][] = [];
  let current:Segment[] = [];
  for (const segment of segments) {
    if (!(segment.end > segment.start)) continue;
    current.push(segment);
    const duration = segment.end-current[0].start;
    if (duration >= target || (duration >= target*.75 && /[.!?]$/.test(segment.text?.trim() || ''))) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) {
    const last = groups[groups.length-1];
    if (last && current[current.length-1].end-current[0].start < target*.4) last.push(...current);
    else groups.push(current);
  }
  return groups;
}

function Review({parts, mediaId, style, format}:{parts:Segment[]} & Omit<Props,'segments'>) {
  const [rows,setRows] = useState(parts);
  const [first,setFirst] = useState(0);
  const [last,setLast] = useState(parts.length-1);
  const [status,setStatus] = useState('');
  const [url,setUrl] = useState('');
  const [busy,setBusy] = useState(false);
  const selected = rows.slice(first,last+1);
  const start = rows[first].start, end = rows[last].end;
  async function approve() {
    setBusy(true); setStatus('Gerando arquivo…');
    try {
      const response = await fetch('/api/studio/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mediaId,style,format,cuts:selected.map(row=>({...row,approved:true}))})});
      if (!response.ok) throw new Error('Falha na exportação (HTTP '+response.status+').');
      const result = await response.json();
      setUrl('/api/studio/renders/'+encodeURIComponent(result.output.split('/').pop()));
      setStatus('Arquivo pronto');
    } catch(error) { setStatus(error instanceof Error ? error.message : 'Falha na exportação'); }
    finally { setBusy(false); }
  }
  return <article className="card"><h3>{rows[first].text?.trim().slice(0,80) || 'Sugestão de corte'}</h3>
    <p>{start.toFixed(1)} s – {end.toFixed(1)} s · {Math.round(end-start)} segundos</p>
    <video key={start+'-'+end} controls preload="none" style={{width:'100%',maxHeight:280}} src={'/api/studio/media/'+encodeURIComponent(mediaId)+'#t='+start+','+end}/>
    <fieldset disabled={busy} onChange={()=>{setUrl('');setStatus('')}}><legend>Editar trecho</legend>
    <label>Primeira fala <select value={first} onChange={e=>setFirst(Number(e.target.value))}>{rows.map((r,i)=><option key={i} value={i} disabled={i>last}>{r.start.toFixed(1)} s</option>)}</select></label>
    <label> Última fala <select value={last} onChange={e=>setLast(Number(e.target.value))}>{rows.map((r,i)=><option key={i} value={i} disabled={i<first}>{r.end.toFixed(1)} s</option>)}</select></label>
    <details><summary>Revisar legendas</summary>{selected.map((r,i)=><label key={first+i}>{r.start.toFixed(1)} s <input value={r.text||''} onChange={e=>setRows(rows.map((row,j)=>j===first+i?{...row,text:e.target.value}:row))}/></label>)}</details></fieldset>
    <button disabled={busy} onClick={approve}>Aprovar e exportar corte</button> <button disabled={busy} onClick={()=>setStatus('Rejeitado')}>Rejeitar</button>
    <p role="status">{status}</p>{url&&<video controls src={url} style={{width:'100%',maxHeight:320}}/>}</article>
}

export default function ClipReview(props:Props) {
  const [target,setTarget] = useState(45);
  const groups = useMemo(()=>group(props.segments,target),[props.segments,target]);
  return <section><h2>Revisar sugestões de corte</h2><label>Duração aproximada <select value={target} onChange={e=>setTarget(Number(e.target.value))}>{[30,45,60,90].map(n=><option key={n} value={n}>{n} segundos</option>)}</select></label>
    {groups.map((parts,i)=><Review key={[props.mediaId,target,i,props.format,props.style].join('-')} {...props} parts={parts}/>)}</section>
}