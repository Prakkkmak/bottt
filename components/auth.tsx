'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { Mail, ShieldCheck, Clock3, LogIn } from 'lucide-react';
import { Dialog } from './dialog';
import { useAction, Feedback } from './action-feedback';
import { sendCode, verifyCode } from '@/app/actions';
type TurnstileApi={render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void;reset:(id:string)=>void};
declare global { interface Window { turnstile?: TurnstileApi; } }
function Captcha({ onToken }: { onToken:(token:string)=>void }) {
  const host=useRef<HTMLDivElement>(null); const [ready,setReady]=useState(false);
  const key=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(()=>{if(!key||!host.current||!window.turnstile)return; const id=window.turnstile.render(host.current,{sitekey:key,theme:'light',callback:onToken,'expired-callback':()=>onToken(''),'error-callback':()=>onToken('')}); return()=>window.turnstile?.remove(id);},[key,ready,onToken]);
  if(!key)return null;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={()=>setReady(true)}/><div ref={host}/></>;
}
export function SignInButton({ label='Se connecter', className='button primary', configured=true }: {label?:string;className?:string;configured?:boolean}) {
  const [open,setOpen]=useState(false);
  return <><button className={className} onClick={()=>setOpen(true)}><LogIn size={16}/>{label}</button><Dialog open={open} onClose={()=>setOpen(false)} title="Blood on Breizh"><AuthForm configured={configured} onSuccess={()=>setOpen(false)}/></Dialog></>;
}
export function AuthForm({ configured=true,onSuccess }: {configured?:boolean;onSuccess?:()=>void}) {
  const [step,setStep]=useState<'email'|'code'>('email'); const [email,setEmail]=useState(''); const [name,setName]=useState(''); const [code,setCode]=useState(''); const [captcha,setCaptcha]=useState(''); const [sentAt,setSentAt]=useState(0); const [cooldown,setCooldown]=useState(0);const a=useAction();
  const local=process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http://127.0.0.1:');
  useEffect(()=>{if(!sentAt)return; const tick=()=>setCooldown(Math.max(0,60-Math.floor((Date.now()-sentAt)/1000)));tick();const interval=setInterval(tick,1000);return()=>clearInterval(interval);},[sentAt]);
  if(!configured)return <div className="stack"><p>Blood on Breizh se prépare. La connexion sera disponible dès que les services locaux seront démarrés.</p></div>;
  return <div className="stack auth-form"><span className="auth-emblem"><Clock3 size={32}/></span><p className="muted">{step==='email'?'Un code par e-mail pour entrer, puis tu restes connecté·e sur cet appareil pendant 30 jours.':`Saisis les 6 chiffres envoyés à ${email}.`}</p>
    {step==='email'?<form className="stack" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);a.run(()=>sendCode({email,name:name||'Nouveau joueur',captcha,website:String(form.get('website')||'')}),()=>{setStep('code');setSentAt(Date.now());});}}>
      <label className="field">Ton adresse e-mail<input type="email" autoComplete="email" required maxLength={254} placeholder="toi@exemple.fr" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="field">Ton prénom ou pseudo <span className="field-note">Pour ta première visite</span><input autoComplete="nickname" maxLength={40} placeholder="Comment t’appelle-t-on ?" value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="honey" aria-hidden="true">Site web<input name="website" tabIndex={-1} autoComplete="off"/></label>
      <Captcha onToken={setCaptcha}/><button className="button primary full" disabled={a.pending}><Mail size={17}/>{a.pending?'Envoi en cours…':'Recevoir mon code'}</button>
    </form>:<form className="stack" onSubmit={e=>{e.preventDefault();a.run(()=>verifyCode({email,code}),()=>onSuccess?.());}}><label className="field">Ton code de connexion<input className="otp-input" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} required autoFocus placeholder="000000" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><button className="button primary full" disabled={a.pending}>{a.pending?'Vérification…':'Rejoindre le cercle'}</button><button type="button" className="button ghost" disabled={cooldown>0||a.pending} onClick={()=>{setStep('email');setCode('');setCaptcha('');a.setResult(null);}}>{cooldown>0?`Nouveau code possible dans ${cooldown} s`:'Changer d’adresse ou renvoyer un code'}</button></form>}
    <Feedback result={a.result}/><p className="security-note"><ShieldCheck size={15}/>Ton e-mail reste privé. Aucun mot de passe à retenir.</p>
    {local&&<div className="local-hint">Test local : les codes sont dans <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">la boîte mail locale</a>. Compte organisateur : <strong>camille@cercle.test</strong>.</div>}
  </div>;
}
