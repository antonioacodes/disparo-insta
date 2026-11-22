'use client';
import {useEffect,useRef,useState} from 'react';

function tone(ctx:AudioContext,frequency:number,start:number,length:number){
  const oscillator=ctx.createOscillator();
  const gain=ctx.createGain();
  oscillator.frequency.value=frequency;
  gain.gain.setValueAtTime(0.001,start);
  gain.gain.exponentialRampToValueAtTime(0.10,start+0.015);
  gain.gain.exponentialRampToValueAtTime(0.001,start+length);
  oscillator.connect(gain);gain.connect(ctx.destination);
  oscillator.start(start);oscillator.stop(start+length);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}

export function PreviewSounds({completed,finished}:{completed:string[];finished:boolean}){
  const audio=useRef<AudioContext|null>(null);
  const heard=useRef(new Set<string>());
  const [enabled,setEnabled]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>()=>{if(audio.current)void audio.current.close();},[]);
  useEffect(()=>{
    if(!enabled || !audio.current)return;
    const ctx=audio.current;
    const fresh=completed.filter(id=>!heard.current.has(id));
    let start=ctx.currentTime+0.04;
    for(const id of fresh){
      heard.current.add(id);
      tone(ctx,740,start,0.16);start+=0.28;
    }
    if(fresh.length && finished){
      for(const hz of [523,659,784]){tone(ctx,hz,start,0.25);start+=0.17;}
    }
  },[completed,finished,enabled]);
  async function toggle(){
    try{
      setError('');
      if(enabled){setEnabled(false);await audio.current?.suspend();return;}
      const ctx=audio.current??new AudioContext();
      audio.current=ctx;
      await ctx.resume();
      heard.current=new Set(completed);
      setEnabled(true);
    }catch{setError('Não foi possível ativar o som neste navegador.');}
  }
  return <div><button type="button" className="reviewBtn secondary" aria-pressed={enabled} onClick={toggle}>
    {enabled?'Silenciar avisos':'Ativar avisos sonoros'}</button>
    {enabled&&<small> Mantenha este projeto aberto para ouvir os avisos.</small>}
    {error&&<p role="status">{error}</p>}</div>;
}
