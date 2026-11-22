'use client';

type Job = {kind:string;entity:string;state:string;error:string|null;stage?:string;started?:number};
type Props = {eta?:{low:number;high:number};project:string;clipIds:Set<string>;jobs:Job[];offline:boolean};

export function ProductionProgress({project,clipIds,jobs,offline,eta}:Props){
  const previews=jobs.filter(j=>j.kind==='preview' && clipIds.has(j.entity));
  const preparation=jobs.filter(j=>j.entity===project && ['import','analyze'].includes(j.kind));
  const tasks=[...preparation,...previews];
  const active=tasks.find(j=>j.state==='running');
  const queued=tasks.filter(j=>j.state==='queued');
  const ready=previews.filter(j=>j.state==='done').length;
  const failures=tasks.filter(j=>j.state==='failed');
  const total=previews.length;
  const processing=!!active || queued.length>0;
  let label=total?'Geração das prévias concluída':'Nenhum trecho selecionado';
  if(failures.length) label='Processamento com falha';
  if(processing) label=offline?'Processamento pausado · worker offline':active?.stage || (active?'Processando vídeo':'Na fila de processamento');
  if(!tasks.length)return null;
  const elapsed=active?.started && !offline ? Math.max(0,Math.floor(Date.now()/1000)-active.started) : 0;
  return <section className="productionProgress" aria-label="Progresso da produção">
    <header aria-live="polite"><strong>{label}</strong>{total>0&&<span>{ready} de {total} prévias geradas</span>}</header>
    {(total>0 || processing&&!offline)&&<progress aria-label={total?'Prévias geradas':label} max={total||1} value={total?ready:undefined}/>}
    {processing&&!offline&&<p className="productionEta" aria-live="polite">{eta
      ? <>Tempo de processamento restante · <strong>{eta.high<60?'menos de 1 min':Math.max(1,Math.floor(eta.low/60))+'–'+Math.max(2,Math.ceil(eta.high/60))+' min'}</strong></>
      : active?.kind==='import'?'A previsão começa quando o vídeo terminar de baixar.':'Calculando a previsão a partir da duração do vídeo…'}</p>}
    <small>{total>0 ? [previews.filter(j=>j.state==='running').length+' em processamento',previews.filter(j=>j.state==='queued').length+' na fila'].join(' · ') :
      processing?'O total de cortes aparece após a seleção dos trechos.':''}
      {elapsed>0 && ' · Tarefa atual há '+Math.floor(elapsed/60)+' min '+elapsed%60+' s'}</small>
    {failures.map(j=><p key={j.kind+j.entity} role="alert">{j.error||'Falha na tarefa.'}</p>)}
  </section>;
}
