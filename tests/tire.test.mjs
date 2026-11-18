import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTireSize, tireDimensions, compareTires, suggestPlusSizes, formatTireSize } from '../tire.js';
import { messages, LANGS } from '../i18n.js';

const near = (a, b, eps = 0.1) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('parse metric variants', () => {
  for (const s of ['205/55R16', '205/55 R16', '205/55-16', '205 55 16', '205/55 r16', '205/55R16 91V']) {
    assert.deepEqual(parseTireSize(s), { type: 'metric', prefix: '', width: 205, aspect: 55, rim: 16 }, s);
  }
  assert.equal(parseTireSize('LT265/70R17').prefix, 'LT');
  assert.equal(parseTireSize('225/45ZR17').rim, 17);
});

test('parse flotation', () => {
  const p = parseTireSize('31x10.50R15');
  assert.deepEqual(p, { type: 'flotation', prefix: '', diameterIn: 31, widthIn: 10.5, rim: 15 });
  assert.equal(parseTireSize('33X12,5 R20').widthIn, 12.5);
});

test('parse rejects garbage', () => {
  for (const s of ['', 'abc', '205/55', '20/55R16', '205/5R16', '205/55R99', null, undefined, 42]) {
    assert.equal(parseTireSize(s), null, String(s));
  }
});

test('known diameters', () => {
  // 16*25.4 + 2*205*0.55 = 406.4 + 225.5 = 631.9
  near(tireDimensions('205/55R16').diameterMm, 631.9);
  near(tireDimensions('225/45R17').diameterMm, 634.3);
  near(tireDimensions('31x10.50R15').diameterMm, 787.4);
  near(tireDimensions('195/65R15').diameterMm, 634.5);
});

test('dimensions fields', () => {
  const d = tireDimensions('205/55R16');
  near(d.sidewallMm, 112.8);
  near(d.rimMm, 406.4);
  near(d.circumferenceMm, Math.PI * 631.9, 0.2);
  near(d.revsPerKm, 1e6 / (Math.PI * 631.9), 0.2);
  near(d.revsPerMile, d.revsPerKm * 1.609344, 0.3);
  near(d.diameterIn, 24.88, 0.01);
  assert.equal(tireDimensions('nope'), null);
});

test('flotation sidewall derived from diameter', () => {
  const d = tireDimensions('31x10.50R15');
  near(d.sidewallMm, (787.4 - 381) / 2);
});

test('compare: identical sizes', () => {
  const c = compareTires('205/55R16', '205/55R16');
  assert.equal(c.diameterDiffMm, 0);
  assert.equal(c.exceedsTolerance, false);
  assert.equal(c.speedometerReads, 'accurate');
});

test('compare: bigger tire -> speedo reads low, actual higher', () => {
  const c = compareTires('205/55R16', '225/55R16');
  // 225/55R16 = 406.4 + 247.5 = 653.9 ; +22 mm ; +3.48%
  near(c.diameterDiffMm, 22, 0.05);
  near(c.diameterDiffPct, 3.48, 0.01);
  assert.equal(c.exceedsTolerance, true);
  assert.equal(c.speedometerReads, 'low');
  const row = c.speedometer.find((r) => r.indicated === 100);
  near(row.actual, 103.5, 0.1);
});

test('compare: smaller tire -> speedo reads high; mph units', () => {
  const c = compareTires('225/45R17', '205/55R16', { unit: 'mph' });
  assert.equal(c.unit, 'mph');
  assert.equal(c.speedometerReads, 'high');
  assert.ok(c.speedometer[0].indicated === 20);
  assert.ok(c.speedometer.every((r) => r.actual < r.indicated));
  assert.equal(c.exceedsTolerance, false);
});

test('compare: custom tolerance and invalid input', () => {
  assert.equal(compareTires('205/55R16', '225/55R16', { tolerancePct: 5 }).exceedsTolerance, false);
  assert.equal(compareTires('bad', '205/55R16'), null);
});

test('plus sizes stay within tolerance and change rim', () => {
  const list = suggestPlusSizes('205/55R16');
  assert.ok(list.length > 0);
  for (const s of list) {
    assert.ok(Math.abs(s.diffPct) <= 3, s.size);
    assert.ok(s.rim === 15 || s.rim === 17, s.size);
    const d = tireDimensions(s.size);
    near(d.diameterMm, s.diameterMm, 0.1);
  }
  assert.ok(list.some((s) => s.size === '225/45 R17'), '225/45 R17 expected');
  assert.ok(list.some((s) => s.rim === 15));
  assert.deepEqual(suggestPlusSizes('junk'), []);
});

test('plus sizes: tighter tolerance gives subset', () => {
  const wide = suggestPlusSizes('225/45R17', { tolerancePct: 3 });
  const tight = suggestPlusSizes('225/45R17', { tolerancePct: 0.5 });
  assert.ok(tight.length <= wide.length);
  assert.ok(tight.every((s) => Math.abs(s.diffPct) <= 0.5));
});

test('formatTireSize round trip', () => {
  assert.equal(formatTireSize(parseTireSize('205/55-16')), '205/55 R16');
  assert.equal(formatTireSize(parseTireSize('31x10.5r15')), '31x10.50R15');
});

test('i18n: all languages have all English keys', () => {
  const keys = Object.keys(messages.en);
  for (const l of LANGS) {
    for (const k of keys) assert.ok(messages[l.code]?.[k], `${l.code} missing ${k}`);
  }
});
