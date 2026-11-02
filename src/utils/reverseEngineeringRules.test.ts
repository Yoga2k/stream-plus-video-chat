import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSpeed,
  simulateSpeed,
  calculateTotpWindow,
  verifyCtfFlagCharacter,
  queryMcpTools,
  DINO_SPEED_RULE,
} from './reverseEngineeringRules';

test('dino speed starts at 6.0 and accelerates by 0.001', () => {
  const next = advanceSpeed(6.0);
  assert.equal(next, 6.001);
});

test('dino speed caps at threshold 13.0', () => {
  assert.equal(advanceSpeed(13.0), 13.0);
  assert.equal(advanceSpeed(13.5), 13.5);
});

test('simulateSpeed computes cumulative speed correctly', () => {
  const speedAfter1000 = simulateSpeed(1000);
  assert.equal(speedAfter1000, 7.0);
});

test('calculateTotpWindow correctly segments seconds into 30s blocks', () => {
  const t0 = calculateTotpWindow(0);
  assert.equal(t0.block, 0);
  assert.equal(t0.start, 0);
  assert.equal(t0.end, 29);
  assert.equal(t0.remaining, 30);

  const t59 = calculateTotpWindow(59);
  assert.equal(t59.block, 1);
  assert.equal(t59.start, 30);
  assert.equal(t59.end, 59);
  assert.equal(t59.remaining, 1);
});

test('verifyCtfFlagCharacter matches expected character code', () => {
  const sampleFlag = 'DUCTF{m4sk3d_squ4r3s_7est}';
  // Char at index 21 is '7' (char code 55)
  assert.equal(sampleFlag.charAt(21), '7');
  assert.equal(verifyCtfFlagCharacter(sampleFlag, 21, 55), true);
  assert.equal(verifyCtfFlagCharacter(sampleFlag, 21, 56), false);
  assert.equal(verifyCtfFlagCharacter(sampleFlag, 100, 55), false);
});

test('queryMcpTools filters by keyword and category', () => {
  const allTools = queryMcpTools('');
  assert.equal(allTools.length, 6);

  const binaryTools = queryMcpTools('', 'binary');
  assert.equal(binaryTools.length, 1);
  assert.equal(binaryTools[0].name, 'read_file_bytes');

  const decompileMatches = queryMcpTools('ghidra');
  assert.equal(decompileMatches.length, 1);
  assert.equal(decompileMatches[0].name, 'decompile_function');
});
