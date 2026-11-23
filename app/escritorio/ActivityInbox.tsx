import {useEffect,useRef,useState} from 'react';
import {Eye} from 'lucide-react';
import {Audience,type Verdict} from '../studio/Audience';
import {EditingStyle,defaults} from '../studio/EditingStyle';
import type {Office,InboxItem} from './useOffice';
import styles from './office.module.css';

const labels={preview:'Prévia pronta',trend:'Pesquisa concluída',briefing:'Briefing pronto',script:'Roteiro pronto',video:'Vídeo produzido',job:'Tarefa concluída'};
function votes(v?:Verdict|null){
  const people=v?.personas?.filter(p=>p.notas&&Object.keys(p.notas).length>0);
  if(!people?.length)return null;
  return Math.round(100*people.filter(p=>{
    const scores=Object.values(p.notas!);
    return scores.reduce((a,b)=>a+b,0)/scores.length>=60;
  }).length/people.length);
}

export function ActivityInbox({data}:{data:Office|null}){
  const [item,setItem]=useState<InboxItem|null>(null),[intent,setIntent]=useState('approve');
  const [mode,setMode]=useState('views'),[count,setCount]=useState(1),[preset,setPreset]=useState(defaults);
  const [note,setNote]=useState(''),[checked,check]=useState(false),[aiLabel,labelAI]=useState(true);
  const [busy,setBusy]=useState(false),[message,msg]=useState(''),[script,setScript]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const clip=data?.ready.find(c=>c.id===item?.entity);
  useEffect(()=>{
    if(!item)return;
    dialog.current?.showModal();
    if(item.kind!=='script')return;
    const cancel=new AbortController();
    fetch('/api/studio/workflow?roteiros=1',{signal:cancel.signal}).then(r=>r.json()).then(rows=>{
      const row=rows.find((r:{id:string})=>r.id===item.entity);
      setScript(row?.roteiro?.cenas.map((c:{narracao:string;fontes:string[];verificar:boolean})=>c.narracao+'\n'+[...c.fontes,c.verificar?'Requer verificação':''].filter(Boolean).join(' · ')).join('\n\n')||'');
    }).catch(()=>{if(!cancel.signal.aborted)msg('Falha ao consultar o roteiro.')});return ()=>cancel.abort();
  },[item]);
  function open(i:InboxItem,action:string){
    setItem(i);setIntent(action);check(false);labelAI(true);setNote('');setScript('');msg('');setCount(1);setMode('views');setPreset(defaults);
  }
  async function decide(){
    if(!item||busy)return;
    setBusy(true);msg('');
    try{
      const r=await fetch('/api/studio/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        action:'activity-review',id:item.entity,payload:{kind:item.kind,decision:intent,options:{title:item.title,mode,count,preset,revisado:checked,rotulagem_ia:aiLabel,comentario:note}}})});
      const result=await r.json();if(!r.ok)throw Error(result.error||'Falha ao salvar.');
      dialog.current?.close();msg(intent==='approve'?'Aprovação registrada.':'Reprovação registrada.');
    }catch(e){msg(e instanceof Error?e.message:'Falha ao salvar.')}finally{setBusy(false)}
  }
  const pending=data?.inbox??[];
  const verdict=clip?.audience??undefined;
  return <section className={styles.inbox}><h3>Concluídas · {pending.length} para revisar</h3>
    {data&&!data.reviewEnabled&&pending.length>0&&<p>As decisões aguardam a confirmação de acesso dos operadores.</p>}
    {pending.map(i=>{
      const v=data?.ready.find(c=>c.id===i.entity)?.audience;
      const pct=votes(v);
      return <article key={i.kind+i.entity}><small>● Não lida · {i.agent}</small><strong>{i.label||labels[i.kind]}</strong><p>{i.title}</p>
        <div className={styles.reviewActions}>
          {i.kind==='preview'&&<button className={styles.previewAction} onClick={()=>open(i,'view')} aria-label={'Ver prévia de '+i.title}><Eye size={14}/> Ver prévia</button>}
          <button className={styles.approveAction} onClick={()=>open(i,'approve')}>Aprovar</button>
          <button className={styles.rejectAction} onClick={()=>open(i,'reject')}>Reprovar</button>
        </div>
        {pct!==null&&<small><b style={{color:'#236139'}}>{pct}% favoráveis</b> · <b style={{color:'#9e3030'}}>{100-pct}% desfavoráveis</b></small>}
      </article>})}
    {!pending.length&&<p>{data?'Nenhuma atividade aguardando revisão.':'Consultando atividades…'}</p>}
    {(data?.decisions??[]).map(d=><article key={d.kind+d.entity}><small>{d.approved?'Aprovada':'Reprovada'} · {new Date(d.at*1000).toLocaleDateString('pt-BR')}</small><p>{d.title}</p></article>)}
    {!item&&message&&<p role="status">{message}</p>}
    <dialog ref={dialog} className={styles.dialog} onClose={()=>setItem(null)}>
      {item&&<><button onClick={()=>dialog.current?.close()} aria-label="Fechar">×</button><h2>{item.title}</h2>
      {item.kind==='preview'&&clip&&<><video controls playsInline src={'/api/studio/workflow/video?kind=preview&id='+item.entity}/>
        <Audience v={verdict} status={data?.audienceStatus} clip={clip} removed={false}/>
        {votes(verdict)!==null&&<small>Favoráveis representam os perfis simulados com média de pelo menos 60/100.</small>}</>}
      {item.kind==='video'&&<video controls playsInline src={'/api/studio/workflow/video?kind=producao&id='+item.entity}/>}
      {item.kind==='script'&&<p style={{whiteSpace:'pre-line'}}>{script||'Carregando roteiro…'}</p>}
      {intent==='approve'&&item.kind==='trend'&&<><label>Escolher vídeos<select value={mode} onChange={e=>setMode(e.target.value)}>
        <option value="views">Mais vistos</option><option value="score">Maior potencial para cortes</option><option value="ai">Deixar a IA escolher de 1 a 3</option></select></label>
        {mode!=='ai'&&<label>Quantidade<input type="number" min={1} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>}
        <details open><summary>Padrão da edição</summary><EditingStyle value={preset} onChange={setPreset}/></details></>}
      {intent==='approve'&&['video','script'].includes(item.kind)&&<label><input type="checkbox" checked={checked} onChange={e=>check(e.target.checked)}/> Revisei o conteúdo e autorizo a próxima etapa.</label>}
      {intent==='approve'&&item.kind==='video'&&<label><input type="checkbox" checked={aiLabel} onChange={e=>labelAI(e.target.checked)}/> Rotular uso de IA</label>}
      {intent==='reject'&&<>{item.kind==='preview'&&<p>A reprovação exclui esta prévia da VPS. O vídeo original continua disponível.</p>}<label>Comentário<textarea value={note} onChange={e=>setNote(e.target.value)}/></label></>}
      {intent==='view'?<div className={styles.reviewActions}><button className={styles.approveAction} onClick={()=>setIntent('approve')}>Aprovar</button><button className={styles.rejectAction} onClick={()=>setIntent('reject')}>Reprovar</button></div>:
      <button className={intent==='reject'?styles.rejectAction:styles.approveAction} disabled={!data?.reviewEnabled||busy||(intent==='approve'&&((item.kind==='script'&&(!script||!checked))||(item.kind==='video'&&!checked)))} onClick={decide}>{busy?'Salvando…':intent==='reject'?'Confirmar reprovação':({trend:'Enviar para edição',briefing:'Gerar roteiro',script:'Produzir vídeo',preview:'Preparar para publicação',video:'Enviar para Publicações',job:'Confirmar aprovação'})[item.kind]}</button>}
      {message&&<p role="status">{message}</p>}</>}
    </dialog></section>;
}
