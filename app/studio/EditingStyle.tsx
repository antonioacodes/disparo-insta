'use client';
import {Info} from 'lucide-react';
import {useState} from 'react';
export const defaults={captions:'generate',facecam:'off',font:'DejaVu Sans',animation:'off'};
export function EditingStyle({value,onChange}:{value:typeof defaults;onChange:(v:typeof defaults)=>void}){
  const [expanded,expand]=useState(false);
  const notes:Record<string, Record<string,string>>={
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
      fade:'Cada legenda gerada ganha uma breve transição de opacidade na entrada e na saída. Legendas embutidas na imagem mantêm o movimento original.'
    }
  };
  const choices=[
    ['captions','Legendas',[['generate','Gerar legendas'],['preserve','Preservar originais'],['auto','Detectar no vídeo'],['off','Desativado']]],
    ['facecam','Facecam',[['off','Desativada'],['always','Corte inteiro'],['peaks','Picos de volume']]],
    ['animation','Animação de texto',[['off','Estática'],['fade','Entrada suave']]]
  ] as const;
  return <section className="editStyle"><h2>Estilo do projeto</h2>{choices.map(([key,label,items])=><fieldset key={key}><legend>{label}</legend><div className="choiceRow">{items.map(([id,name])=><button type="button" aria-pressed={value[key]===id} key={id} onClick={()=>onChange({...value,[key]:id})}>{name}</button>)}</div><div className="styleNote" role="status"><Info size={17} aria-hidden="true"/><span>{notes[key][value[key]]}</span></div></fieldset>)}
  <fieldset><legend>Fonte das legendas</legend><div className="captionSample" style={{fontFamily:'"'+value.font+'",sans-serif'}}><small>{value.font}</small>Esse momento merece um corte.</div>
  <div className="choiceRow">{["DejaVu Sans","Montserrat","Anton","Bebas Neue","Oswald","Poppins","Roboto Condensed","Barlow Condensed","Archivo Black","DM Sans","Space Grotesk","DejaVu Serif","Liberation Mono"].slice(0,expanded?99:6).map(font=><button type="button" style={{fontFamily:'"'+font+'",sans-serif'}} aria-pressed={value.font===font} key={font} onClick={()=>onChange({...value,font})}>{font}</button>)}</div>
  <button type="button" onClick={()=>expand(!expanded)}>{expanded?'Mostrar menos':'Ver todas as fontes (13)'}</button></fieldset></section>
}