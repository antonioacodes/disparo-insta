'use client';
import {useState,useEffect} from 'react';
import Link from 'next/link';
export default function Users(){
 const [name,setName]=useState('');
 const [users,list]=useState<{login:string;name:string}[]>([]),[msg,report]=useState(''),[allowed,allow]=useState(false);
 async function load(){const r=await fetch('/api/account/users');if(!r.ok){report('Acesso reservado ao administrador.');return}allow(true);const account=await fetch('/api/account/session');if(account.ok)setName((await account.json()).name);list((await r.json()).users)}
 useEffect(()=>{void load()},[]);
 return <main style={{maxWidth:560,margin:'8vh auto',padding:24}}><Link href="/escritorio">Voltar ao escritório</Link><h1>Usuários</h1>{allowed&&<><h2>Meu perfil</h2><form onSubmit={async e=>{
   e.preventDefault();
   try{
     const r=await fetch('/api/account/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
     if(r.ok){await load();report('Nome atualizado no escritório.')}else report('Confira o nome e tente novamente.')
   }catch{report('Falha de conexão. Tente novamente.')}
 }}><label>Meu nome no escritório<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><button>Salvar nome</button></form><h2>Criar usuário</h2><form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const r=await fetch('/api/account/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});if(r.ok){form.reset();report('Usuário criado.');await load()}else report('Confira os campos e se o login está disponível.')}}><label>Nome no escritório<input required name="name" maxLength={40}/></label><label>Login<input required name="login" pattern="[a-zA-Z0-9_.@-]{3,80}"/></label><label>Senha<input required name="password" type="password" minLength={12} autoComplete="new-password"/></label><button>Criar usuário</button></form><ul>{users.map(u=><li key={u.login}>{u.name} · {u.login}</li>)}</ul><h2>Alterar minha senha</h2><form onSubmit={async e=>{
   e.preventDefault();
   const r=await fetch('/api/account/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});
   if(r.ok)location.assign('/entrar');else report('Confira a senha atual. A nova senha precisa ter pelo menos 12 caracteres.');
 }}><label>Senha atual<input required name="current" type="password" autoComplete="current-password"/></label><label>Nova senha<input required name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password"/></label><button>Salvar nova senha</button></form></>}{msg&&<p role="status">{msg}</p>}</main>
}
