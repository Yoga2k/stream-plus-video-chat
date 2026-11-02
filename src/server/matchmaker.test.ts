import test from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from './matchmaker';

test('Matchmaker pairs two waiting users and assigns caller and callee roles', () => {
  const mm = new Matchmaker();
  mm.registerUser('u1', { name: 'Alice', countryCode: 'US' });
  mm.registerUser('u2', { name: 'Bob', countryCode: 'GB' });

  const r1 = mm.joinQueue('u1');
  assert.equal(r1.matched, false);

  const r2 = mm.joinQueue('u2');
  assert.equal(r2.matched, true);
  assert.equal(r2.caller?.id, 'u1');
  assert.equal(r2.callee?.id, 'u2');
  assert.equal(mm.getStats().activeRooms, 1);
});

test('Matchmaker prioritizes matching country preferences and avoids immediate repeat partner when possible', () => {
  const mm = new Matchmaker();
  mm.registerUser('u1', { name: 'Alice', countryCode: 'US' });
  mm.registerUser('u2', { name: 'Kenji', countryCode: 'JP' });
  mm.registerUser('u3', { name: 'Elena', countryCode: 'ES' });

  mm.joinQueue('u1', { preferredCountry: 'ALL' });
  mm.joinQueue('u2', { preferredCountry: 'ALL' });
  // u1 and u2 are now paired. Let's have u3 wait in queue, and u1 skip u2:
  mm.joinQueue('u3', { preferredCountry: 'ALL' });

  // u1 skips u2 and joins queue again -> should match with u3 (not u2)
  const skipResult = mm.joinQueue('u1');
  assert.equal(skipResult.matched, true);
  assert.equal(skipResult.caller?.id, 'u3');
  assert.equal(skipResult.callee?.id, 'u1');
});

test('Matchmaker enforces temporary ban after 3 unique reports', () => {
  const mm = new Matchmaker();
  mm.registerUser('bad_actor');
  mm.registerUser('r1');
  mm.registerUser('r2');
  mm.registerUser('r3');

  mm.joinQueue('bad_actor');
  mm.joinQueue('r1');
  assert.equal(mm.reportPartner('r1').banned, false);

  mm.joinQueue('bad_actor');
  mm.joinQueue('r2');
  assert.equal(mm.reportPartner('r2').banned, false);

  mm.joinQueue('bad_actor');
  mm.joinQueue('r3');
  assert.equal(mm.reportPartner('r3').banned, true);

  // Now bad_actor tries to join queue while banned
  const attempt = mm.joinQueue('bad_actor');
  assert.equal(attempt.matched, false);
  assert.ok(attempt.error?.includes('temporarily suspended'));
});
