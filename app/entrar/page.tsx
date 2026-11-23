'use client';
import {useState} from 'react';
export default function Login(){
 const [error,setError]=useState('');
 return <main style={{maxWidth:400,margin:'12vh auto',padding:24}}><h1>Entrar no Studio</h1><form onSubmit={async e=>{
   e.preventDefault();try{const result=await fetch('/api/account/signin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});
   if(result.ok)location.assign('/escritorio');else setError('Confira seu login e sua senha ou tente novamente mais tarde.')}catch{setError('Falha de conexão.')}
 }}><label>Login<input required name="login" autoComplete="username"/></label><label>Senha<input required name="password" type="password" autoComplete="current-password"/></label><button>Entrar</button>{error&&<p role="alert">{error}</p>}</form></main>
}
