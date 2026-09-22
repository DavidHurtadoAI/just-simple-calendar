import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dateRange, dayKey, layoutWeek, localDate, monthDays, parseDay, startOfWeek, weekWindow } from '../calendar.ts';

test('continuous week windows preserve dates across leap days, DST and year boundaries', () => {
  for (const date of [localDate(2024, 1, 29), localDate(2026, 2, 29), localDate(2026, 9, 25), localDate(2026, 11, 31)]) {
    for (const weekStart of [0, 1]) {
      const first = startOfWeek(date, weekStart);
      const days = weekWindow(first, 40);
      assert.equal(first.getDay(), weekStart);
      assert.equal(days.length, 280);
      assert.equal(new Set(days.map(dayKey)).size, 280);
      assert.ok(days.slice(0, 7).some(d => dayKey(d) === dayKey(date)));
      assert.deepEqual(weekWindow(addDays(first, 84), 40).slice(0, 196).map(dayKey), days.slice(84).map(dayKey));
      assert.equal(dayKey(addDays(addDays(first, -84), 84)), dayKey(first));
    }
  }
});

test('multi-day notes become one bar per week, with continuation markers', () => {
  const keys=['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27'];
  const spans=[{start:'2026-09-23',end:'2026-09-30'}];
  assert.deepEqual(layoutWeek(spans, keys), [{index:0,column:2,length:5,lane:0,continuesBefore:false,continuesAfter:true}]);
  const next=monthDays(2026,8,1).slice(-7).map(dayKey);
  assert.deepEqual(layoutWeek(spans,next), [{index:0,column:0,length:3,lane:0,continuesBefore:true,continuesAfter:false}]);
});
test('overlapping bars never share occupied columns and non-overlaps reuse lanes', () => {
  const keys=monthDays(2026,8,1).slice(21,28).map(dayKey);
  const spans=[{start:keys[0],end:keys[2]},{start:keys[1],end:keys[4]},{start:keys[3],end:keys[5]},{start:'1900-01-01',end:'9999-12-31'}];
  const bars=layoutWeek(spans,keys);
  assert.equal(bars[0].lane,bars[2].lane);
  assert.notEqual(bars[0].lane,bars[1].lane);
  for (let a=0;a<bars.length;a++) for(let b=a+1;b<bars.length;b++) {
    if(bars[a].lane===bars[b].lane) assert.ok(bars[a].column+bars[a].length<=bars[b].column || bars[b].column+bars[b].length<=bars[a].column);
  }
  assert.equal(bars[3].length,7);
  assert.equal(bars[3].continuesBefore,true);
  assert.equal(bars[3].continuesAfter,true);
});

test('optional end dates and inclusive ranges', () => {
  assert.deepEqual(dateRange('2026-09-21', null), {start:'2026-09-21', end:'2026-09-21', invalidEnd:false});
  assert.deepEqual(dateRange('2026-09-21', ''), dateRange('2026-09-21', null));
  const range = dateRange('2026-09-21', '2026-09-23');
  assert.deepEqual(monthDays(2026, 8, 1).map(dayKey).filter(d => d >= range.start && d <= range.end), ['2026-09-21','2026-09-22','2026-09-23']);
  assert.equal(dateRange('2026-09-21', '2026-09-21').invalidEnd, false);
});
test('invalid or reversed end falls back to start, invalid start is excluded', () => {
  for (const end of ['bad', '2026-02-30', '2026-09-20']) {
    assert.deepEqual(dateRange('2026-09-21', end), {start:'2026-09-21',end:'2026-09-21',invalidEnd:true});
  }
  assert.equal(dateRange('bad', '2026-09-23'), null);
});
test('ranges cross months, years and leap days; huge intervals are clipped to visible weeks', () => {
  for (const [start,end,year,month,expected] of [
    ['2026-09-30','2026-10-02',2026,9,['2026-09-30','2026-10-01','2026-10-02']],
    ['2026-12-31','2027-01-02',2027,0,['2026-12-31','2027-01-01','2027-01-02']],
    ['2024-02-28','2024-03-01',2024,1,['2024-02-28','2024-02-29','2024-03-01']],
  ]) {
    const range=dateRange(start,end);
    assert.deepEqual(monthDays(year,month,1).map(dayKey).filter(d=>d>=range.start&&d<=range.end),expected);
  }
  const range=dateRange('1900-01-01','9999-12-31');
  assert.equal(monthDays(2026,8,1).map(dayKey).filter(d=>d>=range.start&&d<=range.end).length,35);
});

test('date-only and ISO datetime retain their written day, including offsets', () => {
  for (const input of ['2026-09-21', '2026-09-21T00:30:00+14:00', '2026-09-21T23:30:00-12:00']) {
    assert.equal(parseDay(input), '2026-09-21');
  }
  assert.equal(dayKey(localDate(2026, 8, 21)), '2026-09-21');
});
test('leap years and malformed dates are validated', () => {
  assert.equal(parseDay('2024-02-29'), '2024-02-29');
  for (const input of ['2025-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-09-00', 'tomorrow', '', '2026-09-21 garbage', '2026-09-21T99:99', '2026-09-21T09:00:99']) {
    assert.equal(parseDay(input), null, input);
  }
});
test('month grid includes every day once and whole weeks for both week starts', () => {
  for (let month = 0; month < 12; month++) {
    for (const start of [0, 1]) {
      const days = monthDays(2026, month, start);
      assert.equal(days.length % 7, 0);
      assert.equal(days[0].getDay(), start);
      assert.equal(new Set(days.map(dayKey)).size, days.length);
      assert.equal(days.filter(d => d.getMonth() === month).length, localDate(2026, month + 1, 0).getDate());
    }
  }
});
test('year boundaries, leap February and DST months render correctly', () => {
  assert.equal(dayKey(localDate(2026, 12, 1)), '2027-01-01');
  assert.equal(dayKey(localDate(2026, -1, 1)), '2025-12-01');
  assert.equal(monthDays(2024, 1, 1).filter(d => d.getMonth() === 1).length, 29);
  assert.equal(monthDays(2026, 2, 1).filter(d => d.getMonth() === 2).length, 31);
  assert.equal(monthDays(2026, 9, 1).filter(d => d.getMonth() === 9).length, 31);
});
