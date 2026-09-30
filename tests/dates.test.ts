import {test} from 'node:test';import assert from 'node:assert/strict';import {fromParisInput,parisInput} from '../lib/utils';
test('les horaires sont enregistrés en heure de Paris, indépendamment du navigateur',()=>{assert.equal(fromParisInput('2026-10-02T19:30'),'2026-10-02T17:30:00.000Z');assert.equal(fromParisInput('2026-11-06T19:30'),'2026-11-06T18:30:00.000Z');assert.equal(parisInput('2026-11-06T18:30:00Z'),'2026-11-06T19:30');});
test('les heures inexistantes du passage à l’heure d’été sont refusées',()=>{assert.throws(()=>fromParisInput('2027-03-28T02:30'),/n’existe pas/);});
