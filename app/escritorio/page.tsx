'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import styles from './office.module.css';
import map from './map.json';
import {loadScene} from './assets';

type Point = {x:number;y:number};
const size=32;
const directions:Record<string,Point>={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
const aliases:Record<string,string>={w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'};
// Caio takes two steps beside the coffee station and then returns to his cup.
const idleOffsets=[0,0,0,0,0,0,0,0,.3,.65,1,1,1,.65,.3,0];
const same=(a:Point,b:Point)=>a.x===b.x && a.y===b.y;
function walkable(p:Point,solid:number[]){
  const tile=map.tiles[p.y]?.[p.x];
  return tile!==undefined && solid[p.y*map.tiles[0].length+p.x]===0 && !map.rooms.some(room=>same(room,p)||(!room.working&&p.y===room.y&&p.x===room.x+1));
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
  const [scale,setScale]=useState(1);
  const [avatar,move]=useState(map.spawn),[room,select]=useState<number|null>(null);
  const [week,setWeek]=useState(false),[today,setToday]=useState<Date|null>(null),[frame,tick]=useState(0);
  useEffect(()=>{
    setToday(new Date());
    const clock=setInterval(()=>setToday(new Date()),60000);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation=reduced?undefined:setInterval(()=>{if(!document.hidden)tick(n=>(n+1)%idleOffsets.length)},450);
    return ()=>{clearInterval(clock);clearInterval(animation)};
  },[]);
  const daysBeforeToday=today?(today.getDay()+6)%7:0;
  const rooms=map.rooms.map((r,i)=>({...r,done:r.done+(week?map.demoActivity.completedPreviousDays.slice(0,daysBeforeToday).reduce((sum,day)=>sum+day[i],0):0)}));
  const people=rooms.map(r=>({...r,x:r.x+(r.working?0:idleOffsets[frame])}));
  const done=rooms.reduce((n,r)=>n+r.done,0);
  const pending=rooms.reduce((n,r)=>n+r.count,0);
  const total=done+pending+rooms.filter(r=>r.working).length;
  const dialog=useRef<HTMLDialogElement>(null);
  const viewport=useRef<HTMLDivElement>(null);
  const width=map.tiles[0].length*size,height=map.tiles.length*size;
  useEffect(()=>{
    const el=viewport.current!;
    const resize=new ResizeObserver(()=>{
      const zoom=Math.min(4,Math.max(2,Math.round(Math.min(el.clientWidth/width,el.clientHeight/height))));
      setScale(zoom);
    });
    resize.observe(el);
    return ()=>resize.disconnect();
  },[width,height]);
  useEffect(()=>{
    const el=viewport.current!;
    el.scrollLeft=(el.scrollWidth-el.clientWidth)/2;
    el.scrollTop=Math.max(0,(position.current.y+0.5)*size*scale-el.clientHeight/2);
  },[scale]);
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
        const el=viewport.current,scene=canvas.current;
        if(el&&scene){
          const rect=scene.getBoundingClientRect(),view=el.getBoundingClientRect();
          const x=rect.left+(n.x+.5)*rect.width/map.tiles[0].length,y=rect.top+(n.y+.5)*rect.height/map.tiles.length;
          el.scrollBy(x-Math.max(view.left+30,Math.min(view.right-30,x)),y-Math.max(view.top+30,Math.min(view.bottom-30,y)));
        }
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
      const stroll=!Number.isInteger(r.x);
      scene.actor(ctx,i,r.x,r.y,r.working?'up':stroll?(frame<11?'right':'left'):'down',r.working?'Digitar':stroll?'Andar':'Café',frame);
    }}));
    entities.push({x:avatar.x,y:avatar.y,draw:()=>scene.actor(ctx,3,avatar.x,avatar.y,facing.current,walking.current?'Andar':'Parado',walking.current?Math.floor(distance.current*8):frame)});
    layers[0].data.forEach((gid,i)=>scene.tile(ctx,gid,i%cols,Math.floor(i/cols)));
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++)scene.tile(ctx,layers[1].data[y*cols+x],x,y);
      entities.filter(e=>Math.floor(e.y)===y).sort((a,b)=>a.y-b.y).forEach(e=>e.draw());
    }
    ctx.font='bold 10px system-ui';ctx.textAlign='center';
    map.rooms.forEach((r,i)=>{
      ctx.fillStyle='#ffefd4';ctx.fillRect((4+6*i)*size-28,6*size+1,80,14);
      ctx.fillStyle='#384553';ctx.fillText(r.name,(4+6*i)*size+12,6*size+12);
    });
  },[avatar,frame,scene]);
  const anchor=(x:number,y:number)=>({left:(x+.5)*size/width*100+'%',top:y*size/height*100+'%'});
  return <main className={styles.office} aria-label="Escritório virtual">
    <header className={styles.hud}><Link href="/studio" className={styles.back} aria-label="Voltar ao Studio" title="Voltar ao Studio">←</Link>
    <div><strong>Escritório virtual</strong><small>{today?.toLocaleDateString('pt-BR',{day:'numeric',month:'short'})} · Demonstração</small></div>
    <div className={styles.stats}><span><b>{pending}</b> Pendentes</span><span><b>{done}</b> Concluídas</span><span><b>{map.demoActivity.publicationHoursAgo.filter(hours=>hours<72).length}</b> Publicações · 72h</span></div>
    <div className={styles.overall}><strong>{done} de {total} tarefas concluídas {week?'nesta semana':'hoje'}</strong><progress value={done} max={total}/><small>Sem histórico suficiente para estimar</small></div>
    <label><select aria-label="Período do escritório" value={week?'week':'today'} onChange={e=>setWeek(e.target.value==='week')}><option value="today">Hoje</option><option value="week">Esta semana</option></select></label>
    <nav aria-label="Progresso por agente">{rooms.map((r,i)=><button key={r.name} onClick={()=>select(i)}><i style={{background:r.color}}/>{r.person} · {r.done}/{r.done+r.count+Number(r.working)}</button>)}
    <button onClick={()=>select(-1)}>Central de operações ↗</button></nav></header>
    {assetError&&<p role="alert">Falha ao carregar a arte do escritório. Recarregue a página.</p>}
    <div className={styles.viewport} ref={viewport}><div className={styles.world} style={{width:width*scale,height:height*scale,minHeight:0}}>
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
        const agent=map.rooms.find(r=>same(r,p));
        e.currentTarget.title=agent?agent.name+' · '+agent.task:same(p,map.computer)?'Computador central':'';
      }}
      onClick={e=>{
        e.currentTarget.focus({preventScroll:true});held.current=null;
        const rect=e.currentTarget.getBoundingClientRect();
        const p={x:Math.floor((e.clientX-rect.left)*width/rect.width/size),y:Math.floor((e.clientY-rect.top)*height/rect.height/size)};
        const i=map.rooms.findIndex(r=>same(p,r));
        if(i>=0||same(p,map.computer)){select(i);return}
        const first=route.current.slice(0,1);
        route.current=[...first,...(solid?path(first[0]||position.current,p,solid):[])];
      }}/>
    {people.map((r,i)=><div key={r.name}>
      <button className={styles.person} style={anchor(r.x,r.y-.5)} onClick={()=>select(i)}>
        <span className={styles.tag}><i data-state={r.working?'working':'idle'}/>{r.person}</span>
        <span className={styles.bubble}>{r.task} · {r.elapsed}<br/>A seguir · {r.next}</span>
      </button>
      <button className={styles.screen} style={anchor([3,10,16][i],2.85)} onClick={()=>select(i)}>
        <b>{r.task}</b><span>{r.elapsed} · {r.next}</span>
      </button>
    </div>)}
    <span className={styles.you} style={anchor(avatar.x,avatar.y-.5)}>Você</span>
    <button className={styles.board} style={anchor(map.computer.x,map.computer.y)} onClick={()=>select(-1)}>
      <b>Central de operações</b>
      {rooms.map(r=><span key={r.name}>{r.name} · {r.done} prontas · {r.count} na fila</span>)}
    </button></div></div>
    <dialog ref={dialog} onClose={()=>select(null)} className={styles.dialog}>
      <button autoFocus onClick={()=>select(null)} aria-label="Fechar detalhes">×</button>
      <small>Demonstração</small><h2>{room===-1?'Central de operações':map.rooms[room??0]?.name}</h2>
      {rooms.filter((_,i)=>room===-1||room===i).map(r=><section key={r.name}><h3>{r.person} · {r.name}</h3><p>{r.working?'Trabalhando':'Ocioso'} · {r.task}</p>
        <p>Tempo decorrido · {r.elapsed}</p><p>A seguir · {r.next}</p><small>{r.done} concluídas · {r.count} pendentes</small></section>)}
    </dialog></main>
}
