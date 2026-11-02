import {
  BasesView, DateValue, Keymap, LinkValue, ListValue, Menu, Notice, NullValue, Platform, Plugin, StringValue, getFrontMatterInfo, parseYaml, parseLinktext, parsePropertyId, setIcon,
  type BasesAllOptions, type BasesEntry, type HoverParent, type HoverPopover, type QueryController,
  type TFile, type Value, type WorkspaceLeaf,
} from 'obsidian';
import { addDays, agendaDays, dayKey, eventColor, eventTime, layoutDays, localDate, monthDays, parseDay, projectSchedule, repeatRule, resizedEnd, shiftedDates, startOfWeek, weekWindow, yearMonths, type ScheduleProjection } from './calendar';
import { ScheduleModal } from './schedule-modal';

const VIEW_TYPE = 'just-simple-calendar';
const INFINITE_VIEW_TYPE = 'just-simple-calendar-infinite';
const LINEAR_VIEW_TYPE = 'just-simple-calendar-linear';
const AGENDA_VIEW_TYPE = 'just-simple-calendar-agenda';
type ScrollAnchor = { day: string; offset: number };
type OpenMode = 'current' | 'tab' | 'right';
type MoveDates = { file: TFile; startProperty: string; endProperty: string | null; start: string; end: unknown };
type EventSpan = { start: string; end: string; entry: BasesEntry; time: string; kind: ScheduleProjection['kind']; warnings: string[]; movable: boolean };
const DRAG_TYPE = 'application/x-just-simple-calendar';
const TITLE_LINK = '.jsc-title :is(a, .internal-link, .external-link)';

export default class JustSimpleCalendar extends Plugin {
  onload(): void {
    this.registerHoverLinkSource(VIEW_TYPE, { display: 'Just Simple Calendar', defaultMod: false });
    for (const mode of ['month', 'infinite', 'linear', 'agenda'] as const) this.registerBasesView(mode === 'agenda' ? AGENDA_VIEW_TYPE : mode === 'linear' ? LINEAR_VIEW_TYPE : mode === 'infinite' ? INFINITE_VIEW_TYPE : VIEW_TYPE, {
      name: mode === 'agenda' ? 'Simple Agenda' : mode === 'linear' ? 'Linear Calendar' : mode === 'infinite' ? 'Infinite Calendar' : 'Simple Calendar',
      icon: mode === 'agenda' ? 'list' : 'calendar-days',
      factory: (controller, containerEl) => new CalendarView(controller, containerEl, mode === 'infinite', mode === 'linear', mode === 'agenda'),
      options: (config): BasesAllOptions[] => [
        { type: 'property', key: 'dateProperty', displayName: 'Date property', placeholder: 'Choose a date property' },
        { type: 'property', key: 'endDateProperty', displayName: 'End date property (optional)', placeholder: 'None — single-day notes' },
        { type: 'property', key: 'titleProperty', displayName: 'Title property (optional)', placeholder: 'File name' },
        { type: 'property', key: 'colorProperty', displayName: 'Color property (optional)', placeholder: 'Default color' },
        { type: 'group', displayName: 'Optional scheduling', items: [
          { type: 'property', key: 'repeatProperty', displayName: 'Repeat property (optional)', placeholder: 'None - no repetition' },
          { type: 'property', key: 'repeatUntilProperty', displayName: 'Repeat until property (optional)', placeholder: 'None - no end date', shouldHide: () => !config.getAsPropertyId('repeatProperty') },
          { type: 'property', key: 'repeatExceptProperty', displayName: 'Skipped dates property (optional)', placeholder: 'None - no skipped dates', shouldHide: () => !config.getAsPropertyId('repeatProperty') },
          { type: 'property', key: 'additionalDatesProperty', displayName: 'Additional dates property (optional)', placeholder: 'None - use only the main date' },
        ] },
        { type: 'toggle', key: 'showStatus', displayName: 'Show status', default: true },
        { type: 'toggle', key: 'showHelp', displayName: 'Show help', default: true },
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
  private agendaRange: 'day' | 'week' = 'week';
  private disposed = false;
  private scheduleEditor: ScheduleModal | null = null;

  constructor(controller: QueryController, parentEl: HTMLElement, private readonly infinite = false, private readonly linear = false, private readonly agenda = false) {
    super(controller);
    this.type = agenda ? AGENDA_VIEW_TYPE : linear ? LINEAR_VIEW_TYPE : infinite ? INFINITE_VIEW_TYPE : VIEW_TYPE;
    this.root = parentEl.createDiv({ cls: 'jsc-calendar' });
    this.root.toggleClass('jsc-infinite', infinite);
    this.root.toggleClass('jsc-linear', linear);
    this.root.toggleClass('jsc-agenda', agenda);
    if (agenda) this.shownMonth = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const containerClass = linear ? 'jsc-linear-container' : infinite ? 'jsc-infinite-container' : 'jsc-month-container';
    parentEl.addClass(containerClass);
    this.register(() => parentEl.removeClass(containerClass));
    const toolbar = this.root.createDiv({ cls: 'jsc-toolbar' });
    this.title = toolbar.createEl('h3', { cls: 'jsc-month', attr: { 'aria-live': 'polite' } });
    const nav = toolbar.createDiv({ cls: 'jsc-navigation' });
    if (agenda) {
      const period = nav.createEl('select', { attr: { 'aria-label': 'Agenda period' } });
      period.createEl('option', { value: 'day', text: 'Day' });
      period.createEl('option', { value: 'week', text: 'Week' });
      period.value = this.agendaRange;
      this.registerDomEvent(period, 'change', () => {
        this.agendaRange = period.value === 'day' ? 'day' : 'week';
        this.config.set('agendaRange', this.agendaRange);
        this.render();
      });
      this.addButton(nav, 'Previous period', 'chevron-left', () => this.moveAgenda(-1));
    } else if (!infinite) {
      this.addButton(nav, 'Previous year', 'chevrons-left', () => this.moveMonth(-12));
      if (!linear) this.addButton(nav, 'Previous month', 'chevron-left', () => this.moveMonth(-1));
    }
    const today = nav.createEl('button', { text: 'Today', attr: { type: 'button' } });
    this.registerDomEvent(today, 'click', () => {
      this.shownMonth = localDate(new Date().getFullYear(), new Date().getMonth(), agenda ? new Date().getDate() : 1);
      this.pendingToday = true;
      this.render();
    });
    if (agenda) {
      this.addButton(nav, 'Next period', 'chevron-right', () => this.moveAgenda(1));
      const date = nav.createEl('input', { type: 'date', attr: { 'aria-label': 'Go to date' } });
      this.registerDomEvent(date, 'change', () => {
        if (parseDay(date.value) !== date.value) return;
        const [year, month, day] = date.value.split('-').map(Number);
        this.shownMonth = localDate(year, month - 1, day);
        this.render();
      });
    } else if (!infinite) {
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
      const action = this.isNode(event.target) && event.target.instanceOf(Element) ? event.target.closest<HTMLElement>('[data-jsc-action]') : null;
      if (action) {
        event.preventDefault(); event.stopPropagation();
        if (action.dataset.jscAction === 'create') void this.createNote(action.dataset.date!);
        else { const note = this.noteElement(action); if (note) { const rect = action.getBoundingClientRect(); this.showMenu(note, rect.left, rect.bottom); } }
        return;
      }
      if (this.followTitleLink(event)) return;
      const el = this.noteElement(event.target);
      if (!el || this.titleLink(event.target)) return;
      event.preventDefault();
      if (Platform.isMobile || this.agenda) this.openElement(el);
    }, true);
    this.registerDomEvent(this.grid, 'auxclick', event => { this.followTitleLink(event); }, true);
    this.registerDomEvent(this.grid, 'dblclick', (event) => {
      const el = this.noteElement(event.target);
      if (Platform.isMobile || this.agenda || (this.isNode(event.target) && event.target.instanceOf(Element) && event.target.closest('button')) || this.titleLink(event.target) || this.resizeHandle(event.target)) return;
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
      if (event.target.instanceOf(Element) && event.target.closest('button')) return;
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

  private dateText(entry: BasesEntry, property: Parameters<BasesEntry['getValue']>[0]): string {
    const parsed = parsePropertyId(property);
    const raw: unknown = parsed.type === 'note' ? this.app.metadataCache.getFileCache(entry.file)?.frontmatter?.[parsed.name] : null;
    if (typeof raw === 'string' && parseDay(raw)) return raw.trim();
    const value = entry.getValue(property);
    if (!value?.isTruthy()) return '';
    const text = value.toString();
    return parseDay(text) ? text : value instanceof DateValue ? value.dateOnly().toString() : text;
  }

  private propertyValue(entry: BasesEntry, key: string): unknown {
    const property = this.config.getAsPropertyId(key);
    if (!property) return undefined;
    const parsed = parsePropertyId(property);
    const fm = this.app.metadataCache.getFileCache(entry.file)?.frontmatter;
    if (parsed.type === 'note' && fm && Object.prototype.hasOwnProperty.call(fm, parsed.name)) return fm[parsed.name];
    const value = entry.getValue(property);
    if (value instanceof ListValue) return Array.from({ length: value.length() }, (_, i) => value.get(i).toString());
    return value && !(value instanceof NullValue) ? value.toString() : undefined;
  }

  private schedulePropertyConflict(): boolean {
    const keys = ['dateProperty', 'endDateProperty', 'repeatProperty', 'repeatUntilProperty', 'repeatExceptProperty', 'additionalDatesProperty'];
    const values = keys.map(key => this.config.getAsPropertyId(key));
    return values.some((value, index) => index >= 3 && value && values.some((other, i) => i !== index && value === other));
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

  private moveAgenda(direction: number): void {
    this.shownMonth = addDays(this.shownMonth, direction * (this.agendaRange === 'day' ? 1 : 7));
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
    const active = this.root.doc.activeElement;
    const focusedNote = active && this.grid.contains(active) ? this.noteElement(active) : null;
    const focusedDay = active && this.grid.contains(active) ? this.dayElement(active) : null;
    this.rendering = true;
    try {
    const property = this.config.getAsPropertyId('dateProperty');
    const endProperty = this.config.getAsPropertyId('endDateProperty');
    this.status.hidden = this.config.get('showStatus') === false;
    this.help.hidden = this.config.get('showHelp') === false;
    const weekStart = this.config.get('weekStart') === '0' ? 0 : 1;
    if (this.agenda) {
      this.agendaRange = this.config.get('agendaRange') === 'day' ? 'day' : 'week';
      const period = this.root.querySelector<HTMLSelectElement>('select[aria-label="Agenda period"]');
      if (period) period.value = this.agendaRange;
    }
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
      : this.agenda ? agendaDays(this.shownMonth, weekStart, this.agendaRange)
      : this.infinite
      ? weekWindow(this.firstWeek!, Math.max(40, Math.ceil(this.viewport.clientHeight / 90) + 24))
      : monthDays(year, month, weekStart);
    const monthFirst = this.agenda || this.infinite ? dayKey(days[0]) : dayKey(localDate(year, this.linear ? 0 : month, 1));
    const monthLast = this.agenda || this.infinite ? dayKey(days[days.length - 1]) : dayKey(localDate(year, this.linear ? 12 : month + 1, 0));
    const spans: EventSpan[] = [];
    let undated = 0;
    let invalidEnds = 0;
    const inMonth = new Set<string>();
    let occurrences = 0;
    const warnings = new Map<string, number>();
    const scheduleConflict = this.schedulePropertyConflict();
    if (scheduleConflict) warnings.set('Choose different properties for optional scheduling (optional fields ignored)', 1);
    let limitedRepeats = 0;
    for (const entry of this.data.data) {
      const start = this.dateText(entry, property);
      const end = endProperty ? this.dateText(entry, endProperty) : null;
      const repeatValue = this.propertyValue(entry, 'repeatProperty');
      const repeat = typeof repeatValue === 'string' ? repeatValue.trim() : repeatValue == null ? '' : 'Invalid repeat';
      const projected = projectSchedule(start, end, repeat, dayKey(days[0]), dayKey(days[days.length - 1]), {
        ...(scheduleConflict ? {} : { until: this.propertyValue(entry, 'repeatUntilProperty'), except: this.propertyValue(entry, 'repeatExceptProperty'), additional: this.propertyValue(entry, 'additionalDatesProperty') }),
      });
      if (!projected) { undated++; continue; }
      if (projected.invalidEnd) invalidEnds++;
      for (const warning of projected.warnings) warnings.set(warning, (warnings.get(warning) ?? 0) + 1);
      if (projected.limited) limitedRepeats++;
      const startTime = eventTime(start);
      const endTime = projected.invalidEnd ? '' : eventTime(end);
      const time = startTime && endTime ? `${startTime}–${endTime}` : startTime || (endTime ? `until ${endTime}` : '');
      for (const occurrence of projected.spans) {
        if (occurrence.start <= monthLast && occurrence.end >= monthFirst) { inMonth.add(entry.file.path); occurrences++; }
        spans.push({ ...occurrence, entry, time, kind: projected.kind, warnings: projected.warnings, movable: projected.kind === 'single' && !repeat && !projected.warnings.length });
      }
    }
    if (this.agenda) this.renderAgenda(days, spans);
    else {
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
        const note = this.renderNote(week, spans[segment.index], keys[segment.column], keys[segment.column + segment.length - 1], segment.continuesBefore, segment.continuesAfter);
        note.style.gridColumn = `${segment.column + columnOffset} / span ${segment.length}`;
        note.style.gridRow = String(segment.lane + 2);
      }
    }
    }
    const count = inMonth.size;
    const parts = [this.config.getDisplayName(property), `${count} ${count === 1 ? 'note' : 'notes'} ${this.agenda ? 'in this period' : this.infinite ? 'in loaded weeks' : this.linear ? 'this year' : 'this month'}`];
    if (occurrences > count) parts.push(`${occurrences} occurrences`);
    if (endProperty) parts.push(`End: ${this.config.getDisplayName(endProperty)}`);
    if (undated) parts.push(`${undated} without a valid date`);
    if (invalidEnds) parts.push(`${invalidEnds} with an invalid end date (shown on start date)`);
    for (const [warning, count] of warnings) parts.push(`${count}: ${warning}`);
    if (limitedRepeats) parts.push(`${limitedRepeats} series limited to 500 occurrences in loaded dates`);
    this.status.setText(parts.join(' · '));
    if (this.infinite && this.viewport.clientHeight > 0) {
      this.weekdays.style.marginRight = `${this.viewport.offsetWidth - this.viewport.clientWidth}px`;
      if (targetAnchor) this.restoreAnchor(targetAnchor);
      this.pendingToday = false;
      this.layoutWidth = this.viewport.clientWidth;
      this.layoutHeight = this.viewport.clientHeight;
      this.updateScrollLabel();
    }
      const focusTarget = focusedNote
        ? [...this.grid.querySelectorAll<HTMLElement>('.jsc-note')].find(el => el.dataset.path === focusedNote.dataset.path && el.dataset.start === focusedNote.dataset.start)
        : focusedDay ? this.grid.querySelector<HTMLElement>(`[data-date="${focusedDay.dataset.date}"]`) : null;
      focusTarget?.focus({ preventScroll: true });
    } finally {
      this.rendering = false;
    }
  }

  private openElement(el: HTMLElement, mode: OpenMode = 'current'): void {
    const file = this.entries.get(el.dataset.path ?? '');
    if (file) void this.openFile(file, mode);
  }

  private renderNote(parent: HTMLElement, span: EventSpan, first: string, last: string, before = false, after = false): HTMLElement {
    const { entry, start, end, time, kind } = span;
    const titleProperty = this.config.getAsPropertyId('titleProperty');
    const colorProperty = this.config.getAsPropertyId('colorProperty');
    this.entries.set(entry.file.path, entry.file);
    const dates = span.movable ? this.moveDates(entry.file, start, end) : null;
    if (dates) this.moves.set(entry.file.path, dates);
    const note = parent.createDiv({ cls: 'jsc-note', attr: {
      role: 'link', tabindex: '0', 'data-path': entry.file.path,
      draggable: String(!!dates && !Platform.isMobile && !this.agenda), 'data-start': first, 'data-end': last,
    } });
    const label = note.createSpan({ cls: 'jsc-title' });
    this.renderTitle(label, titleProperty ? entry.getValue(titleProperty) : null, entry.file);
    if (!label.textContent?.trim()) label.setText(entry.file.basename);
    const title = label.textContent;
    if (time && (!this.linear || start !== end)) note.createSpan({ cls: 'jsc-time', text: time });
    const schedule = kind === 'repeat' ? 'Repeats - opens the same note' : kind === 'additional' ? 'Multiple dates - opens the same note' : '';
    note.title = `${title} - ${start === end ? start : `${start} through ${end}`}${time ? ` · ${time}` : ''}${schedule ? ` · ${schedule}` : ''}${span.warnings.length ? ` · ${span.warnings.join(' · ')}` : ''}`;
    note.setAttribute('aria-label', `${note.title}${before ? ' (continued)' : ''}`);
    note.toggleClass('jsc-repeating', kind === 'repeat');
    note.toggleClass('jsc-additional', kind === 'additional');
    note.toggleClass('jsc-schedule-warning', !!span.warnings.length);
    for (const link of note.querySelectorAll<HTMLElement>(TITLE_LINK)) {
      link.draggable = false; link.setAttribute('role', 'link'); link.tabIndex = 0;
      if (link.hasClass('internal-link')) {
        const path = parseLinktext(link.dataset.href ?? '').path;
        link.toggleClass('is-unresolved', !!path && !this.app.metadataCache.getFirstLinkpathDest(path, entry.file.path));
      }
    }
    if (this.linear && start === end) label.remove();
    if (!this.agenda && dates?.endProperty && dates.endProperty !== dates.startProperty && !after && !Platform.isMobile) {
      note.addClass('jsc-resizable');
      note.createSpan({ cls: 'jsc-resize-handle', attr: { draggable: 'true', 'aria-hidden': 'true', title: 'Drag to resize end date' } });
    }
    if (!this.agenda) {
      note.toggleClass('jsc-continues-before', before); note.toggleClass('jsc-continues-after', after);
    }
    note.toggleClass('jsc-multiday', start !== end);
    const colorValue = colorProperty ? entry.getValue(colorProperty) : null;
    const color = eventColor(colorValue instanceof StringValue ? colorValue.toString() : null);
    if (color) { note.style.setProperty('--jsc-event-color', color); note.addClass('jsc-colored'); }
    if (this.agenda) {
      if (schedule) note.createSpan({ cls: 'jsc-schedule-label', text: kind === 'repeat' ? 'Repeats · same note' : 'Multiple dates · same note' });
      if (start !== end) note.createSpan({ cls: 'jsc-schedule-label', text: `${start} - ${end}` });
      const menu = note.createEl('button', { cls: 'jsc-note-menu', attr: { type: 'button', 'aria-label': `Actions for ${title}`, 'data-jsc-action': 'menu' } });
      setIcon(menu, 'ellipsis');
    }
    return note;
  }

  private renderAgenda(days: Date[], spans: EventSpan[]): void {
    const format = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    this.title.setText(days.length === 1 ? format.format(days[0]) : `${format.format(days[0])} - ${format.format(days[days.length - 1])}`);
    const picker = this.root.querySelector<HTMLInputElement>('input[aria-label="Go to date"]');
    if (picker) picker.value = dayKey(this.shownMonth);
    this.help.setText('Choose day or week · open a note or use its actions · + creates a note on that day');
    const full = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    for (const date of days) {
      const day = dayKey(date);
      const section = this.grid.createEl('section', { cls: 'jsc-day jsc-agenda-day', attr: { 'data-date': day, 'aria-label': full.format(date), tabindex: '0' } });
      section.toggleClass('jsc-today', day === dayKey(new Date()));
      const header = section.createDiv({ cls: 'jsc-agenda-heading' });
      header.createEl('h4').createEl('time', { text: full.format(date), attr: { datetime: day } });
      const create = header.createEl('button', { attr: { type: 'button', 'aria-label': `Create note on ${day}`, 'data-jsc-action': 'create', 'data-date': day } });
      setIcon(create, 'plus');
      create.disabled = !this.writableDateProperty();
      const events = spans.filter(span => span.start <= day && span.end >= day).sort((a, b) => a.time.localeCompare(b.time));
      for (const span of events) this.renderNote(section, span, day, day);
      if (!events.length) section.createEl('p', { cls: 'jsc-agenda-empty', text: 'No events' });
    }
  }

  private async editSchedule(file: TFile, repeating: boolean): Promise<void> {
    try {
      const keys = ['dateProperty', 'endDateProperty', 'repeatProperty', 'repeatUntilProperty', 'repeatExceptProperty', 'additionalDatesProperty'];
      const config = keys.map(key => this.config.getAsPropertyId(key));
      const names = config.map(id => id && parsePropertyId(id).type === 'note' ? parsePropertyId(id).name : null);
      if (!names[0] || config.filter(Boolean).length !== new Set(config.filter(Boolean)).size) throw new Error('Choose different properties for the main date, end date and optional scheduling fields.');
      const source = await this.app.vault.read(file);
      const info = getFrontMatterInfo(source);
      const value: unknown = info.exists ? parseYaml(info.frontmatter) : {};
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Repair this note\'s properties before editing its dates.');
      const fm = value as Record<string, unknown>;
      const first = fm[names[0]];
      const firstDay = typeof first === 'string' ? parseDay(first) : null;
      if (!firstDay) throw new Error('Choose a writable main date property with a valid date.');
      const repeatValue = names[2] ? fm[names[2]] : undefined;
      const repeat = typeof repeatValue === 'string' ? repeatValue.trim() : repeatValue == null ? '' : 'Invalid repeat';
      if (repeating ? !repeatRule(repeat) : !!repeat || names[1] && fm[names[1]] && (typeof fm[names[1]] !== 'string' || parseDay(fm[names[1]] as string) !== firstDay)) {
        throw new Error(repeating ? 'Choose a valid repeat rule first.' : 'Additional dates are for a single-day note without repetition.');
      }
      const daysName = names[repeating ? 4 : 5];
      const untilName = repeating ? names[3] : null;
      if (!daysName && !untilName) throw new Error('Choose the optional scheduling properties in this Base view first. Formula properties are read-only.');
      const expected = names.filter((name): name is string => !!name).map(name => [name, JSON.stringify(fm[name])] as const);
      const path = file.path;
      if (this.disposed) return;
      this.scheduleEditor = new ScheduleModal(this.app, {
        title: repeating ? 'Repeat options' : 'Additional dates', firstDay, repeating,
        days: daysName ? fm[daysName] : undefined, until: untilName ? fm[untilName] : undefined,
        editDays: !!daysName, editUntil: !!untilName,
        save: async draft => {
          if (this.disposed || file.path !== path || keys.some((key, index) => this.config.getAsPropertyId(key) !== config[index])) throw new Error('The note or view configuration changed. Reopen this editor.');
          await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => {
            if (this.disposed || file.path !== path || keys.some((key, index) => this.config.getAsPropertyId(key) !== config[index])) throw new Error('The note or view configuration changed. Reopen this editor.');
            if (expected.some(([key, value]) => JSON.stringify(current[key]) !== value)) throw new Error('The schedule changed elsewhere. Your draft was kept; reopen the editor to use the new dates.');
            if (daysName) { if (draft.days.length) Object.defineProperty(current, daysName, { value: draft.days, enumerable: true, writable: true, configurable: true }); else delete current[daysName]; }
            if (untilName) { if (draft.until) Object.defineProperty(current, untilName, { value: draft.until, enumerable: true, writable: true, configurable: true }); else delete current[untilName]; }
          });
        },
      });
      this.scheduleEditor.open();
    } catch (error) { new Notice(error instanceof Error ? error.message : 'Could not open the date editor.'); }
  }

  private showMenu(el: HTMLElement, x: number, y: number): void {
    const file = this.entries.get(el.dataset.path ?? '');
    if (!file) return;
    const menu = new Menu()
      .addItem(item => item.setTitle('Open note').setIcon('file-text').onClick(() => this.openFile(file, 'current')))
      .addItem(item => item.setTitle('Open in new tab').setIcon('file-plus').onClick(() => this.openFile(file, 'tab')))
      .addItem(item => item.setTitle('Open to the right').setIcon('panel-right').onClick(() => this.openFile(file, 'right')));
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const repeatId = this.config.getAsPropertyId('repeatProperty');
    const repeat = repeatId && parsePropertyId(repeatId).type === 'note' ? String(fm?.[parsePropertyId(repeatId).name] ?? '').trim() : '';
    if (repeatRule(repeat) && (this.config.getAsPropertyId('repeatUntilProperty') || this.config.getAsPropertyId('repeatExceptProperty'))) {
      menu.addItem(item => item.setTitle('Repeat options…').setIcon('repeat').onClick(() => this.editSchedule(file, true)));
    }
    if (!repeat && this.config.getAsPropertyId('additionalDatesProperty')) {
      menu.addItem(item => item.setTitle('Additional dates…').setIcon('calendar-plus').onClick(() => this.editSchedule(file, false)));
    }
    menu.addSeparator()
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
    this.disposed = true;
    this.scheduleEditor?.close();
    this.hoverPopover?.unload();
    this.entries.clear();
    this.moves.clear();
    this.drag = null;
    this.root.remove();
  }
}
