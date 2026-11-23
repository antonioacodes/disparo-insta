import {useEffect,useState,type MutableRefObject} from 'react';

type Point={x:number;y:number};
type Visitor=Point&{id:number;name:string;facing:string};
export function usePresence(position:MutableRefObject<Point>,facing:MutableRefObject<string>){
  const [visitors,setVisitors]=useState<Visitor[]>([]);
  const [me,setMe]=useState<{name:string;admin:number}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    let joining=true;
    let timer:ReturnType<typeof setTimeout>;
    async function update(){
      try{
        const r=await fetch('/api/account/presence',{method:'POST',headers:{'Content-Type':'application/json'},
          signal:controller.signal,body:JSON.stringify({...position.current,facing:facing.current,joining})});
        if(r.status===401){location.replace('/entrar');return}
        if(!r.ok)throw Error();
        const d=await r.json();if(!controller.signal.aborted){if(joining&&position.current.x===12&&position.current.y===5)position.current=d.position;joining=false;setVisitors(d.people);setMe(d.me)}
      }catch{if(!controller.signal.aborted)setVisitors([])}
      if(!controller.signal.aborted)timer=setTimeout(update,2500);
    }
    void update();return ()=>{controller.abort();clearTimeout(timer)};
  },[position,facing]);
  return {visitors,me};
}
