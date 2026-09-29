import {
  BasesView, DateValue, Keymap, LinkValue, ListValue, Menu, Notice, NullValue, Platform, Plugin, StringValue, parseLinktext, parsePropertyId, setIcon,
  type BasesAllOptions, type BasesEntry, type HoverParent, type HoverPopover, type QueryController,
  type TFile, type Value, type WorkspaceLeaf,
} from 'obsidian';
import { addDays, dateRange, dayKey, eventColor, layoutDays, localDate, monthDays, parseDay, resizedEnd, shiftedDates, startOfWeek, weekWindow, yearMonths } from './calendar';

const VIEW_TYPE = 'just-simple-calendar';
const INFINITE_VIEW_TYPE = 'just-simple-calendar-infinite';
const LINEAR_VIEW_TYPE = 'just-simple-calendar-linear';
type ScrollAnchor = { day: string; offset: number };
type OpenMode = 'current' | 'tab' | 'right';
type MoveDates = { file: TFile; startProperty: string; endProperty: string | null; start: string; end: unknown };
const DRAG_TYPE = 'application/x-just-simple-calendar';
const TITLE_LINK = '.jsc-title :is(a, .internal-link, .external-link)';

export default class JustSimpleCalendar extends Plugin {
  onload(): void {
    this.registerHoverLinkSource(VIEW_TYPE, { display: 'Just Simple Calendar', defaultMod: false });
    for (const mode of ['month', 'infinite', 'linear'] as const) this.registerBasesView(mode === 'linear' ? LINEAR_VIEW_TYPE : mode === 'infinite' ? INFINITE_VIEW_TYPE : VIEW_TYPE, {
      name: mode === 'linear' ? 'Linear Calendar' : mode === 'infinite' ? 'Infinite Calendar' : 'Simple Calendar',
      icon: 'calendar-days',
      factory: (controller, containerEl) => new CalendarView(controller, containerEl, mode === 'infinite', mode === 'linear'),
      options: (): BasesAllOptions[] => [
        { type: 'property', key: 'dateProperty', displayName: 'Date property', placeholder: 'Choose a date property' },
        { type: 'property', key: 'endDateProperty', displayName: 'End date property (optional)', placeholder: 'None — single-day notes' },
        { type: 'property', key: 'titleProperty', displayName: 'Title property (optional)', placeholder: 'File name' },
        { type: 'property', key: 'colorProperty', displayName: 'Color property (optional)', placeholder: 'Default color' },
        { type: 'dropdown', key: 'weekStart', displayName: 'First day of week', default: '1', options: { '1': 'Monday', '0': 'Sunday' } },
        { type: 'dropdown', key: 'doubleClickAction', displayName: 'Double-click action', default: 'current', options: { current: 'Open note', tab: 'Open in new tab', right: 'Open to the right' } },
      ],
    });
  }
}

class CalendarView extends BasesView implements HoverParent {
  readonly type: string;
  hoverPopover: HoverPopover | null = null;
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly status: HTMLElement;
  private readonly help: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly weekdays: HTMLElement;
  private firstWeek: Date | null = null;
  private lastWeekStart = -1;
  private scrollAnchor: ScrollAnchor | null = null;
  private scrollFrame = 0;
  private rendering = false;
  private pendingToday = true;
  private layoutWidth = 0;
  private layoutHeight = 0;
  private shownMonth = localDate(new Date().getFullYear(), new Date().getMonth(), 1);
  private entries = new Map<string, TFile>();
  private rightLeaf: WorkspaceLeaf | null = null;
  private creatingNote = false;
  private moves = new Map<string, MoveDates>();
  private drag: { dates: MoveDates; from: string; resize: boolean } | null = null;
  private dropDay: HTMLElement | null = null;
  private movingNote = false;

  constructor(controller: QueryController, parentEl: HTMLElement, private readonly infinite = false, private readonly linear = false) {
    super(controller);
    this.type = linear ? LINEAR_VIEW_TYPE : infinite ? INFINITE_VIEW_TYPE : VIEW_TYPE;
    this.root = parentEl.createDiv({ cls: 'jsc-calendar' });
    this.root.toggleClass('jsc-infinite', infinite);
    this.root.toggleClass('jsc-linear', linear);
    if (linear) {
      parentEl.addClass('jsc-linear-container');
      this.register(() => parentEl.removeClass('jsc-linear-container'));
    }
    const toolbar = this.root.createDiv({ cls: 'jsc-toolbar' });
    this.title = toolbar.createEl('h3', { cls: 'jsc-month', attr: { 'aria-live': 'polite' } });
    const nav = toolbar.createDiv({ cls: 'jsc-navigation' });
    if (!infinite) {
      this.addButton(nav, 'Previous year', 'chevrons-left', () => this.moveMonth(-12));
      if (!linear) this.addButton(nav, 'Previous month', 'chevron-left', () => this.moveMonth(-1));
    }
    const today = nav.createEl('button', { text: 'Today', attr: { type: 'button' } });
    this.registerDomEvent(today, 'click', () => {
      this.shownMonth = localDate(new Date().getFullYear(), new Date().getMonth(), 1);
      this.pendingToday = true;
      this.render();
    });
    if (!infinite) {
      if (!linear) this.addButton(nav, 'Next month', 'chevron-right', () => this.moveMonth(1));
      this.addButton(nav, 'Next year', 'chevrons-right', () => this.moveMonth(12));
    }
    this.weekdays = infinite ? this.root.createDiv({ cls: 'jsc-weekdays' }) : this.root;
    this.viewport = infinite || linear ? this.root.createDiv({ cls: 'jsc-viewport', attr: { tabindex: '0', 'aria-label': linear ? 'Scrollable yearly calendar' : 'Scrollable calendar weeks' } }) : this.root;
    this.grid = this.viewport.createDiv({ cls: 'jsc-grid' });
    this.status = this.root.createDiv({ cls: 'jsc-status', attr: { role: 'status' } });
    this.help = this.root.createDiv({ cls: 'jsc-help' });
    if (infinite) {
      this.registerDomEvent(this.viewport, 'scroll', () => {
        if (this.rendering || this.scrollFrame) return;
        this.scrollFrame = this.root.win.requestAnimationFrame(() => {
          this.scrollFrame = 0;
          this.handleScroll();
        });
      }, { passive: true });
      const observer = new ResizeObserver(() => {
        if (!this.root.isShown() || this.rendering) return;
        this.render(this.scrollAnchor);
      });
      observer.observe(this.viewport);
      this.register(() => {
        observer.disconnect();
        this.root.win.cancelAnimationFrame(this.scrollFrame);
      });
    }

    // Delegate events to the stable root: rerenders do not accumulate listeners.
    this.registerDomEvent(this.grid, 'mouseover', (event) => {
      const el = this.noteElement(event.target);
      const link = this.titleLink(event.target);
      const target = link ?? el;
      if (!el || !target || this.drag || this.resizeHandle(event.target) || Platform.isMobile || (link && !link.hasClass('internal-link'))) return;
      if (link) event.stopPropagation();
      if (this.isNode(event.relatedTarget) && target.contains(event.relatedTarget)) return;
      const file = this.entries.get(el.dataset.path ?? '');
      if (!file) return;
      this.app.workspace.trigger('hover-link', {
        event, source: VIEW_TYPE, hoverParent: this, targetEl: target,
        linktext: link?.dataset.href ?? file.path, sourcePath: file.path,
      });
    }, true);
    this.registerDomEvent(this.grid, 'click', (event) => {
      if (this.followTitleLink(event)) return;
      const el = this.noteElement(event.target);
      if (!el || this.titleLink(event.target)) return;
      event.preventDefault();
      if (Platform.isMobile) this.openElement(el);
    }, true);
    this.registerDomEvent(this.grid, 'auxclick', event => { this.followTitleLink(event); }, true);
    this.registerDomEvent(this.grid, 'dblclick', (event) => {
      const el = this.noteElement(event.target);
      if (Platform.isMobile || this.titleLink(event.target) || this.resizeHandle(event.target)) return;
      event.preventDefault();
      if (el) {
        const mode = this.config.get('doubleClickAction');
        this.openElement(el, mode === 'tab' || mode === 'right' ? mode : 'current');
      }
      else {
        const day = this.dayElement(event.target)?.dataset.date;
        if (day) void this.createNote(day);
      }
    });
    // Handle focused calendar keys before Bases' document-level shortcuts.
    this.registerDomEvent(this.root.win, 'keydown', (event) => {
      if (!this.isNode(event.target) || !this.grid.contains(event.target)) return;
      const titleLink = this.titleLink(event.target);
      if (titleLink) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          titleLink.click();
        }
        return;
      }
      const el = this.noteElement(event.target);
      if (!el) {
        const cell = this.dayElement(event.target);
        if (!cell) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          void this.createNote(cell.dataset.date!);
        } else if (event.key === 'F10' && event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          const rect = cell.getBoundingClientRect();
          this.showDayMenu(cell.dataset.date!, rect.left, rect.bottom);
        }
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        this.openElement(el);
      }
      if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const rect = el.getBoundingClientRect();
        this.showMenu(el, rect.left, rect.bottom);
      }
    }, true);
    this.registerDomEvent(this.grid, 'contextmenu', (event) => {
      const el = this.noteElement(event.target);
      const day = this.dayElement(event.target)?.dataset.date;
      if (!el && !day) return;
      event.preventDefault();
      event.stopPropagation();
      if (el) this.showMenu(el, event.clientX, event.clientY);
      else if (day) this.showDayMenu(day, event.clientX, event.clientY);
    }, true);
    this.registerDomEvent(this.grid, 'dragstart', event => {
      const note = this.noteElement(event.target);
      const dates = this.moves.get(note?.dataset.path ?? '');
      const resize = !!this.resizeHandle(event.target);
      const from = resize ? note?.dataset.end : this.dayAtPoint(event.clientX, event.clientY)?.dataset.date;
      if (!note || !dates || !from || !event.dataTransfer || this.movingNote || Platform.isMobile ||
          (resize && (!dates.endProperty || dates.endProperty === dates.startProperty))) {
        event.preventDefault();
        return;
      }
      this.hoverPopover?.unload();
      this.drag = { dates, from, resize };
      event.dataTransfer.setData(DRAG_TYPE, dates.file.path);
      event.dataTransfer.effectAllowed = 'move';
      this.root.addClass('jsc-dragging');
      this.root.toggleClass('jsc-resizing', resize);
    });
    this.registerDomEvent(this.grid, 'dragover', event => {
      if (!this.drag || !event.dataTransfer?.types.includes(DRAG_TYPE)) return;
      this.dropDay?.removeClass('jsc-drop-target');
      this.dropDay = this.dayAtPoint(event.clientX, event.clientY);
      if (this.drag.resize) {
        const to = this.dropDay?.dataset.date;
        const end = to ? resizedEnd(this.drag.dates.start, this.drag.dates.end, to) : null;
        const start = parseDay(this.drag.dates.start)!;
        for (const cell of this.grid.querySelectorAll<HTMLElement>('.jsc-day')) {
          cell.toggleClass('jsc-resize-range', !!end && cell.dataset.date! >= start && cell.dataset.date! <= to!);
        }
        if (!end) this.dropDay = null;
      }
      if (!this.dropDay) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      this.dropDay.addClass('jsc-drop-target');
    });
    this.registerDomEvent(this.grid, 'dragleave', event => {
      if (!this.isNode(event.relatedTarget) || !this.grid.contains(event.relatedTarget)) {
        this.dropDay?.removeClass('jsc-drop-target');
        this.dropDay = null;
        for (const cell of this.grid.querySelectorAll('.jsc-resize-range')) cell.removeClass('jsc-resize-range');
      }
    });
    this.registerDomEvent(this.grid, 'drop', event => {
      const drag = this.drag;
      const to = this.dayAtPoint(event.clientX, event.clientY)?.dataset.date;
      if (!drag || !to || event.dataTransfer?.getData(DRAG_TYPE) !== drag.dates.file.path) return;
      event.preventDefault();
      event.stopPropagation();
      this.finishDrag();
      if (to !== drag.from) void this.updateDates(drag.dates, drag.from, to, drag.resize);
    });
    this.registerDomEvent(this.grid, 'dragend', () => this.finishDrag());
  }

  private titleLink(target: EventTarget | null): HTMLElement | null {
    return this.isNode(target) && target.instanceOf(Element) ? target.closest<HTMLElement>(TITLE_LINK) : null;
  }

  private resizeHandle(target: EventTarget | null): HTMLElement | null {
    return this.isNode(target) && target.instanceOf(Element) ? target.closest<HTMLElement>('.jsc-resize-handle') : null;
  }

  private followTitleLink(event: MouseEvent): boolean {
    const link = this.titleLink(event.target);
    const file = this.entries.get(this.noteElement(event.target)?.dataset.path ?? '');
    if (!link?.hasClass('internal-link') || !file || (event.button !== 0 && event.button !== 1)) return false;
    event.preventDefault();
    event.stopPropagation();
    // Bases' shared renderer has no source-note context for relative links.
    void this.app.workspace.openLinkText(link.dataset.href ?? '', file.path, Keymap.isModEvent(event));
    return true;
  }

  private renderTitle(el: HTMLElement, value: Value | null, file: TFile): void {
    if (value instanceof ListValue) {
      for (let i = 0; i < value.length(); i++) {
        if (i) el.appendText(', ');
        this.renderTitle(el, value.get(i), file);
      }
    } else {
      const text = value && !(value instanceof NullValue) ? value.toString().trim() : '';
      const link = value instanceof LinkValue ? value : text ? LinkValue.parseFromString(this.app, text, file.path) : null;
      if (link) link.renderTo(el, this.app.renderContext);
      else el.appendText(text);
    }
  }

  private dayAtPoint(x: number, y: number): HTMLElement | null {
    const hit = this.grid.doc.elementFromPoint(x, y);
    const week = hit?.closest('.jsc-week');
    if (!week || !this.grid.contains(week) || hit?.closest('.jsc-linear-month, .jsc-month-rail')) return null;
    // Bars overlay the cells; use the column underneath the pointer, including continuations.
    return [...week.querySelectorAll<HTMLElement>('.jsc-day')].find(day => {
      const rect = day.getBoundingClientRect();
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
    }) ?? null;
  }

  private finishDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.dropDay?.removeClass('jsc-drop-target');
    this.dropDay = null;
    this.root.removeClass('jsc-dragging', 'jsc-resizing');
    this.render();
    if (this.infinite) this.handleScroll();
  }

  private moveDates(file: TFile, startDay: string, endDay: string): MoveDates | null {
    const startProperty = this.writableDateProperty();
    if (!startProperty) return null;
    const endId = this.config.getAsPropertyId('endDateProperty');
    const parsedEnd = endId ? parsePropertyId(endId) : null;
    // A computed end could change the duration after moving its start.
    if (parsedEnd && parsedEnd.type !== 'note') return null;
    const endProperty = parsedEnd?.name ?? null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const start: unknown = fm?.[startProperty];
    const end: unknown = endProperty ? fm?.[endProperty] : undefined;
    const shifted = shiftedDates(start, end, startDay, startDay);
    if (!shifted || parseDay(shifted.start) !== startDay || (shifted.end ? parseDay(shifted.end) : startDay) !== endDay) return null;
    return { file, startProperty, endProperty, start: start as string, end };
  }

  private async updateDates(dates: MoveDates, from: string, to: string, resize: boolean): Promise<void> {
    if (this.movingNote) return;
    this.movingNote = true;
    try {
      const end = resize ? resizedEnd(dates.start, dates.end, to) : null;
      const shifted = resize ? end && dates.endProperty && dates.endProperty !== dates.startProperty ? { end } : null : shiftedDates(dates.start, dates.end, from, to);
      if (!shifted) return;
      await this.app.fileManager.processFrontMatter(dates.file, (fm: Record<string, unknown>) => {
        const start: unknown = fm[dates.startProperty];
        const end: unknown = dates.endProperty ? fm[dates.endProperty] : undefined;
        if (start !== dates.start || end !== dates.end) throw new Error('Dates changed during the drag.');
        if ('start' in shifted) Object.defineProperty(fm, dates.startProperty, { value: shifted.start, enumerable: true, writable: true, configurable: true });
        if (dates.endProperty && shifted.end) Object.defineProperty(fm, dates.endProperty, { value: shifted.end, enumerable: true, writable: true, configurable: true });
      });
    } catch (error) {
      console.error('Just Simple Calendar: could not update dates', error);
      new Notice('Could not update this note. Its dates may have changed; try again.');
    } finally {
      this.movingNote = false;
    }
  }

  private addButton(parent: HTMLElement, label: string, icon: string, action: () => void): void {
    const button = parent.createEl('button', { cls: 'jsc-icon-button', attr: { type: 'button', 'aria-label': label } });
    setIcon(button, icon);
    this.registerDomEvent(button, 'click', action);
  }

  private noteElement(target: EventTarget | null): HTMLElement | null {
    return this.isNode(target) && target.instanceOf(Element) ? target.closest<HTMLElement>('.jsc-note') : null;
  }

  private dayElement(target: EventTarget | null): HTMLElement | null {
    return this.isNode(target) && target.instanceOf(Element) ? target.closest<HTMLElement>('.jsc-day') : null;
  }

  private isNode(target: EventTarget | null): target is Node {
    return Boolean((target as Node | null)?.instanceOf?.(Node));
  }

  private writableDateProperty(): string | null {
    const property = this.config.getAsPropertyId('dateProperty');
    if (!property) return null;
    const parsed = parsePropertyId(property);
    return parsed.type === 'note' ? parsed.name : null;
  }

  private showDayMenu(day: string, x: number, y: number): void {
    const writable = this.writableDateProperty() !== null;
    new Menu().addItem(item => item
      .setTitle(writable ? `Create note on ${day}` : 'Choose a note date property to create notes')
      .setIcon('file-plus')
      .setDisabled(!writable)
      .onClick(() => this.createNote(day)))
      .showAtPosition({ x, y });
  }

  private async createNote(day: string): Promise<void> {
    const property = this.writableDateProperty();
    if (!property) {
      new Notice('Choose a note date property first. File dates and formulas are read-only.');
      return;
    }
    if (this.creatingNote || !parseDay(day)) return;
    this.creatingNote = true;
    try {
      // Bases chooses the folder, unique name and filter-derived properties.
      // Its native new-note popover lets the user name and edit the blank note.
      await this.createFileForView(undefined, frontmatter => {
        Object.defineProperty(frontmatter, property, { value: day, enumerable: true, writable: true, configurable: true });
      });
    } catch (error) {
      console.error('Just Simple Calendar: could not create note', error);
      new Notice('Could not create the note.');
    } finally {
      this.creatingNote = false;
    }
  }

  private moveMonth(delta: number): void {
    this.shownMonth = localDate(this.shownMonth.getFullYear(), this.shownMonth.getMonth() + delta, 1);
    this.render();
  }

  onDataUpdated(): void { this.render(); }

  private captureAnchor(): ScrollAnchor | null {
    const top = this.viewport.getBoundingClientRect().top;
    for (const week of this.grid.querySelectorAll<HTMLElement>('.jsc-week')) {
      const rect = week.getBoundingClientRect();
      if (rect.bottom > top + 1) return { day: week.dataset.week!, offset: rect.top - top };
    }
    return null;
  }

  private restoreAnchor(anchor: ScrollAnchor): void {
    const week = this.grid.querySelector<HTMLElement>(`[data-week="${anchor.day}"]`);
    if (week) this.viewport.scrollTop += week.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top - anchor.offset;
  }

  private updateScrollLabel(): void {
    this.scrollAnchor = this.captureAnchor();
    if (this.scrollAnchor) {
      const [year, month, day] = this.scrollAnchor.day.split('-').map(Number);
      this.title.setText(new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(localDate(year, month - 1, day)));
    }
  }

  private handleScroll(): void {
    if (!this.firstWeek || !this.grid.querySelector('.jsc-week') || !this.root.isShown()) return;
    // Keep the native drag source connected until drop or cancellation.
    if (this.drag) { this.updateScrollLabel(); return; }
    // A resize can emit scroll before ResizeObserver runs; keep the pre-resize anchor.
    if (this.viewport.clientWidth !== this.layoutWidth || this.viewport.clientHeight !== this.layoutHeight) {
      this.render(this.scrollAnchor);
      return;
    }
    this.updateScrollLabel();
    const remaining = this.viewport.scrollHeight - this.viewport.clientHeight - this.viewport.scrollTop;
    if (this.viewport.scrollTop < 500 || remaining < 500) {
      const anchor = this.scrollAnchor;
      if (!anchor) return;
      const [year, month, day] = anchor.day.split('-').map(Number);
      // Recenter a bounded window around the same visible week, not a pixel estimate.
      this.firstWeek = addDays(localDate(year, month - 1, day), -12 * 7);
      this.render(anchor);
    }
  }

  private render(savedAnchor?: ScrollAnchor | null): void {
    if (!this.data || !this.config || this.drag) return;
    const anchor = this.infinite ? savedAnchor ?? this.captureAnchor() : null;
    const active = this.infinite ? this.root.doc.activeElement : null;
    const focusedNote = active && this.grid.contains(active) ? this.noteElement(active) : null;
    const focusedDay = active && this.grid.contains(active) ? this.dayElement(active) : null;
    this.rendering = true;
    try {
    const property = this.config.getAsPropertyId('dateProperty');
    const endProperty = this.config.getAsPropertyId('endDateProperty');
    const titleProperty = this.config.getAsPropertyId('titleProperty');
    const colorProperty = this.config.getAsPropertyId('colorProperty');
    const weekStart = this.config.get('weekStart') === '0' ? 0 : 1;
    const month = this.shownMonth.getMonth();
    const year = this.shownMonth.getFullYear();
    this.title.setText(this.linear ? String(year) : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(this.shownMonth));
    let targetAnchor = anchor;
    if (this.infinite) {
      if (!this.firstWeek || this.pendingToday) {
        const todayWeek = startOfWeek(new Date(), weekStart);
        this.firstWeek = addDays(todayWeek, -12 * 7);
        targetAnchor = { day: dayKey(todayWeek), offset: 0 };
      } else if (weekStart !== this.lastWeekStart) {
        this.firstWeek = startOfWeek(this.firstWeek, weekStart);
        if (anchor) {
          const [y, m, d] = anchor.day.split('-').map(Number);
          targetAnchor = { day: dayKey(startOfWeek(localDate(y, m - 1, d), weekStart)), offset: anchor.offset };
        }
      }
      this.lastWeekStart = weekStart;
      this.weekdays.empty();
    }
    this.grid.empty();
    this.entries.clear();
    this.moves.clear();
    this.help.setText(Platform.isMobile ? 'Tap a note to open it · Long-press a day to create a note' : 'Hover to preview · Double-click a note to open, or an empty space to create · Right-click for more');
    this.root.toggleClass('jsc-unconfigured', !property);
    if (!property) {
      this.status.setText('Choose a date property in the view settings to display your notes.');
      return;
    }
    const days = this.linear
      ? yearMonths(year).flat()
      : this.infinite
      ? weekWindow(this.firstWeek!, Math.max(40, Math.ceil(this.viewport.clientHeight / 90) + 24))
      : monthDays(year, month, weekStart);
    const monthFirst = dayKey(localDate(year, this.linear ? 0 : month, 1));
    const monthLast = dayKey(localDate(year, this.linear ? 12 : month + 1, 0));
    const spans: {start: string; end: string; entry: BasesEntry}[] = [];
    let undated = 0;
    let invalidEnds = 0;
    let inMonth = 0;
    for (const entry of this.data.data) {
      const value = entry.getValue(property);
      const start = value && value.isTruthy() ? (value instanceof DateValue ? value.dateOnly().toString() : value.toString()) : '';
      const endValue = endProperty ? entry.getValue(endProperty) : null;
      const end = endValue && endValue.isTruthy() ? (endValue instanceof DateValue ? endValue.dateOnly().toString() : endValue.toString()) : null;
      const range = dateRange(start, end);
      if (!range) { undated++; continue; }
      if (range.invalidEnd) invalidEnds++;
      if (range.start <= monthLast && range.end >= monthFirst) inMonth++;
      if (range.start <= dayKey(days[days.length - 1]) && range.end >= dayKey(days[0])) spans.push({...range, entry});
    }
    const weekdayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
    if (this.infinite) this.weekdays.createDiv({ cls: 'jsc-weekday', attr: { 'aria-hidden': 'true' } });
    const headingDays = this.linear ? weekWindow(startOfWeek(localDate(year, 0, 1), weekStart), 6).slice(0, 37) : days.slice(0, 7);
    if (this.linear) this.grid.createDiv({ cls: 'jsc-weekday jsc-linear-corner', text: 'Month' });
    for (const date of headingDays) {
      (this.infinite ? this.weekdays : this.grid).createDiv({ cls: 'jsc-weekday', text: this.linear ? weekdayFormat.format(date).slice(0, 2) : weekdayFormat.format(date) });
    }
    const todayKey = dayKey(new Date());
    const fullDateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'full' });
    const rows = this.linear
      ? Array.from({ length: 12 }, (_, m) => days.filter(date => date.getMonth() === m))
      : Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
    for (const [rowIndex, weekDays] of rows.entries()) {
      const columnOffset = this.linear ? 2 + (weekDays[0].getDay() - weekStart + 7) % 7 : this.infinite ? 2 : 1;
      const keys = weekDays.map(dayKey);
      const segments = layoutDays(spans, keys);
      const lanes = segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
      const week = this.grid.createDiv({cls: 'jsc-week', attr: { 'data-week': keys[0] }});
      week.style.gridTemplateRows = `${this.linear ? 24 : 34}px ${lanes ? `repeat(${lanes}, ${this.linear ? 22 : 30}px) ` : ''}minmax(12px, 1fr)`;
      if (this.infinite) {
        const boundary = weekDays.find(date => date.getDate() === 1);
        const labelDate = boundary ?? (rowIndex === 0 ? weekDays[0] : null);
        week.createDiv({ cls: 'jsc-month-rail', text: labelDate ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(labelDate) : '' });
      }
      if (this.linear) week.createDiv({ cls: 'jsc-linear-month', text: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(weekDays[0]) });
      weekDays.forEach((date, column) => {
        const key = dayKey(date);
        const cell = week.createEl('section', { cls: 'jsc-day', attr: { 'aria-label': fullDateFormat.format(date), 'data-date': key, tabindex: '0' } });
        cell.style.gridColumn = String(column + columnOffset);
        cell.toggleClass('jsc-outside', !this.infinite && !this.linear && date.getMonth() !== month);
        cell.toggleClass('jsc-weekend', date.getDay() === 0 || date.getDay() === 6);
        cell.toggleClass('jsc-today', key === todayKey);
        const number = cell.createEl('time', { cls: 'jsc-day-number', text: this.infinite && date.getDate() === 1 ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date) : String(date.getDate()), attr: { datetime: key } });
        if (key === todayKey) number.setAttribute('aria-current', 'date');
      });
      if (this.linear) {
        const outline = week.createDiv({ cls: 'jsc-month-outline', attr: { 'aria-hidden': 'true' } });
        outline.style.gridColumn = `${columnOffset} / span ${weekDays.length}`;
      }
      for (const segment of segments) {
        const {entry, start, end} = spans[segment.index];
        const titleValue = titleProperty ? entry.getValue(titleProperty) : null;
        this.entries.set(entry.file.path, entry.file);
        const dates = this.moveDates(entry.file, start, end);
        if (dates) this.moves.set(entry.file.path, dates);
        const note = week.createDiv({
          cls: 'jsc-note',
          attr: { role: 'link', tabindex: '0', 'data-path': entry.file.path, draggable: String(!!dates && !Platform.isMobile),
            'data-start': keys[segment.column], 'data-end': keys[segment.column + segment.length - 1] },
        });
        const label = note.createSpan({ cls: 'jsc-title' });
        this.renderTitle(label, titleValue, entry.file);
        if (!label.textContent?.trim()) label.setText(entry.file.basename);
        const title = label.textContent;
        note.title = `${title} — ${start === end ? start : `${start} through ${end}`}`;
        note.setAttribute('aria-label', `${note.title}${segment.continuesBefore ? ' (continued)' : ''}`);
        for (const link of note.querySelectorAll<HTMLElement>(TITLE_LINK)) {
          link.draggable = false;
          link.setAttribute('role', 'link');
          link.tabIndex = 0;
          if (link.hasClass('internal-link')) {
            const path = parseLinktext(link.dataset.href ?? '').path;
            link.toggleClass('is-unresolved', !!path && !this.app.metadataCache.getFirstLinkpathDest(path, entry.file.path));
          }
        }
        if (this.linear && start === end) label.remove();
        if (dates?.endProperty && dates.endProperty !== dates.startProperty && !segment.continuesAfter && !Platform.isMobile) {
          note.addClass('jsc-resizable');
          note.createSpan({ cls: 'jsc-resize-handle', attr: { draggable: 'true', 'aria-hidden': 'true', title: 'Drag to resize end date' } });
        }
        note.style.gridColumn = `${segment.column + columnOffset} / span ${segment.length}`;
        note.style.gridRow = String(segment.lane + 2);
        note.toggleClass('jsc-continues-before', segment.continuesBefore);
        note.toggleClass('jsc-continues-after', segment.continuesAfter);
        note.toggleClass('jsc-multiday', start !== end);
        const colorValue = colorProperty ? entry.getValue(colorProperty) : null;
        const color = eventColor(colorValue instanceof StringValue ? colorValue.toString() : null);
        if (color) {
          note.style.setProperty('--jsc-event-color', color);
          note.addClass('jsc-colored');
        }
      }
    }
    const count = this.infinite ? spans.length : inMonth;
    const parts = [this.config.getDisplayName(property), `${count} ${count === 1 ? 'note' : 'notes'} ${this.infinite ? 'in loaded weeks' : this.linear ? 'this year' : 'this month'}`];
    if (endProperty) parts.push(`End: ${this.config.getDisplayName(endProperty)}`);
    if (undated) parts.push(`${undated} without a valid date`);
    if (invalidEnds) parts.push(`${invalidEnds} with an invalid end date (shown on start date)`);
    this.status.setText(parts.join(' · '));
    if (this.infinite && this.viewport.clientHeight > 0) {
      this.weekdays.style.marginRight = `${this.viewport.offsetWidth - this.viewport.clientWidth}px`;
      if (targetAnchor) this.restoreAnchor(targetAnchor);
      this.pendingToday = false;
      this.layoutWidth = this.viewport.clientWidth;
      this.layoutHeight = this.viewport.clientHeight;
      this.updateScrollLabel();
      const focusTarget = focusedNote
        ? [...this.grid.querySelectorAll<HTMLElement>('.jsc-note')].find(el => el.dataset.path === focusedNote.dataset.path && el.dataset.start === focusedNote.dataset.start)
        : focusedDay ? this.grid.querySelector<HTMLElement>(`[data-date="${focusedDay.dataset.date}"]`) : null;
      focusTarget?.focus({ preventScroll: true });
    }
    } finally {
      this.rendering = false;
    }
  }

  private openElement(el: HTMLElement, mode: OpenMode = 'current'): void {
    const file = this.entries.get(el.dataset.path ?? '');
    if (file) void this.openFile(file, mode);
  }

  private showMenu(el: HTMLElement, x: number, y: number): void {
    const file = this.entries.get(el.dataset.path ?? '');
    if (!file) return;
    new Menu()
      .addItem(item => item.setTitle('Open note').setIcon('file-text').onClick(() => this.openFile(file, 'current')))
      .addItem(item => item.setTitle('Open in new tab').setIcon('file-plus').onClick(() => this.openFile(file, 'tab')))
      .addItem(item => item.setTitle('Open to the right').setIcon('panel-right').onClick(() => this.openFile(file, 'right')))
      .addSeparator()
      .addItem(item => item.setTitle('Delete note').setIcon('trash-2').setWarning(true).onClick(() => this.deleteNote(file)))
      .showAtPosition({ x, y });
  }

  private async deleteNote(file: TFile): Promise<void> {
    try {
      this.hoverPopover?.unload();
      // Use Obsidian's deletion preference (system trash, vault trash or permanent).
      await this.app.fileManager.trashFile(file);
    } catch (error) {
      console.error('Just Simple Calendar: could not delete note', error);
      new Notice('Could not delete this note.');
    }
  }

  private async openFile(file: TFile, mode: OpenMode): Promise<void> {
    try {
      this.hoverPopover?.unload();
      let origin: WorkspaceLeaf | null = null;
      this.app.workspace.iterateAllLeaves(leaf => {
        if (leaf.view.containerEl.contains(this.root)) origin = leaf;
      });
      let target: WorkspaceLeaf;
      if (mode === 'right') {
        let stillOpen = false;
        this.app.workspace.iterateAllLeaves(leaf => { if (leaf === this.rightLeaf) stillOpen = true; });
        target = stillOpen && this.rightLeaf ? this.rightLeaf : origin
          ? this.app.workspace.createLeafBySplit(origin, 'vertical', false)
          : this.app.workspace.getLeaf('split', 'vertical');
        this.rightLeaf = target;
      } else {
        target = mode === 'tab' ? this.app.workspace.getLeaf('tab') : origin ?? this.app.workspace.getLeaf(false);
      }
      await target.openFile(file);
    } catch (error) {
      console.error('Just Simple Calendar: could not open note', error);
      new Notice('Could not open this note.');
    }
  }

  onunload(): void {
    this.hoverPopover?.unload();
    this.entries.clear();
    this.moves.clear();
    this.drag = null;
    this.root.remove();
  }
}
