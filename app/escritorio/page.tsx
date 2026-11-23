'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import styles from './office.module.css';
import map from './map.json';
import atlas from './atlas.json';

type Point = {x:number;y:number};
const size=32;
const directions:Record<string,Point>={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
const aliases:Record<string,string>={w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'};
const same=(a:Point,b:Point)=>a.x===b.x && a.y===b.y;
function walkable(p:Point){
  const tile=map.tiles[p.y]?.[p.x];
  return (tile==='.' || tile==='r' || tile==='g') && !map.rooms.some(room=>same(room,p));
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
      if(seated)box(p.x*size+6,p.y*size+28,20,5,'#6e5660');
    }
    map.rooms.forEach((r,i)=>{
      sprite(r,r.color,r.working);
      ctx.fillStyle='#384553';ctx.font='bold 10px system-ui';ctx.textAlign='center';
      box((4+6*i)*size-28,6*size+1,80,14,'#ffefd4');
      ctx.fillText(r.name,(4+6*i)*size+12,6*size+12);
    });
    sprite(avatar,'#3766d6',false);
  },[avatar,room]);
  const anchor=(x:number,y:number)=>({left:(x+.5)*size/width*100+'%',top:y*size/height*100+'%'});
  return <main className={styles.office} aria-label="Escritório virtual">
    <Link href="/studio" className={styles.back} aria-label="Voltar ao Studio" title="Voltar ao Studio">←</Link>
    <small className={styles.demo}>Demonstração</small>
    <div className={styles.viewport} ref={viewport}><div className={styles.world}>
    <canvas ref={canvas} tabIndex={0} aria-label="Mapa do escritório. Use setas ou WASD para andar, Enter para interagir ou toque no chão." width={width} height={height}
      onKeyDown={e=>{
        if(e.key==='Enter'){
          const near=(p:Point)=>Math.abs(p.x-avatar.x)+Math.abs(p.y-avatar.y)<=1;
          const index=map.rooms.findIndex(near);
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
    {map.rooms.map((r,i)=><div key={r.name}>
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
      {map.rooms.map(r=><span key={r.name}>{r.name} · {r.done} prontas · {r.count} na fila</span>)}
    </button></div></div>
    <dialog ref={dialog} onClose={()=>select(null)} className={styles.dialog}>
      <button autoFocus onClick={()=>select(null)} aria-label="Fechar detalhes">×</button>
      <small>Demonstração</small><h2>{room===-1?'Central de operações':map.rooms[room??0]?.name}</h2>
      {map.rooms.filter((_,i)=>room===-1||room===i).map(r=><section key={r.name}><h3>{r.person} · {r.name}</h3><p>{r.working?'Trabalhando':'Ocioso'} · {r.task}</p>
        <p>Tempo decorrido · {r.elapsed}</p><p>A seguir · {r.next}</p><small>{r.done} concluídas · {r.count} pendentes</small></section>)}
    </dialog></main>
}
