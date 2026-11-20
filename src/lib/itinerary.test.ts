import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildItinerary, totalNights, transferText } from './itinerary.ts';
import { parseTourFile } from './importExport.ts';

const parsed = parseTourFile(readFileSync('examples/sample-iberia-9d.route.json', 'utf8'));
if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
const { tour, stops } = parsed.value;
const days = buildItinerary(stops, tour);

test('더미 투어: 현지 7박 + 기내 1박 = 9일', () => {
  assert.equal(totalNights(stops), 7);
  assert.equal(days.length, 9);
  assert.equal(days[7].sleep, '기내');
  assert.equal(days[8].plan, '인천 도착');
});

test('숙박 배분: 리스본 3 · 세비야 2 · 그라나다 2', () => {
  assert.deepEqual(days.slice(0, 7).map((d) => d.sleep), ['리스본', '리스본', '리스본', '세비야', '세비야', '그라나다', '그라나다']);
});

test('자유일은 머무는 날의 끝에서부터: 3·7일차', () => {
  assert.deepEqual(days.filter((d) => d.isFree).map((d) => d.day), [3, 7]);
  assert.match(days[2].plan, /카스카이스/);
});

test('이동일과 경유지', () => {
  assert.deepEqual(days[3].transfer?.vias, ['에보라']);
  assert.deepEqual(days[5].transfer?.vias, ['코르도바']);
  assert.equal(days[7].transfer?.to, '인천');
  assert.match(transferText(days[0].transfer), /인천 → 리스본 \(항공/);
});

test('직접 고친 일정이 자동 일정보다 우선', () => {
  assert.equal(days[4].plan, '시내 둘러보기 (예시)');
  assert.equal(days[4].memo, '더미 내부 메모');
  assert.equal(days[4].edited, true);
  assert.equal(days[5].edited, false);
});

test('박수 0인 숙박지는 경유지처럼', () => {
  const d = buildItinerary([{ ...stops[0], nights: 0 }, stops[2]], tour);
  assert.deepEqual(d[0].transfer?.vias, ['리스본']);
});
