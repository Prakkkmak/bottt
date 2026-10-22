'use client';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/types';
import { useActivity } from './activity';
export function useAction() {
  const [result,setResult]=useState<ActionResult|null>(null); const [pending,startTransition]=useTransition();
  useActivity(pending);
  // A successful action revalidates the layout on the server: its response already carries the refreshed page, so no second request is needed.
  // The answer is set inside the transition too, so it lands with that page: no message next to a list that has not changed yet.
  function run(action:()=>Promise<ActionResult>, after?:(result:ActionResult)=>void) {
    setResult(null); startTransition(async()=>{try{const r=await action();startTransition(()=>{setResult(r);if(r.ok)after?.(r);});}catch{setResult({ok:false,message:'La connexion a été interrompue. Réessaie.'});}});
  }
  return {result,pending,run,setResult};
}
export function Feedback({ result }: { result: ActionResult|null }) { return result ? <p className={`alert ${result.ok?'':'error'}`} role={result.ok?'status':'alert'}>{result.message}</p> : null; }
