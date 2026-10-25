/** Accept a bounded color grammar; never arbitrary CSS or remote URLs. */
export function eventColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  if (/^(red|orange|yellow|green|cyan|blue|purple|pink)$/.test(color)) return `var(--color-${color})`;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(color)) return color;
  const rgb = /^(rgb|rgba)\(\s*(\d+(?:\.\d+)?%?)\s*,\s*(\d+(?:\.\d+)?%?)\s*,\s*(\d+(?:\.\d+)?%?)(?:\s*,\s*((?:\d+(?:\.\d+)?|\.\d+)%?))?\s*\)$/.exec(color);
  if (!rgb || (rgb[1] === 'rgba') !== !!rgb[5]) return null;
  if (rgb.slice(2, 5).some(channel => parseFloat(channel) > (channel.endsWith('%') ? 100 : 255))) return null;
  if (rgb[5] && parseFloat(rgb[5]) > (rgb[5].endsWith('%') ? 100 : 1)) return null;
  return color;
}

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
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$)/.exec(value.trim());
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

/** Shift written calendar dates without converting their time or UTC offset. */
export function shiftedDates(start: unknown, end: unknown, from: string, to: string): { start: string; end?: string } | null {
  if (typeof start !== 'string' || !parseDay(start) || !parseDay(from) || !parseDay(to)) return null;
  const hasEnd = end !== undefined && end !== null && end !== '';
  if (hasEnd && (typeof end !== 'string' || !parseDay(end) || end.trim().slice(0, 10) < start.trim().slice(0, 10))) return null;
  const serial = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(0);
    date.setUTCFullYear(y, m - 1, d);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime() / 86400000;
  };
  const delta = serial(to) - serial(from);
  const shift = (value: string): string => {
    const [y, m, d] = parseDay(value)!.split('-').map(Number);
    return dayKey(localDate(y, m - 1, d + delta)) + value.trim().slice(10);
  };
  const result = { start: shift(start), ...(hasEnd ? { end: shift(end) } : {}) };
  return parseDay(result.start) && (!result.end || parseDay(result.end)) ? result : null;
}

/** Resizing changes only the inclusive end day, retaining an existing time/offset. */
export function resizedEnd(start: string, end: unknown, to: string): string | null {
  const first = parseDay(start);
  const day = parseDay(to);
  if (!first || !day || day < first) return null;
  if (end === undefined || end === null || end === '') return day;
  if (typeof end !== 'string' || !parseDay(end) || end.trim().slice(0, 10) < first) return null;
  return day + end.trim().slice(10);
}

export interface CalendarSpan { start: string; end: string }

export function eventTime(value: string | null): string {
  return value && parseDay(value) ? value.trim().slice(11, 16) : '';
}

export type RepeatRule = { unit: 'day' | 'week' | 'month' | 'year'; interval: number };

/** Deliberately bounded grammar, shared by note properties and the documentation. */
export function repeatRule(value: string): RepeatRule | null {
  const text = value.trim().toLowerCase();
  const compact = /^([dwmy])([1-9]\d{0,3})?$/.exec(text);
  if (compact) return { unit: ({ d: 'day', w: 'week', m: 'month', y: 'year' } as const)[compact[1] as 'd' | 'w' | 'm' | 'y'], interval: Number(compact[2] ?? 1) };
  const words = /^every (?:(second|third|fourth|[1-9]\d{0,3}) )?(day|week|month|year)s?$/.exec(text);
  if (words) return { unit: words[2] as RepeatRule['unit'], interval: Number(({ second: 2, third: 3, fourth: 4 } as Record<string, number>)[words[1]] ?? words[1] ?? 1) };
  const single = /^(daily|weekly|monthly|yearly)$/.exec(text);
  return single ? { unit: ({ daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const)[single[1] as 'daily' | 'weekly' | 'monthly' | 'yearly'], interval: 1 } : null;
}

function serialDay(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / 86400000;
}

/** Project occurrences into the loaded window; never create or modify notes.
 * Month/year repeats clamp to that month's last day, always from the original
 * anchor (Jan 31 -> Feb 28 -> Mar 31). The duration is in local calendar days.
 */
export function repeatSpans(span: CalendarSpan, rule: RepeatRule, first: string, last: string): { spans: CalendarSpan[]; limited: boolean } {
  if (!parseDay(span.start) || !parseDay(span.end) || !parseDay(first) || !parseDay(last) || span.end < span.start || last < first || !Number.isInteger(rule.interval) || rule.interval < 1) return { spans: [], limited: false };
  const duration = serialDay(span.end) - serialDay(span.start);
  const [y, m, d] = span.start.split('-').map(Number);
  const earliest = addDays(localDate(y, m - 1, d), serialDay(first) - duration - serialDay(span.start));
  const step = rule.interval * (rule.unit === 'week' ? 7 : 1);
  let index = Math.max(0, Math.floor(rule.unit === 'day' || rule.unit === 'week'
    ? (serialDay(first) - duration - serialDay(span.start)) / step
    : rule.unit === 'month' ? ((earliest.getFullYear() - y) * 12 + earliest.getMonth() - m + 1) / step
    : (earliest.getFullYear() - y) / step) - 1);
  const spans: CalendarSpan[] = [];
  for (;; index++) {
    const date = rule.unit === 'day' || rule.unit === 'week' ? addDays(localDate(y, m - 1, d), index * step)
      : (() => {
        const month = localDate(y + (rule.unit === 'year' ? index * step : 0), m - 1 + (rule.unit === 'month' ? index * step : 0), 1);
        return localDate(month.getFullYear(), month.getMonth(), Math.min(d, localDate(month.getFullYear(), month.getMonth() + 1, 0).getDate()));
      })();
    const start = dayKey(date);
    if (!parseDay(start) || start > last) break;
    const end = dayKey(addDays(date, duration));
    if (!parseDay(end)) break;
    if (end < first) continue;
    if (spans.length === 500) return { spans, limited: true };
    spans.push({ start, end });
  }
  return { spans, limited: false };
}
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
