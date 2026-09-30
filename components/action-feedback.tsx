'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/types';
export function useAction() {
  const [result,setResult]=useState<ActionResult|null>(null); const [pending,startTransition]=useTransition(); const router=useRouter();
  function run(action:()=>Promise<ActionResult>, after?:(result:ActionResult)=>void) {
    setResult(null); startTransition(async()=>{try{const r=await action();setResult(r);if(r.ok){router.refresh();after?.(r);}}catch{setResult({ok:false,message:'La connexion a été interrompue. Réessaie.'});}});
  }
  return {result,pending,run,setResult};
}
export function Feedback({ result }: { result: ActionResult|null }) { return result ? <p className={`alert ${result.ok?'':'error'}`} role={result.ok?'status':'alert'}>{result.message}</p> : null; }
