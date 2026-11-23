import {type ReactNode} from 'react';
import styles from './office.module.css';

export function StatusIcon({status}:{status:string}){
  const state=({'Trabalhando':'working','Ocioso':'idle','Esperando':'waiting','Erro':'error',
    'Processador offline':'error','Sem conexão':'error'} as Record<string,string>)[status]??'unavailable';
  return <i className={styles.statusIcon} data-state={state} title={status} aria-label={status} role="img"/>;
}

export function ActionCard({title,caption,onClick}:{title:string;caption:string;onClick:()=>void}){
  return <button type="button" onClick={onClick}><strong>{title}</strong><small>{caption}</small></button>;
}

export function Department({name,person,status,onBack,children}:{name:string;person:string;status:string;onBack?:()=>void;children:ReactNode}){
  return <>
    <h2>Departamento de {name.toLowerCase()}</h2>
    <div className={styles.identity}><b>{person}</b><StatusIcon status={status}/>{status}</div>
    {onBack&&<button className={styles.returnButton} type="button" onClick={onBack}>← Departamento</button>}
    {children}
  </>;
}
