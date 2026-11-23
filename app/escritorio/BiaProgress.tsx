import type {ScriptProgress} from './useOffice';

function duration(seconds:number){
  return seconds<60?Math.max(1,seconds)+' s':Math.ceil(seconds/60)+' min';
}

export function BiaProgress({task,compact=false}:{task:ScriptProgress;compact?:boolean}){
  const percent=Math.floor(100*task.done/task.total);
  const working=task.status==='Trabalhando';
  const eta=task.remaining!==null?'Roteiro · ≈ '+duration(task.remaining):
    task.stageRemaining!==null?'Etapa · ≈ '+duration(task.stageRemaining):
    'Tempo restante em cálculo';
  return <span style={{display:'grid',gap:3}}>
    {!compact&&<strong>{task.title}</strong>}
    <small>{working?task.label:task.status+' · '+task.label}</small>
    <progress aria-label="Etapas concluídas do roteiro" value={task.done} max={task.total}
      style={{width:'100%',accentColor:percent<35?'#e46b62':percent<75?'#dbab3e':'#4bb77b'}}/>
    <small>{percent}%{!compact&&' · '+task.done+' de '+task.total+' etapas concluídas'}</small>
    {working&&<small>{eta}</small>}
    {!compact&&working&&task.elapsed!==null&&<small>Etapa em execução há {task.elapsed} s</small>}
  </span>;
}
