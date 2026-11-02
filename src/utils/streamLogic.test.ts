import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTRIES,
  STRANGER_PROFILES,
  filterCountries,
  pickStranger,
  getStrangerReply,
  validateChatMessage,
} from './streamLogic';

test('filterCountries returns all countries when search term is empty', () => {
  const result = filterCountries(COUNTRIES, '');
  assert.equal(result.length, COUNTRIES.length);
});

test('filterCountries filters correctly by name and code', () => {
  const spain = filterCountries(COUNTRIES, 'spain');
  assert.equal(spain.length, 1);
  assert.equal(spain[0].code, 'ES');

  const jp = filterCountries(COUNTRIES, 'jp');
  assert.equal(jp.length, 1);
  assert.equal(jp[0].name, 'Japan');
});

test('pickStranger selects stranger matching requested country', () => {
  const stranger = pickStranger('ES');
  assert.equal(stranger.country, 'Spain');
});

test('pickStranger falls back safely when country has no specific profile', () => {
  const stranger = pickStranger('TR');
  assert.ok(stranger);
  assert.ok(stranger.name);
});

test('getStrangerReply matches keywords and responds with contextual reply', () => {
  const stranger = STRANGER_PROFILES[0]; // Elena from Spain
  const reply = getStrangerReply(stranger, 'where are you from?');
  assert.ok(reply.includes('Barcelona'));

  const fallback = getStrangerReply(stranger, 'asdfghjkl random statement');
  assert.ok(fallback.length > 0);
});

test('validateChatMessage accepts normal text and rejects empty or oversized strings', () => {
  assert.equal(validateChatMessage('  Hello world!  ').valid, true);
  assert.equal(validateChatMessage('  Hello world!  ').cleaned, 'Hello world!');
  assert.equal(validateChatMessage('   ').valid, false);
  assert.equal(validateChatMessage('a'.repeat(501)).valid, false);
});
