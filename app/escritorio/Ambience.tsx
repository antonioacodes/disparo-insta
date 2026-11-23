'use client';
import {useEffect,useRef,useState} from 'react';
export function Ambience(){
  const audio=useRef<AudioContext|null>(null);
  const [on,setOn]=useState(false);
  useEffect(()=>()=>{void audio.current?.close()},[]);
  async function toggle(){
    if(audio.current){const old=audio.current;audio.current=null;setOn(false);await old.close();return}
    const ctx=new AudioContext();audio.current=ctx;
    try{
      await ctx.resume();
      if(audio.current!==ctx)return;
      const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
      const samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
      const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      noise.buffer=buffer;noise.loop=true;filter.frequency.value=420;gain.gain.value=.032;
      noise.connect(filter).connect(gain).connect(ctx.destination);noise.start();setOn(true);
    }catch{if(audio.current===ctx){audio.current=null;setOn(false);void ctx.close()}}
  }
  return <button aria-pressed={on} onClick={toggle}>{on?'Desligar som ambiente':'Ligar som ambiente'}</button>
}
