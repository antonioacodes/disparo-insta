'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import styles from './office.module.css';
import map from './map.json';
import {useOffice} from './useOffice';
import {ProjectIntake} from '../studio/reaproveitar/ProjectIntake';
import {Department,ActionCard,StatusIcon} from './Department';
import {Ambience} from './Ambience';
import {loadScene} from './assets';

type Point = {x:number;y:number};
const size=32;
const directions:Record<string,Point>={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
const aliases:Record<string,string>={w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'};
const same=(a:Point,b:Point)=>a.x===b.x && a.y===b.y;
function OfficeVideo({id,kind}:{id:string;kind:string}){
  return <video controls playsInline preload="none" aria-label="Reproduzir corte" src={'/api/studio/workflow/video?id='+encodeURIComponent(id)+'&kind='+kind}/>;
}
function walkable(p:Point,solid:number[]){
  const tile=map.tiles[p.y]?.[p.x];
  return tile!==undefined && solid[p.y*map.tiles[0].length+p.x]===0 && !map.rooms.some(room=>same(room,p));
}
function path(from:Point,to:Point,solid:number[]){
  const queue=[from], parents=new Map<Point,Point>(), seen=new Set([from.x+','+from.y]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    if(same(p,to)){
      const steps:Point[]=[];
      for(let n=p;parents.has(n);n=parents.get(n)!) steps.unshift(n);
      return steps;
    }
    for(const delta of Object.values(directions)){
      const n={x:p.x+delta.x,y:p.y+delta.y}, key=n.x+','+n.y;
      if(walkable(n,solid)&&!seen.has(key)){seen.add(key);parents.set(n,p);queue.push(n)}
    }
  }
  return [];
}

export default function Office(){
  const [scene,setScene]=useState<Awaited<ReturnType<typeof loadScene>>|null>(null),[assetError,setAssetError]=useState(false);
  const solid=scene?.map.layers[1].data;
  useEffect(()=>{let active=true;loadScene().then(value=>{if(active)setScene(value)}).catch(()=>{if(active)setAssetError(true)});return ()=>{active=false}},[]);
  const canvas=useRef<HTMLCanvasElement>(null);
  const position=useRef<Point>(map.spawn), route=useRef<Point[]>([]), held=useRef<Point|null>(null);
  const facing=useRef('down'),distance=useRef(0),walking=useRef(false);
  const [avatar,move]=useState(map.spawn),[room,select]=useState<number|null>(null);
  const [week,setWeek]=useState(false),[today,setToday]=useState<Date|null>(null),[frame,tick]=useState(0);
  useEffect(()=>{
    setToday(new Date());
    const clock=setInterval(()=>setToday(new Date()),60000);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation=reduced?undefined:setInterval(()=>{if(!document.hidden)tick(n=>(n+1)%16)},450);
    return ()=>{clearInterval(clock);clearInterval(animation)};
  },[]);
  const {data,failed}=useOffice();
  const start=new Date(today??0);
  start.setHours(0,0,0,0);
  if(week)start.setDate(start.getDate()-(start.getDay()+6)%7);
  const done=data?.finished.filter(at=>at>=start.getTime()/1000).length??0;
  const pending=data?.queued??0;
  const rooms=map.rooms.map((r,i)=>{
    const status=i!==0?'Ainda não configurado':failed?'Sem conexão':data?.status??'Conectando';
    return {...r,status,working:status==='Trabalhando'};
  });
  const people=rooms.map(r=>{
    const seated=r.working||r.status==='Ocioso';
    return {...r,seated,...(seated?r.seat:{x:r.x,y:r.y})};
  });
  const total=done+pending+Number(rooms[0].working);
  const ready=data?.ready??[];
  const current=data?.current;
  const prediction=data?.prediction;
  const eta=prediction?'≈ '+Math.max(1,Math.ceil(prediction.remaining/60))+' min':'Estimando tempo';
  const elapsed=current?.started?Math.max(0,Math.floor(Date.now()/1000-current.started)):0;
  const [view,setView]=useState<'home'|'edit'|'ready'|'info'>('home');
  const [newProject,setNewProject]=useState('');
  function details(index:number){
    if(index!==0)return <span>Integração de {rooms[index].name.toLowerCase()} ainda não disponível.</span>;
    return <><span>{rooms[0].status} · {current?.stage||current?.label||'Sem tarefa em execução'}</span>
      {current&&<><span>{[current.project,current.clip].filter(Boolean).join(' · ')}</span>
        {current.queuedAt&&current.started&&<span>Tempo em fila · {Math.max(0,current.started-current.queuedAt)} s</span>}
        <span>Em execução há {Math.floor(elapsed/60)} min {elapsed%60} s</span></>}
      {rooms[0].working&&<span>Tempo restante · {eta}</span>}
      {data&&<span>{pending} na fila{data.next?' · A seguir: '+[data.next.label,data.next.project].filter(Boolean).join(' · '):''}</span>}
      {data?.lastError&&<span>Última falha · {data.lastError.error}</span>}</>;
  }
  const dialog=useRef<HTMLDialogElement>(null);
  const width=map.tiles[0].length*size,height=map.tiles.length*size;
  useEffect(()=>{if(room!==null){route.current=route.current.slice(0,1);held.current=null;dialog.current?.showModal()}else dialog.current?.close()},[room]);
  useEffect(()=>{
    let id=0,previous=0;
    function animate(now:number){
      const p=position.current;
      if(!route.current.length&&held.current){
        const n={x:Math.round(p.x)+held.current.x,y:Math.round(p.y)+held.current.y};
        if(solid&&walkable(n,solid))route.current=[n];
      }
      const target=route.current[0];
      if(target){
        const dx=target.x-p.x,dy=target.y-p.y,len=Math.hypot(dx,dy);
        const advance=Math.min(len,Math.min(now-previous,45)*.005);
        if(len>0)facing.current=dx>0?'right':dx<0?'left':dy<0?'up':'down';
        const n=advance>=len?target:{x:p.x+dx*advance/len,y:p.y+dy*advance/len};
        if(advance>=len)route.current.shift();
        distance.current+=advance;walking.current=true;position.current=n;move(n);

      }else if(walking.current){walking.current=false;move({...p})}
      previous=now;id=requestAnimationFrame(animate);
    }
    id=requestAnimationFrame(animate);return ()=>cancelAnimationFrame(id);
  },[solid]);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');
    if(!ctx)return;
    ctx.imageSmoothingEnabled=false;
    if(!scene)return;
    const {width:cols,height:rows,layers}=scene.map;
    const entities=people.map((r,i)=>({x:r.x,y:r.y,draw:()=>{
      if(r.seated){
        // The north-facing backrest is between the viewer and the seated agent.
        scene.actor(ctx,i,r.x,r.y-0.54,'up',r.working?'Digitar':'Sentar',frame);
        scene.tile(ctx,18,r.x,r.y);
      }else{
        scene.actor(ctx,i,r.x,r.y,'down','Café',frame);
      }
    }}));
    entities.push({x:avatar.x,y:avatar.y,draw:()=>scene.actor(ctx,3,avatar.x,avatar.y,facing.current,walking.current?'Andar':'Parado',walking.current?Math.floor(distance.current*8):frame)});
    layers[0].data.forEach((gid,i)=>scene.tile(ctx,gid,i%cols,Math.floor(i/cols)));
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const gid=layers[1].data[y*cols+x],left=x*size,top=y*size;
        scene.tile(ctx,gid,x+([7,54].includes(gid)&&frame%8>4?1/32:0),y);
        if(gid===1||gid===2||gid===53){
          ctx.fillStyle=frame%6<3?'#87b8c8':'#96cddd';ctx.fillRect(left+9,top+2,6,1);
          ctx.fillStyle='#ebe9db';ctx.fillRect(left+29,top+7-frame%4,1,2);
        }
        if(gid===60){
          ctx.fillStyle=frame%4<2?'#f5eddf':'#dad4c7';
          for(let k=0;k<3;k++)ctx.fillRect(left+15+((frame+k)%3),top-7-k*3-frame%3,2,2);
        }
        if(gid===19||gid===8){ctx.fillStyle=gid===19?'#8adc9f':'#c3edf4';ctx.fillRect(left+20,top+16+(gid===8?frame%3:0),frame%4===0?2:1,2)}
      }
      entities.filter(e=>Math.floor(e.y)===y).sort((a,b)=>a.y-b.y).forEach(e=>e.draw());
    }
    ctx.font='bold 10px system-ui';ctx.textAlign='center';
    map.rooms.forEach((r,i)=>{
      ctx.fillStyle='#ffefd4';ctx.fillRect(r.signX*size-28,r.signY*size+1,80,14);
      ctx.fillStyle='#384553';ctx.fillText(r.name,r.signX*size+12,r.signY*size+12);
    });
  },[avatar,frame,scene,data,failed]);
  const anchor=(x:number,y:number)=>({left:(x+.5)*size/width*100+'%',top:y*size/height*100+'%'});
  return <main className={styles.office} aria-label="Escritório virtual">
    <header className={styles.hud}><Link href="/studio" className={styles.back} aria-label="Voltar ao Studio" title="Voltar ao Studio">←</Link>
    <div><strong>Escritório virtual</strong><small>{today?.toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}</small></div>
    <div className={styles.stats}><span>{data?pending:'—'} na fila</span><span>{data?ready.length:'—'} vídeos prontos</span></div>
    <div className={styles.overall}><strong>{data?done+' concluídas '+(week?'nesta semana':'hoje'):'Consultando a fila do Studio'}</strong>
      {total>0&&<progress value={done} max={total}/>}<small>{rooms[0].status}</small></div>
    <label><select aria-label="Período do escritório" value={week?'week':'today'} onChange={e=>setWeek(e.target.value==='week')}><option value="today">Hoje</option><option value="week">Esta semana</option></select></label>
    <nav aria-label="Progresso por agente">{rooms.map((r,i)=><button key={r.name} onClick={()=>select(i)}><i style={{background:r.color}}/>{r.name}</button>)}
    <button onClick={()=>select(-1)}>Central de operações ↗</button><Ambience/></nav></header>
    {assetError&&<p role="alert">Falha ao carregar a arte do escritório. Recarregue a página.</p>}
    <div className={styles.viewport}><div className={styles.world} style={{width:`min(100cqw, ${100*width/height}cqh)`,aspectRatio:`${width}/${height}`}}>
    <canvas ref={canvas} tabIndex={0} aria-label="Mapa do escritório. Use setas ou WASD para andar, Enter para interagir ou toque no chão." width={width} height={height}
      onKeyDown={e=>{
        if(e.key==='Enter'){
          const near=(p:Point)=>Math.abs(p.x-avatar.x)+Math.abs(p.y-avatar.y)<=1;
          const index=people.findIndex(r=>near({...r,x:Math.round(r.x)}));
          if(index>=0||near(map.computer)){select(index)}
          return;
        }
        const delta=directions[aliases[e.key.toLowerCase()]||e.key];
        if(!delta)return;
        e.preventDefault();held.current=delta;
        route.current=route.current.slice(0,1);
        if(!e.repeat&&!route.current.length){
          const n={x:Math.round(position.current.x)+delta.x,y:Math.round(position.current.y)+delta.y};
          if(solid&&walkable(n,solid))route.current=[n];
        }
      }}
      onKeyUp={e=>{if(directions[aliases[e.key.toLowerCase()]||e.key]===held.current)held.current=null}}
      onBlur={()=>{held.current=null}}
      onPointerMove={e=>{
        const rect=e.currentTarget.getBoundingClientRect();
        const p={x:Math.floor((e.clientX-rect.left)*width/rect.width/size),y:Math.floor((e.clientY-rect.top)*height/rect.height/size)};
        const agent=people.find(r=>same({x:Math.round(r.x),y:Math.round(r.y)},p));
        e.currentTarget.title=agent?agent.person+' · '+agent.status:same(p,map.computer)?'Computador central':'';
      }}
      onClick={e=>{
        e.currentTarget.focus({preventScroll:true});held.current=null;
        const rect=e.currentTarget.getBoundingClientRect();
        const p={x:Math.floor((e.clientX-rect.left)*width/rect.width/size),y:Math.floor((e.clientY-rect.top)*height/rect.height/size)};
        const i=people.findIndex(r=>same(p,{x:Math.round(r.x),y:Math.round(r.y)}));
        if(i>=0||same(p,map.computer)){select(i);return}
        const first=route.current.slice(0,1);
        route.current=[...first,...(solid?path(first[0]||position.current,p,solid):[])];
      }}/>
    {people.map((r,i)=><div key={r.name}>
      <button className={styles.person} aria-label={r.person+" · "+r.name} style={anchor(r.x,r.y+(r.seated?-.8:-.5))} onClick={()=>select(i)}>
        <span className={styles.tag}><strong title={r.status}><StatusIcon status={r.status}/>{r.person}</strong>{r.working&&<>
          <small>Trabalhando · {eta}</small>
          <progress aria-label="Progresso estimado da tarefa" value={prediction?.percent} max={100}
            style={{accentColor:!prediction||prediction.percent<35?'#ef6464':prediction.percent<75?'#f5c94f':'#61d58b'}}/>
        </>}</span>
        <span className={styles.bubble}><b>{r.person} · {r.name}</b>{details(i)}</span>
      </button>
    </div>)}
    {rooms.map((r,i)=><button key={r.name} className={styles.door} aria-label={'Abrir sala de '+r.name}
      style={{left:(r.signX*32-28)/width*100+'%',top:(r.signY*32+1)/height*100+'%',width:80/width*100+'%',height:14/height*100+'%'}} onClick={()=>select(i)}/>)}
    <span className={styles.you} style={anchor(avatar.x,avatar.y-.5)}>Você</span>
    <button className={styles.board} style={anchor(12,1.1)} onClick={()=>select(-1)}>
      <b>Central de operações</b>{ready.length>0&&<span className={styles.ready}>{ready.length} {ready.length===1?'vídeo pronto':'vídeos prontos'}</span>}

    </button></div></div>
    <dialog ref={dialog} onClose={()=>{select(null);setView('home');setNewProject('')}} className={styles.dialog}>
      <button autoFocus onClick={()=>select(null)} aria-label="Fechar detalhes">×</button>
      {room===-1&&<><h2>Central de operações</h2>{rooms.map((r,i)=><section key={r.name} className={styles.detail}><h3>{r.person} · {r.name}</h3>{details(i)}</section>)}</>}
      {room!==null&&room>=0&&<Department {...rooms[room]} onBack={view==='home'?undefined:()=>setView('home')}>
        {view==='home'&&<>
          {room===0&&<p>{current?.stage||current?.label||(data?'Sem tarefa em execução':'Consultando a fila…')}{data&&' · '+pending+' na fila'}</p>}
          <div className={styles.actions}>{room===0?<>
            <ActionCard title="Edição" caption="Criar um projeto" onClick={()=>{setNewProject('');setView('edit')}}/>
            <ActionCard title="Vídeos prontos" caption={data?ready.length+' disponíveis':'Consultar vídeos'} onClick={()=>setView('ready')}/>
          </>:<ActionCard title="Integração" caption="Consultar disponibilidade" onClick={()=>setView('info')}/>}</div>
          {room===0&&newProject&&<p role="status">Projeto enviado para a fila de edição.</p>}
        </>}
        {view==='info'&&<section className={styles.detail}><h3>Disponibilidade</h3>{details(room)}</section>}
        {room===0&&view==='edit'&&<ProjectIntake guided onCreated={id=>{setNewProject(id);setView('home')}}/>}
      </Department>}
      {(room===0&&view==='ready'||room===-1)&&<section><h3>Vídeos prontos {data&&'· '+ready.length}</h3>
        {!data?<p>{failed?'Não foi possível consultar o Studio.':'Consultando o Studio…'}</p>:ready.length===0?<p>A primeira prévia aparecerá aqui assim que estiver disponível.</p>:ready.map(c=><details key={c.id}><summary>{c.projectTitle} · {c.title}</summary>
          <OfficeVideo id={c.id} kind={c.kind}/><Link href={{pathname:'/studio',query:{project:c.project}}}>Abrir revisão no Studio</Link></details>)}</section>}
    </dialog></main>
}
