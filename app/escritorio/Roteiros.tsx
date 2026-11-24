import {useEffect,useState} from 'react';
import styles from './office.module.css';

type Scene={id:string;tipo:string;legenda_destaque:string;narracao:string;verificar:boolean;fontes:string[]};
type Item={id:string;versao:number;titulo:string;status:string;comentario:string|null;producao:{publico?:{rodada:number;nota:number;cenas:{problema:string;ajuste:string;notas:Record<string,number>}[]}[];etapa:string;erro:string|null;chamadas:number;pronto:boolean;legendas:{cena:number;srt:string;segundos:number}[];etapas:{etapa:string;cena:number;inicio:number|null;fim:number|null}[];assets:{origem:string;autor:string;url:string}[]}|null;roteiro:{cenas:Scene[]}|null};
const endpoint='/api/studio/workflow';
export function Roteiros({publicacoes=false}:{publicacoes?:boolean}){
  const [rows,setRows]=useState<Item[]>([]),[selected,setSelected]=useState(''),[creating,setCreating]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[comment,setComment]=useState(''),[reviewed,setReviewed]=useState(false);
  const [rotulagem,setRotulagem]=useState(true);
  const item=rows.find(r=>r.id===selected);
  async function refresh(){const response=await fetch(endpoint+'?roteiros=1',{cache:'no-store'});if(!response.ok)throw Error('Falha ao consultar roteiros.');setRows(await response.json())}
  useEffect(()=>{const update=()=>refresh().catch(e=>setError(e.message));void update();const timer=setInterval(update,6000);return ()=>clearInterval(timer)},[]);
  async function act(action:string,payload:unknown={}){
    setBusy(true);setError('');
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'roteiros/'+action,id:selected,payload})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Falha no Studio.');
      await refresh();setSelected(data.id);setCreating(false);setReviewed(false);setComment('');
    }catch(e){setError(e instanceof Error?e.message:'Operação indisponível.')}finally{setBusy(false)}
  }
  if(publicacoes)return <section className={styles.scriptPanel}><h3>Pronto para publicar</h3>
    {error&&<p role="alert">{error}</p>}{rows.filter(r=>r.status==='aprovado_para_publicacao').map(r=><article key={r.id}><strong>{r.titulo}</strong><video controls preload="none" src={'/api/studio/workflow/video?kind=producao&id='+r.id}/></article>)}
    {!rows.some(r=>r.status==='aprovado_para_publicacao')&&<p>Sem dados ainda</p>}<button disabled>Publicar</button><small>Ação disponível após confirmação de acesso</small></section>;
  return <section className={styles.scriptPanel}>
    {error&&<p role="alert">{error}</p>}
    {creating?<form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);
      const lines=(key:string)=>String(form.get(key)||'').split('\n').map(s=>s.trim()).filter(Boolean);
      void act('briefing',{...Object.fromEntries(form),duracao_alvo_segundos:Number(form.get('duracao_alvo_segundos')),estrutura:['gancho','contexto','escalada','virada','fechamento'],restricoes:lines('restricoes'),fontes_de_pesquisa:lines('fontes_de_pesquisa')})}}>
      <h3>Novo briefing</h3>{Object.entries({titulo_provisorio:'Título provisório',nicho:'Nicho',publico:'Público',tom:'Tom da narração'}).map(([key,label])=><label key={key}>{label}<input name={key} required maxLength={600}/></label>)}
      <label>Formato<select name="formato"><option value="shorts">Shorts · vertical</option><option value="longo">Longo · horizontal</option></select></label>
      <label>Duração em segundos<input type="number" name="duracao_alvo_segundos" min="1" max="7200" required defaultValue="60"/></label>
      <label>Fontes de pesquisa, uma por linha<textarea name="fontes_de_pesquisa"/></label><label>Restrições<textarea name="restricoes"/></label>
      <button disabled={busy}>Salvar briefing</button><button type="button" onClick={()=>setCreating(false)}>Voltar</button>
    </form>:item?<><button onClick={()=>{setSelected('');setReviewed(false)}}>← Todos os roteiros</button><h3>{item.titulo}</h3><small>Versão {item.versao} · {item.status.replaceAll('_',' ')}</small>
      {item.comentario&&<p>{item.comentario}</p>}{item.roteiro?.cenas.map(c=><article key={c.id}><strong>{c.tipo}</strong><p>{c.narracao}</p><small>{c.verificar?'Requer verificação. ':''}{c.fontes.join(' · ')}</small></article>)}
      {item.status==='rascunho'&&<button disabled={busy} onClick={()=>act('gerar')}>Gerar roteiro</button>}
      {item.status==='erro'&&<button disabled={busy} onClick={()=>act('retomar')}>Reprocessar etapa</button>}
      {item.status==='aguardando_aprovacao'&&<><label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> Revisei a narração, as fontes e os trechos sinalizados.</label>
        <button disabled={!reviewed||busy} onClick={()=>act('aprovar',{revisado:true})}>Aprovar roteiro</button>
        <label>Comentário da revisão<textarea value={comment} onChange={e=>setComment(e.target.value)}/></label><button disabled={busy||!comment.trim()} onClick={()=>act('rejeitar',{comentario:comment})}>Devolver roteiro</button></>}
      {item.status==='aprovado'&&<button disabled={busy} onClick={()=>act('produzir')}>Produzir vídeo</button>}
      {item.producao&&<section><h3>Revisão do vídeo</h3><p>{item.producao.etapa} · {item.producao.chamadas} consultas ao Pexels</p>
        {item.producao.publico?.map(r=><details key={r.rodada}><summary>Público simulado · rodada {r.rodada} · {Math.floor(r.nota*10)/10}%</summary>
          {r.cenas.map((c,i)=><article key={i}><strong>Cena {i+1}</strong><p>{Object.entries(c.notas).map(([k,v])=>k+' '+v+'/100').join(' · ')}</p><p>{c.problema}</p><p>{c.ajuste}</p></article>)}</details>)}
        {item.producao.erro&&<p role="alert">{item.producao.erro}</p>}
        {item.producao.pronto&&<video key={item.producao.etapas[item.producao.etapas.length-1]?.fim??undefined} controls playsInline preload="metadata" src={'/api/studio/workflow/video?kind=producao&id='+item.id}/>}
        <details><summary>Tempos e créditos</summary>{item.producao.etapas.map(e=><p key={e.etapa+e.cena}>{e.etapa} · cena {e.cena+1} · {e.inicio&&e.fim?Math.round(e.fim-e.inicio)+' s':'Sem dados ainda'}</p>)}
        {item.producao.assets.map((a,i)=><p key={i}>{a.url?<a href={a.url} target="_blank" rel="noreferrer">{a.autor} · {a.origem}</a>:a.origem}</p>)}</details>
        {item.status==='aguardando_revisao_video'&&<><label>Comentário de revisão<textarea value={comment} onChange={e=>setComment(e.target.value)}/></label>
          {item.roteiro?.cenas.map((c,i)=><details key={c.id}><summary>Cena {i+1} · {c.tipo}</summary><pre>{item.producao?.legendas.find(l=>l.cena===i)?.srt||c.legenda_destaque}</pre>
          {['narracao','broll','legendas'].map(parte=><button key={parte} disabled={busy||!comment.trim()} onClick={()=>act('regenerar',{cena:i,parte,comentario:comment})}>Refazer {parte}</button>)}</details>)}
          <label><input type="checkbox" checked={rotulagem} onChange={e=>setRotulagem(e.target.checked)}/> Rotular uso de IA</label>
          <small>Confira a política de rotulagem de cada plataforma antes de publicar.</small>
          <button disabled={busy} onClick={()=>act('aprovar-video',{rotulagem_ia:rotulagem,revisado:true})}>Aprovar vídeo para publicação</button></>}
      </section>}
      {['rejeitado','aprovado','aguardando_aprovacao'].includes(item.status)&&<button disabled={busy} onClick={()=>act('nova-versao')}>Criar nova versão</button>}
    </>:<><button onClick={()=>setCreating(true)}>Criar briefing</button>{rows.length===0?<p>Sem dados ainda</p>:rows.map(r=><button key={r.id} onClick={()=>setSelected(r.id)}>{r.titulo} · v{r.versao}<small>{r.status.replaceAll('_',' ')}</small></button>)}</>}
  </section>
}
