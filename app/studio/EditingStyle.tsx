'use client';
import {useState} from 'react';
export const defaults={captions:'generate',facecam:'off',font:'DejaVu Sans',animation:'off'};
export function EditingStyle({value,onChange}:{value:typeof defaults;onChange:(v:typeof defaults)=>void}){
  const [expanded,expand]=useState(false);
  const choices=[
    ['captions','Legendas',[['generate','Gerar legendas'],['preserve','Preservar originais'],['auto','Detectar no vídeo']]],
    ['facecam','Facecam',[['off','Desativada'],['always','Corte inteiro'],['peaks','Picos de volume']]],
    ['animation','Animação de texto',[['off','Estática'],['fade','Entrada suave']]]
  ] as const;
  return <section className="editStyle"><h2>Estilo do projeto</h2>{choices.map(([key,label,items])=><fieldset key={key}><legend>{label}</legend><div className="choiceRow">{items.map(([id,name])=><button type="button" aria-pressed={value[key]===id} key={id} onClick={()=>onChange({...value,[key]:id})}>{name}</button>)}</div></fieldset>)}
  <fieldset><legend>Fonte das legendas</legend><div className="captionSample" style={{fontFamily:'"'+value.font+'",sans-serif'}}><small>{value.font}</small>Esse momento merece um corte.</div>
  <div className="choiceRow">{["DejaVu Sans","Montserrat","Anton","Bebas Neue","Oswald","Poppins","Roboto Condensed","Barlow Condensed","Archivo Black","DM Sans","Space Grotesk","DejaVu Serif","Liberation Mono"].slice(0,expanded?99:6).map(font=><button type="button" style={{fontFamily:'"'+font+'",sans-serif'}} aria-pressed={value.font===font} key={font} onClick={()=>onChange({...value,font})}>{font}</button>)}</div>
  <button type="button" onClick={()=>expand(!expanded)}>{expanded?'Mostrar menos':'Ver todas as fontes (13)'}</button></fieldset></section>
}