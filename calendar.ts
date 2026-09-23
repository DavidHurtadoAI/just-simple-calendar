/** Calendar dates stay local: a YYYY-MM-DD must never shift through UTC. */
export function localDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function dayKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** ISO date strings and datetimes use their written calendar day. */
export function parseDay(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$)/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = localDate(Number(y), Number(m) - 1, Number(d));
  const key = `${y}-${m}-${d}`;
  return dayKey(date) === key ? key : null;
}

export function monthDays(year: number, month: number, weekStart: number): Date[] {
  const first = localDate(year, month, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const daysInMonth = localDate(year, month + 1, 0).getDate();
  const count = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: count }, (_, index) => localDate(year, month, 1 - offset + index));
}

export function addDays(date: Date, days: number): Date {
  return localDate(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function startOfWeek(date: Date, weekStart: number): Date {
  return addDays(date, -((date.getDay() - weekStart + 7) % 7));
}

export function weekWindow(first: Date, weeks: number): Date[] {
  return Array.from({ length: weeks * 7 }, (_, index) => addDays(first, index));
}

/** Twelve complete months, with each calendar day appearing exactly once. */
export function yearMonths(year: number): Date[][] {
  return Array.from({ length: 12 }, (_, month) =>
    Array.from({ length: localDate(year, month + 1, 0).getDate() }, (_, day) => localDate(year, month, day + 1)));
}

/** Invalid end dates fall back to the start day, without hiding the note. */
export function dateRange(start: string, end: string | null): { start: string; end: string; invalidEnd: boolean } | null {
  const first = parseDay(start);
  if (!first) return null;
  if (end === null || end.trim() === '') return { start: first, end: first, invalidEnd: false };
  const last = parseDay(end);
  if (!last || last < first) return { start: first, end: first, invalidEnd: true };
  return { start: first, end: last, invalidEnd: false };
}

export interface CalendarSpan { start: string; end: string }
export interface WeekSegment {
  index: number;
  column: number;
  length: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** One segment per note per week; overlapping notes use separate lanes. */
export function layoutWeek(spans: CalendarSpan[], keys: string[]): WeekSegment[] {
  if (keys.length !== 7) throw new Error('A calendar week must contain seven days.');
  return layoutDays(spans, keys);
}

/** A consecutive row of days, including whole months, without 32-bit masks. */
export function layoutDays(spans: CalendarSpan[], keys: string[]): WeekSegment[] {
  const occupied: Set<number>[] = [];
  const segments: WeekSegment[] = [];
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const column = keys.findIndex(key => key >= span.start && key <= span.end);
    if (column < 0) continue;
    let last = column;
    while (last < keys.length - 1 && keys[last + 1] <= span.end) last++;
    const length = last - column + 1;
    const columns = Array.from({ length }, (_, i) => column + i);
    let lane = occupied.findIndex(cells => columns.every(c => !cells.has(c)));
    if (lane < 0) lane = occupied.length;
    occupied[lane] ??= new Set<number>();
    for (const c of columns) occupied[lane].add(c);
    segments.push({index, column, length, lane, continuesBefore: span.start < keys[0], continuesAfter: span.end > keys[keys.length - 1]});
  }
  return segments;
}
