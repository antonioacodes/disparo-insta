export type Verdict={motor?:string;geral:number; dimensoes:Record<string,number>; resumo:string; sugestao:string; personas:{perfil:string;motivo:string;notas?:Record<string,number>}[]; erro?:string;retryAt?:number};
const guide='https://github.com/antonioacodes/disparo-insta/blob/feat/painel-fila-meta/docs/teste-tinytroupe.md';
export function Audience({v,status,clip,removed}:{v?:Verdict;status?:string;clip:{state:string};removed:boolean}){
  if(!v || v.erro){
    let message='Aguardando a avaliação com '+status+'.';
    if(status==='disabled') message='Avaliação desativada no processador do Studio.';
    if(status==='offline') message='O processador do Studio está offline.';
    if(!status || status==='unknown') message='O processador ainda não informou a configuração de público.';
    if(clip.state==='detected') message='A avaliação pode começar quando a prévia ficar pronta.';
    if(clip.state==='rejected'||removed) message='Esta versão está encerrada sem uma avaliação.';
    return <details className="reviewDetail"><summary>Teste de público <small>{v?.erro?'Falhou':clip.state==='rejected'||removed?'Encerrado':status==='disabled'?'Desativado':status==='offline'?'Processador offline':clip.state==='detected'?'Aguardando prévia':'Sem nota'}</small></summary>
      <p>{v?.erro||message}</p>{!!v?.retryAt&&<p>Nova tentativa a partir de {new Date(v.retryAt*1000).toLocaleTimeString('pt-BR')}.</p>}<p>Cinco perfis simulados avaliam gancho, engajamento, clareza e ritmo.</p>
      <a href={guide} target="_blank" rel="noreferrer">Como ativar e testar o TinyTroupe</a></details>;
  }
  const color=v.geral<40?'#ba3434':v.geral<75?'#ba740b':'#208456';
  return <details style={{padding:12,background:'#f7f7fb',borderRadius:12}}><summary style={{cursor:'pointer'}}>
    <span style={{display:'inline-grid',placeItems:'center',borderRadius:'50%',width:58,height:58,verticalAlign:'middle',background:`conic-gradient(${color} ${v.geral}%,#dedee6 0)`}}>
      <strong style={{display:'grid',placeItems:'center',background:'white',borderRadius:'50%',width:46,height:46}}>{v.geral}</strong>
    </span> {v.motor || "Ollama"} · Público simulado · {v.geral}/100</summary><p>{v.resumo}</p>
    {Object.entries(v.dimensoes).map(([name,n])=><p key={name}>{name} · {n}/100 <meter min={0} max={100} value={n}/></p>)}
    <p><strong>Ajuste sugerido</strong> {v.sugestao}</p>
    {v.personas.map(person=><p key={person.perfil}><strong>{person.perfil}</strong> · {person.motivo}</p>)}
  </details>;
}
