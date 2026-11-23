'use client';
import {useState,type FormEvent} from 'react';
import {DoorOpen,ArrowRight} from 'lucide-react';
import styles from './login.module.css';

export default function Login(){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function signin(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    const credentials=Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try{
      const result=await fetch('/api/account/signin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
      if(result.ok){location.replace('/escritorio');return}
      setError(result.status===503?'O Studio está indisponível. Tente novamente em instantes.':'Confira seu login e sua senha e tente novamente.');
    }catch{setError('Falha de conexão. Tente novamente.')}
    setBusy(false);
  }
  return <main className={styles.screen}><section className={styles.panel} aria-labelledby="login-title">
    <header><DoorOpen size={24} aria-hidden="true"/> Escritório virtual</header>
    <form onSubmit={signin}><h1 id="login-title">Entrar no Studio</h1>
      <label>Login<input required name="login" autoComplete="username" autoCapitalize="none" spellCheck={false}/></label>
      <label>Senha<input required name="password" type="password" autoComplete="current-password"/></label>
      {error&&<p role="alert">{error}</p>}
      <button disabled={busy}>{busy?'Entrando…':'Entrar'}<ArrowRight size={18} aria-hidden="true"/></button>
    </form>
  </section></main>
}
