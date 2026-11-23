'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import styles from './office.module.css';
import map from './map.json';
import {furniture} from './decor';
import atlas from './atlas.json';

type Point = {x:number;y:number};
const size=32;
const directions:Record<string,Point>={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
const aliases:Record<string,string>={w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'};
// Caio takes two steps beside the coffee station and then returns to his cup.
const idleOffsets=[0,0,0,0,0,0,0,0,.3,.65,1,1,1,.65,.3,0];
const same=(a:Point,b:Point)=>a.x===b.x && a.y===b.y;
function walkable(p:Point){
  const tile=map.tiles[p.y]?.[p.x];
  return (tile==='.' || tile==='r' || tile==='g') && !map.rooms.some(room=>same(room,p)||(!room.working&&p.y===room.y&&p.x===room.x+1));
}
function path(from:Point,to:Point){
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
      if(walkable(n)&&!seen.has(key)){seen.add(key);parents.set(n,p);queue.push(n)}
    }
  }
  return [];
}

export default function Office(){
  const canvas=useRef<HTMLCanvasElement>(null);
  const timer=useRef<ReturnType<typeof setInterval>|undefined>(undefined);
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
  useEffect(()=>{const el=viewport.current;if(el)el.scrollLeft=(el.scrollWidth-el.clientWidth)/2},[]);
  useEffect(()=>{if(room!==null)dialog.current?.showModal();else dialog.current?.close()},[room]);
  const width=map.tiles[0].length*size,height=map.tiles.length*size;
  useEffect(()=>()=>clearInterval(timer.current),[]);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');
    if(!ctx)return;
    function box(x:number,y:number,w:number,h:number,color:string){
      ctx!.fillStyle=color;ctx!.fillRect(x,y,w,h);
    }
    map.tiles.forEach((line,y)=>Array.from(line).forEach((tile,x)=>{
      const l=x*size,t=y*size;
      const floor=y<6?['#eedff7','#d7eee7','#f7e1d6'][Math.min(2,Math.floor(x/7))]:'#eee7d8';
      box(l,t,size,size,tile==='g'||tile==='T'?'#bbd4aa':floor);
      if(tile==='g'||tile==='T'){
        box(l+7,t+9,2,4,'#91ad80');box(l+9,t+7,2,4,'#91ad80');box(l+25,t+22,3,2,'#d4dda6');
      }else if(tile==='r'){
        box(l,t,size,size,'#606875');box(l,t,size,5,'#c5c3b9');box(l+4,t+22,16,2,'#e4c988');
      }else{
        box(l,t+15,32,1,'#c9bda9');box(l+((x+y)%2?8:24),t,1,15,'#c9bda9');box(l,t+31,32,1,'#cabfae');
      }
      if(y>=2&&y<=5&&x>7&&x<13){
        box(l,t,32,32,(x+y)%2?'#c7dcd3':'#d9e5da');box(l,t,1,32,'#adbfba');box(l,t,32,1,'#adbfba');
      }
      if(y>=3&&y<=5&&x>1&&x<7){
        box(l,t,32,32,'#bcb1d1');for(let k=0;k<32;k+=8)box(l+k,t,2,32,'#b5a8c9');
      }
      furniture(ctx!,tile,l,t);
      if(tile==='#'){
        box(l,t,size,size,'#424b5c');box(l+1,t+2,30,20,'#677687');box(l+1,t+23,30,5,'#515d70');
        if((y===1||y===9)&&x%6>=2&&x%6<=4){
          box(l+1,t+5,30,15,'#99c8d4');box(l+3,t+6,12,3,'#cfe5e4');box(l+15,t+5,2,15,'#536979');
        }
      }
      if(tile==='T'||tile==='P'){
        const pot=tile==='P';
        box(l+9,t+23,15,5,'#87957a');box(l+11,t+17,11,10,pot?'#b37457':'#805d44');
        box(l+4,t+9,24,10,'#416e58');box(l+8,t+4,16,16,'#508564');
        box(l+12,t+1,9,16,'#75a875');box(l+4,t+7,9,4,'#84ad76');
      }
      if(tile==='K'){
        box(l+3,t+4,26,24,'#816853');box(l+5,t+6,22,19,'#b9946d');
        for(let j=0;j<5;j++)box(l+6+j*4,t+8+(j%2)*2,3,8,['#64778b','#d9ab69','#8b645e'][j%3]);
        box(l+4,t+17,24,2,'#725c50');box(l+8,t+20,14,4,'#ede4ce');
      }
      if(tile==='D'||tile==='C'){
        box(l+1,t+10,30,19,'#986c55');box(l+1,t+8,30,16,'#c29b78');
        box(l+6,t+2,20,14,'#394456');box(l+8,t+4,16,9,tile==='C'?'#c1adff':'#94d9d4');
        box(l+9,t+18,14,3,'#e6dccb');
      }
    }));
    function sprite(p:Point,shirt:string,seated:boolean){
      const colors:Record<string,string>={...atlas.palette,c:shirt};
      atlas[seated?'seated':'standing'].forEach((row,y)=>Array.from(row).forEach((pixel,x)=>{
        if(colors[pixel])box(p.x*size+x*4,p.y*size+y*4,4,4,colors[pixel]);
      }));
      if(!seated&&p.x%1!==0)box(p.x*size+3,p.y*size+29,7,3,colors.b);
      if(seated)box(p.x*size+6,p.y*size+28,20,5,'#6e5660');
    }
    people.forEach((r,i)=>{
      sprite(r,r.color,r.working);
      const l=r.x*size,t=r.y*size;
      // Hair, clothing and handheld props distinguish the three people.
      if(i===0){box(l+3,t+9,5,12,'#483745');box(l+22,t+5,4,5,'#deac68')}
      if(i===2){box(l+3,t+5,22,5,'#9e533d');box(l+23,t+9,5,13,'#944635')}
      if(r.working){
        box(l+2,t+16+(frame%2)*2,6,4,'#eac5a1');box(l+23,t+18-(frame%2)*2,6,4,'#eac5a1');
      }else{
        const lift=frame>=4&&frame<=6?6:0;
        box(l+18,t+20-lift,8,7,'#fff1cb');box(l+26,t+21-lift,3,4,'#d8ba92');
        box(l+19,t+19-lift,6,2,'#725644');
      }
      ctx.fillStyle='#384553';ctx.font='bold 10px system-ui';ctx.textAlign='center';
      box((4+6*i)*size-28,6*size+1,80,14,'#ffefd4');
      ctx.fillText(r.name,(4+6*i)*size+12,6*size+12);
    });
    sprite(avatar,'#3766d6',false);
    box(avatar.x*size+((avatar.x+avatar.y)%2?4:19),avatar.y*size+27,8,4,'#263854');
  },[avatar,frame]);
  const anchor=(x:number,y:number)=>({left:(x+.5)*size/width*100+'%',top:y*size/height*100+'%'});
  return <main className={styles.office} aria-label="Escritório virtual">
    <header className={styles.hud}><Link href="/studio" className={styles.back} aria-label="Voltar ao Studio" title="Voltar ao Studio">←</Link>
    <div><strong>Escritório virtual</strong><small>{today?.toLocaleDateString('pt-BR',{day:'numeric',month:'short'})} · Demonstração</small></div>
    <div className={styles.stats}><span><b>{pending}</b> Pendentes</span><span><b>{done}</b> Concluídas</span><span><b>{map.demoActivity.publicationHoursAgo.filter(hours=>hours<72).length}</b> Publicações · 72h</span></div>
    <div className={styles.overall}><strong>{done} de {total} tarefas concluídas {week?'nesta semana':'hoje'}</strong><progress value={done} max={total}/><small>Sem histórico suficiente para estimar</small></div>
    <label><select aria-label="Período do escritório" value={week?'week':'today'} onChange={e=>setWeek(e.target.value==='week')}><option value="today">Hoje</option><option value="week">Esta semana</option></select></label>
    <nav aria-label="Progresso por agente">{rooms.map((r,i)=><button key={r.name} onClick={()=>select(i)}><i style={{background:r.color}}/>{r.person} · {r.done}/{r.done+r.count+Number(r.working)}</button>)}
    <button onClick={()=>select(-1)}>Central de operações ↗</button></nav></header>
    <div className={styles.viewport} ref={viewport}><div className={styles.world}>
    <canvas ref={canvas} tabIndex={0} aria-label="Mapa do escritório. Use setas ou WASD para andar, Enter para interagir ou toque no chão." width={width} height={height}
      onKeyDown={e=>{
        if(e.key==='Enter'){
          const near=(p:Point)=>Math.abs(p.x-avatar.x)+Math.abs(p.y-avatar.y)<=1;
          const index=people.findIndex(r=>near({...r,x:Math.round(r.x)}));
          if(index>=0||near(map.computer)){clearInterval(timer.current);select(index)}
          return;
        }
        const delta=directions[aliases[e.key.toLowerCase()]||e.key];
        if(!delta)return;
        e.preventDefault();clearInterval(timer.current);
        move(p=>{const n={x:p.x+delta.x,y:p.y+delta.y};return walkable(n)?n:p});
      }}
      onPointerMove={e=>{
        const rect=e.currentTarget.getBoundingClientRect();
        const p={x:Math.floor((e.clientX-rect.left)*width/rect.width/size),y:Math.floor((e.clientY-rect.top)*height/rect.height/size)};
        const agent=map.rooms.find(r=>same(r,p));
        e.currentTarget.title=agent?agent.name+' · '+agent.task:same(p,map.computer)?'Computador central':'';
      }}
      onClick={e=>{
        e.currentTarget.focus();clearInterval(timer.current);
        const rect=e.currentTarget.getBoundingClientRect();
        const p={x:Math.floor((e.clientX-rect.left)*width/rect.width/size),y:Math.floor((e.clientY-rect.top)*height/rect.height/size)};
        const i=map.rooms.findIndex(r=>same(p,r));
        if(i>=0||same(p,map.computer)){select(i);return}
        const steps=path(avatar,p);
        if(steps.length)timer.current=setInterval(()=>{move(steps.shift()!);if(!steps.length)clearInterval(timer.current)},90);
      }}/>
    {people.map((r,i)=><div key={r.name}>
      <button className={styles.person} style={anchor(r.x,r.y)} onClick={()=>select(i)}>
        <span className={styles.tag}><i data-state={r.working?'working':'idle'}/>{r.person}</span>
        <span className={styles.bubble}>{r.task} · {r.elapsed}<br/>A seguir · {r.next}</span>
      </button>
      <button className={styles.screen} style={anchor([3,10,16][i],2.85)} onClick={()=>select(i)}>
        <b>{r.task}</b><span>{r.elapsed} · {r.next}</span>
      </button>
    </div>)}
    <span className={styles.you} style={anchor(avatar.x,avatar.y)}>Você</span>
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
