'use client';
import {Info, Scissors} from 'lucide-react';
import {useState} from 'react';
export const defaults={highlight:'#FFD700',motion:'off',clipCount:'10',format:'vertical',captions:'generate',facecam:'off',font:'DejaVu Sans',animation:'off'};
export type StyleStep='format'|'captions'|'facecam'|'motion'|'animation'|'cuts'|'font';
export function EditingStyle({value,onChange,step}:{value:typeof defaults;onChange:(v:typeof defaults)=>void;step?:StyleStep}){
  const [expanded,expand]=useState(false);
  const notes:Record<string, Record<string,string>>={
    motion:{
      off:'Mantém o ritmo original da gravação.',
      visual:'Uma aproximação breve destaca a retomada da fala depois de uma pausa.',
      sound:'Acrescenta um toque suave à aproximação. Até três destaques por corte, conforme as pausas da fala.'
    },
    format:{vertical:'Preenche o quadro vertical com o centro do vídeo. A exportação tem 1080 × 1920 pixels.',horizontal:'Preenche o quadro horizontal com o centro do vídeo. A exportação tem 1920 × 1080 pixels.'},
    captions:{
      generate:'Grava a transcrição da fala na imagem com a fonte escolhida. Use em vídeos sem legenda embutida para evitar texto sobreposto.',
      preserve:'Mantém as legendas embutidas que ficam dentro do recorte vertical.',
      auto:'Durante cada fala, procura texto na parte inferior da imagem a cada meio segundo. Acrescenta legendas nos intervalos sem texto detectado.',
      off:'Desliga as legendas geradas pelo Studio. Textos já gravados na imagem continuam fazendo parte do vídeo.'
    },
    facecam:{
      off:'Usa o enquadramento do corte sem acrescentar uma janela de câmera.',
      always:'Quando identifica uma facecam estável no vídeo de origem, mostra esse recorte no canto superior direito durante todo o clipe.',
      peaks:'Mostra a facecam detectada no canto superior direito apenas nos momentos de maior volume do áudio.'
    },
    animation:{
      off:'Cada legenda gerada aparece e desaparece de uma vez, no tempo da fala.',
      karaoke:'A palavra falada cresce e ganha a cor escolhida enquanto as outras continuam visíveis.',
      fade:'Cada legenda gerada ganha uma breve transição de opacidade na entrada e na saída. Legendas embutidas na imagem mantêm o movimento original.'
    }
  };
  const choices=[
    ['format','Formato do vídeo',[['vertical','Vertical · 9:16'],['horizontal','Horizontal · 16:9']]],
    ['captions','Legendas',[['generate','Gerar legendas'],['preserve','Preservar originais'],['auto','Detectar no vídeo'],['off','Desativado']]],
    ['facecam','Facecam',[['off','Desativada'],['always','Corte inteiro'],['peaks','Picos de volume']]],
    ['motion','Ritmo da edição',[['off','Original'],['visual','Ênfase visual'],['sound','Ênfase visual + som']]],
    ['animation','Animação de texto',[['off','Estática'],['fade','Entrada suave'],['karaoke','Karaokê']]]
  ] as const;
  return <section className="editStyle">{!step&&<h2>Estilo do projeto</h2>}{choices.filter(([key])=>(!step||step===key)&&(key!=='animation'||['generate','auto'].includes(value.captions))).map(([key,label,items])=><fieldset key={key}><legend>{label}</legend><div className="choiceRow">{items.map(([id,name])=><button type="button" aria-pressed={value[key]===id} key={id} onClick={()=>onChange({...value,[key]:id})}>{name}</button>)}</div><div className="styleNote" role="status"><Info size={17} aria-hidden="true"/><span>{notes[key][value[key]]}</span></div></fieldset>)}
  {(!step||step==='animation') && value.animation==='karaoke' && ['generate','auto'].includes(value.captions) && <fieldset>
    <legend>Cor de destaque da palavra</legend>
    <label className="studioTextInput"><input type="color" aria-label="Cor de destaque" style={{width:48,height:36}} value={value.highlight} onChange={e=>onChange({...value,highlight:e.target.value})}/>{value.highlight.toUpperCase()}</label>
    <div className="captionSample" style={{fontFamily:value.font}}><span>A palavra <strong style={{color:value.highlight,fontSize:'115%'}}>falada</strong> ganha destaque.</span></div>
  </fieldset>}
  {(!step||step==='cuts')&&<fieldset><legend>Quantidade de cortes</legend>
    <div className="choiceRow">
      <button type="button" aria-pressed={value.clipCount!=='max'} onClick={()=>onChange({...value,clipCount:value.clipCount==='max'?'10':value.clipCount})}>Escolher quantidade</button>
      <button type="button" aria-pressed={value.clipCount==='max'} onClick={()=>onChange({...value,clipCount:'max'})}>Máximo possível</button>
    </div>
    {value.clipCount!=='max' && <label className="studioField clipTarget"><span>Meta de cortes</span><span className="studioTextInput"><Scissors size={19} aria-hidden="true"/><input inputMode="numeric" type="number" min="1" step="1" value={value.clipCount} onChange={e=>onChange({...value,clipCount:e.target.value})} onBlur={()=>{if(!/^[1-9][0-9]*$/.test(value.clipCount))onChange({...value,clipCount:'10'})}}/></span></label>}
    <div className="styleNote"><Info size={17}/><span>{value.clipCount==='max'?'Seleciona todos os trechos aproveitáveis que podem virar cortes sem se sobrepor.':'O Studio tenta alcançar essa quantidade. Se houver poucos trechos completos, você receberá menos cortes.'}</span></div>
  </fieldset>}
  {(!step||step==='font')&&<fieldset><legend>Fonte das legendas</legend><div className="captionSample" style={{fontFamily:'"'+value.font+'",sans-serif'}}><small>{value.font}</small>Esse momento merece um corte.</div>
  <div className="choiceRow">{["DejaVu Sans","Montserrat","Anton","Bebas Neue","Oswald","Poppins","Roboto Condensed","Barlow Condensed","Archivo Black","DM Sans","Space Grotesk","DejaVu Serif","Liberation Mono"].slice(0,expanded?99:6).map(font=><button type="button" style={{fontFamily:'"'+font+'",sans-serif'}} aria-pressed={value.font===font} key={font} onClick={()=>onChange({...value,font})}>{font}</button>)}</div>
  <button type="button" onClick={()=>expand(!expanded)}>{expanded?'Mostrar menos':'Ver todas as fontes (13)'}</button></fieldset>}</section>
}