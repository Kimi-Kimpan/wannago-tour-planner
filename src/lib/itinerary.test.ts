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
  assert.equal(days[2].plan, ''); // 자유일 문구는 자동으로 만들지 않음
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

// ── 일정표에서 하루 단위로 고치기 ──
import { addDay, deleteDay, moveDay, normalizeItinerary, setFreeDay, rekeyAfterStopEdit, itineraryByDayNumber } from './itinerary.ts';

const t0 = { ...tour, itinerary: normalizeItinerary(stops, tour) };
const nightsOf = (ss: typeof stops) => ss.filter((s) => s.kind === 'stay').map((s) => `${s.name}${s.nights}`).join(' ');

test('예전 형식(일차 번호)을 도시 키로 바꿔도 일정표는 같음', () => {
  assert.ok(Object.keys(t0.itinerary).every((k) => !/^\d+$/.test(k)));
  assert.deepEqual(buildItinerary(stops, t0).map((d) => d.plan), days.map((d) => d.plan));
});

test('일정 추가: 세비야에 하루 → 세비야 3박, 총 10일, 오버뷰 박수도 8박', () => {
  const r = addDay(stops, t0, 2)!;
  assert.equal(nightsOf(r.stops), '리스본3 세비야3 그라나다2');
  assert.equal(totalNights(r.stops), 8);
  assert.equal(buildItinerary(r.stops, { ...t0, itinerary: r.itinerary }).length, 10);
});

test('삭제: 리스본 둘째 날을 빼면 리스본 2박, 직접 쓴 3일차 이후 내용은 따라감', () => {
  const r = deleteDay(stops, t0, 1)!;
  assert.equal(nightsOf(r.stops), '리스본2 세비야2 그라나다2');
  const d = buildItinerary(r.stops, { ...t0, itinerary: r.itinerary });
  assert.equal(d[1].isFree, true); // 원래 3일차 자유일이 2일차로
  assert.equal(d[3].memo, '더미 내부 메모'); // 원래 5일차 메모가 4일차로
});

test('도착일을 아래로 옮기면 이동이 하루 늦어짐: 리스본 4박, 세비야 1박', () => {
  const r = moveDay(stops, t0, 3, 1)!; // 4일차(세비야 도착)를 5일차로
  assert.equal(nightsOf(r.stops), '리스본4 세비야1 그라나다2');
  const d = buildItinerary(r.stops, { ...t0, itinerary: r.itinerary });
  assert.equal(d[4].transfer?.to, '세비야');
  assert.equal(d.length, 9); // 총 일수는 그대로
});

test('같은 도시 안에서 위로 옮기면 내용·자유일 자리만 바뀜', () => {
  const r = moveDay(stops, t0, 2, -1)!; // 3일차(자유일)를 2일차로
  assert.equal(nightsOf(r.stops), '리스본3 세비야2 그라나다2');
  const d = buildItinerary(r.stops, { ...t0, itinerary: r.itinerary });
  assert.deepEqual([d[1].isFree, d[2].isFree], [true, false]);
  assert.equal(d[2].plan, '시내 둘러보기 (예시)');
});

test('막힌 이동: 첫날 위로, 도착일끼리 맞바꾸기', () => {
  assert.equal(moveDay(stops, t0, 0, -1), null);
  assert.equal(moveDay(stops, t0, 1, -1), null); // 둘째 날이 첫날이 될 수 없음
  const r = deleteDay(stops, t0, 4)!; // 세비야 1박으로 → 4일차 세비야 도착, 5일차 그라나다 도착
  assert.equal(moveDay(r.stops, { ...t0, itinerary: r.itinerary }, 4, -1), null); // 도시 순서는 도시 목록에서
});

test('마지막 하루를 빼면 그 도시는 경유지가 됨', () => {
  let r = deleteDay(stops, t0, 5)!; // 그라나다 도착일 (2박 → 1박)
  r = deleteDay(r.stops, { ...t0, itinerary: r.itinerary }, 5)!; // 남은 하루
  assert.equal(nightsOf(r.stops), '리스본3 세비야2');
  assert.equal(r.stops.find((s) => s.name === '그라나다')?.kind, 'via');
});

test('자유일 켜고 끄기 → 도시의 자유일 수에 반영', () => {
  const r = setFreeDay(stops, t0, 4, true)!; // 세비야 둘째 날
  assert.equal(r.stops.find((s) => s.name === '세비야')?.free_days, 1);
});

test('도시 이름을 바꿔도 직접 쓴 내용이 따라감', () => {
  const renamed = stops.map((s) => (s.name === '세비야' ? { ...s, name: '세비야(스페인)' } : s));
  const it = rekeyAfterStopEdit(stops, renamed, t0.itinerary);
  const d = buildItinerary(renamed, { ...t0, itinerary: it });
  assert.equal(d[4].memo, '더미 내부 메모');
});

test('내보내기용 일차 번호 변환', () => {
  const rows = itineraryByDayNumber(stops, t0);
  assert.ok(rows.find((r) => r.day === 5 && r.memo === '더미 내부 메모'));
});
