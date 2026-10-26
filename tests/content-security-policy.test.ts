import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSecurityPolicy } from '../lib/content-security-policy';

const directives = (policy: string) => new Map(policy.split('; ').map(d => { const [name, ...values] = d.split(' '); return [name, values]; }));

test('seuls les scripts portant le nonce de la page s’exécutent, et jamais de script en ligne ajouté', () => {
  const policy = directives(contentSecurityPolicy('abc123', false));
  const scripts = policy.get('script-src')!;
  assert.ok(scripts.includes("'nonce-abc123'") && scripts.includes("'strict-dynamic'"));
  for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:']) assert.ok(!scripts.includes(unsafe), unsafe);
  assert.deepEqual(policy.get('object-src'), ["'none'"]);
  assert.deepEqual(policy.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(policy.get('base-uri'), ["'self'"]);
  assert.deepEqual(policy.get('form-action'), ["'self'"]);
});

test('Turnstile peut se charger, et eval n’est permis qu’en développement', () => {
  const production = directives(contentSecurityPolicy('n', false));
  assert.ok(production.get('frame-src')!.includes('https://challenges.cloudflare.com'));
  assert.ok(production.get('script-src')!.includes('https://challenges.cloudflare.com'));
  assert.ok(directives(contentSecurityPolicy('n', true)).get('script-src')!.includes("'unsafe-eval'"));
});
