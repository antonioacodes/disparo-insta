'use client';
import {useState,useEffect} from 'react';
import Link from 'next/link';
export default function Users(){
 const [users,list]=useState<{login:string;name:string}[]>([]),[msg,report]=useState(''),[allowed,allow]=useState(false);
 async function load(){const r=await fetch('/api/account/users');if(!r.ok){report('Acesso reservado ao administrador.');return}allow(true);list((await r.json()).users)}
 useEffect(()=>{void load()},[]);
 return <main style={{maxWidth:560,margin:'8vh auto',padding:24}}><Link href="/escritorio">Voltar ao escritório</Link><h1>Usuários</h1>{allowed&&<><form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const r=await fetch('/api/account/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});if(r.ok){form.reset();report('Usuário criado.');await load()}else report('Confira os campos e se o login está disponível.')}}><label>Nome no escritório<input required name="name" maxLength={40}/></label><label>Login<input required name="login" pattern="[a-zA-Z0-9_.@-]{3,80}"/></label><label>Senha<input required name="password" type="password" minLength={12} autoComplete="new-password"/></label><button>Criar usuário</button></form><ul>{users.map(u=><li key={u.login}>{u.name} · {u.login}</li>)}</ul></>}{msg&&<p role="status">{msg}</p>}</main>
}
