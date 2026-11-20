import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTourFile, parseTourFile } from './importExport.ts';
import type { Tour } from './types.ts';

test('예시 루트 파일은 매출 정보 없이 읽힘', () => {
  const r = parseTourFile(readFileSync('examples/sample-iberia-9d.route.json', 'utf8'));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.hasFinance, false);
  assert.equal(r.value.tour.status, 'draft');
  assert.equal(r.value.stops.length, 5);
});

test('잘못된 파일은 이유를 알려 줌', () => {
  const r = parseTourFile('{"format":"x","tour":{},"stops":[]}');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.length >= 3);
  assert.equal(parseTourFile('not json').ok, false);
});

test('없는 통화의 비용은 거부', () => {
  const r = parseTourFile(JSON.stringify({
    format: 'wannago-tour/v1', tour: { name: 'x' }, stops: [{ name: 'a', nights: 1 }],
    finance: { costs: [{ label: 'c', kind: 'fixed', currency: 'CZK', amount: 1 }] },
  }));
  assert.equal(r.ok, false);
});

test('내보내기 → 가져오기 왕복 (매출 제외)', () => {
  const r = parseTourFile(readFileSync('examples/sample-iberia-9d.route.json', 'utf8'));
  if (!r.ok) throw new Error();
  const tour = { ...r.value.tour, id: 't', created_by: 'u' } as Tour;
  const file = buildTourFile(tour, r.value.stops);
  assert.equal(file.finance, undefined);
  const again = parseTourFile(JSON.stringify(file));
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.deepEqual(again.value.stops, r.value.stops);
  assert.deepEqual(again.value.tour.itinerary, r.value.tour.itinerary);
});
