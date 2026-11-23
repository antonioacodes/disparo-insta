'use client';
import {useEffect,useRef,useState} from 'react';
import DashboardShell from '../components/DashboardShell';
import map from './map.json';
import atlas from './atlas.json';

type Point = {x:number;y:number};
const size=32;
const directions:Record<string,Point>={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
const aliases:Record<string,string>={w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'};
const same=(a:Point,b:Point)=>a.x===b.x && a.y===b.y;
function walkable(p:Point){
  const tile=map.tiles[p.y]?.[p.x];
  return (tile==='.' || tile==='g') && !map.rooms.some(room=>same(room,p));
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
  const [avatar,move]=useState(map.spawn),[room,select]=useState(-1);
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
      if(tile==='#'){box(l,t,size,size,'#49525d');box(l,t,size,6,'#788492')}
      if(tile==='T'){box(l+14,t+17,5,14,'#805d44');box(l+4,t+2,25,22,'#508169')}
      if(tile==='D'||tile==='C'){
        box(l+1,t+10,30,19,'#986c55');box(l+1,t+8,30,16,'#c29b78');
        box(l+6,t+2,20,14,'#394456');box(l+8,t+4,16,9,tile==='C'?'#c1adff':'#94d9d4');
        box(l+9,t+18,14,3,'#e6dccb');
      }
    }));
    function sprite(p:Point,shirt:string,seated:boolean){
      const colors:Record<string,string>={...atlas.palette,c:shirt};
      atlas[seated?'seated':'standing'].forEach((row,y)=>Array.from(row).forEach((pixel,x)=>{
        if(colors[pixel])box(p.x*size+4+x*3,p.y*size+4+y*3,3,3,colors[pixel]);
      }));
      if(seated)box(p.x*size+6,p.y*size+24,20,5,'#6e5660');
    }
    map.rooms.forEach((r,i)=>{
      sprite(r,r.color,r.working);
      ctx.fillStyle='#302b39';ctx.font='bold 14px system-ui';ctx.textAlign='center';
      ctx.fillText(r.name,(4.5+6*i)*size,2.68*size);
      if(i===room){ctx.strokeStyle='#6941ab';ctx.lineWidth=2;ctx.strokeRect(r.x*size,r.y*size,size,size)}
    });
    sprite(avatar,'#3766d6',false);
  },[avatar,room]);
  return <DashboardShell active="Escritório"><main className="main"><p className="eyebrow">Demonstração · tarefas ilustrativas</p><h1 className="title">Escritório virtual</h1>
    <p>Você é o personagem de azul. Toque no chão ou use as setas e WASD para andar. Selecione um agente para ver sua sala.</p>
    <canvas ref={canvas} tabIndex={0} aria-label="Mapa do escritório. Use as setas para caminhar. Pressione Enter perto de uma mesa ou agente para abrir o painel. Os controles das salas estão abaixo." width={width} height={height}
      style={{display:'block',width:'100%',maxWidth:1008,height:'auto',imageRendering:'pixelated',borderRadius:12}}
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
    <div className="choiceRow" aria-label="Selecionar visão">{['Visão geral',...map.rooms.map(r=>r.name)].map((name,i)=><button key={name} aria-pressed={room===i-1} onClick={()=>select(i-1)}>{name}</button>)}</div>
    <section className="card" aria-live="polite"><h2>{room<0?'Computador central':map.rooms[room].name}</h2>
      {map.rooms.map((r,i)=>(room===-1||room===i)&&<p key={r.name}><strong>{r.name}</strong> · {r.working?'Trabalhando':'Ocioso'} · {r.task}</p>)}</section>
  </main></DashboardShell>
}
