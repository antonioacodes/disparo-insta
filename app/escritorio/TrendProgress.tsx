import styles from './office.module.css';
export type ResearchProgress={stage:number;percent:number;label:string;remaining:number|null;elapsed:number|null;initial:boolean};

function duration(seconds:number){
  if(seconds<60)return seconds+' s';
  return Math.floor(seconds/60)+' min '+seconds%60+' s';
}
export function TrendProgress({progress:p,compact=false}:{progress?:ResearchProgress;compact?:boolean}){
  if(!p)return null;
  const estimate=p.remaining!==null?'Cerca de '+duration(p.remaining)+' restantes':
    p.elapsed!==null?'Recalculando previsão':null;
  return <span className={styles.researchProgress}>
    {!compact&&<span>{p.label}{p.elapsed!==null&&' · ~'+p.percent+'%'}</span>}
    <progress aria-label={p.label} aria-valuetext={p.label} max={100} value={p.percent}
      style={{accentColor:['#db665e','#daa540','#66ac73','#369b62'][p.stage]}}/>
    {estimate&&<small>{estimate}{p.initial&&!compact?' · estimativa inicial':''}</small>}
    {!compact&&p.elapsed!==null&&<small>{duration(p.elapsed)} em análise</small>}
  </span>;
}
