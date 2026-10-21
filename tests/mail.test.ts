import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invitationMail } from '../lib/mail';

test('e-mail d’invitation', () => {
  const link = 'https://bottt.fr/invite/' + 'a'.repeat(64);
  const mail = invitationMail('Léa', link);
  assert.equal(mail.subject, 'Léa t’invite à rejoindre Blood on the Tanguy Tower');
  assert.ok(mail.text.split('\n\n').includes(link), 'the link stands on its own line');
  assert.match(mail.text, /valable 7 jours/);
  assert.match(mail.text, /indiquée par Léa/);
  // First contact with the invited person: who is responsible, how to object, where the policy is.
  assert.match(mail.text, /bonjour@bottt\.fr/);
  assert.match(mail.text, /https:\/\/bottt\.fr\/confidentialite/);
  // A pseudo cannot break the subject line, and an empty one still reads as a sentence.
  assert.equal(invitationMail('  Léa\r\nBcc: x@y.z ', link).subject, 'Léa Bcc: x@y.z t’invite à rejoindre Blood on the Tanguy Tower');
  assert.equal(invitationMail('', link).subject, 'Un membre t’invite à rejoindre Blood on the Tanguy Tower');
});
