import {useEffect,useState} from 'react';

type Task = {label:string;stage:string|null;project:string|null;clip:string|null;started:number|null;queuedAt:number|null;error:string|null};
type Ready = {state:string;audience?:import('../studio/Audience').Verdict|null;id:string;title:string;projectTitle:string;project:string;kind:'preview'|'final'};
export type Office = {scripts?:{status:string;etapa:string|null;aguardando:number;produzindo:number};activity?:{agent:string;id:number;label:string;title:string;at:number}[];trendStatus?:string;trendTask?:{progress?:import('./TrendProgress').ResearchProgress;query:string;state:string}|null;audienceStatus?:string;status:string;current:Task|null;next:Task|null;lastError:Task|null;failed:number;queued:number;
  finished:number[];ready:Ready[];prediction:{percent:number;remaining:number}|null};

export function useOffice(){
  const [data,setData]=useState<Office|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    let timeout:ReturnType<typeof setTimeout>;
    async function refresh(){
      try{
        const response=await fetch('/api/studio/workflow?office=1',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error();
        const snapshot:Office=await response.json();
        if(!controller.signal.aborted){setData(snapshot);setFailed(false)}
      }catch{if(!controller.signal.aborted)setFailed(true)}
      if(!controller.signal.aborted)timeout=setTimeout(refresh,5000);
    }
    void refresh();
    return ()=>{controller.abort();clearTimeout(timeout)};
  },[]);
  return {data,failed};
}
