import {
  BasesView, DateValue, Menu, Notice, NullValue, Platform, Plugin, parsePropertyId, setIcon,
  type BasesEntry, type HoverParent, type HoverPopover, type QueryController,
  type TFile, type WorkspaceLeaf,
} from 'obsidian';
import { addDays, dateRange, dayKey, layoutWeek, localDate, monthDays, parseDay, startOfWeek, weekWindow } from './calendar';

const VIEW_TYPE = 'just-simple-calendar';
const INFINITE_VIEW_TYPE = 'just-simple-calendar-infinite';
type ScrollAnchor = { day: string; offset: number };

export default class JustSimpleCalendar extends Plugin {
  onload(): void {
    this.registerHoverLinkSource(VIEW_TYPE, { display: 'Just Simple Calendar', defaultMod: false });
    for (const infinite of [false, true]) this.registerBasesView(infinite ? INFINITE_VIEW_TYPE : VIEW_TYPE, {
      name: infinite ? 'Infinite Calendar' : 'Simple Calendar',
      icon: 'calendar-days',
      factory: (controller, containerEl) => new CalendarView(controller, containerEl, infinite),
      options: () => [
        { type: 'property', key: 'dateProperty', displayName: 'Date property', placeholder: 'Choose a date property' },
        { type: 'property', key: 'endDateProperty', displayName: 'End date property (optional)', placeholder: 'None — single-day notes' },
        { type: 'property', key: 'titleProperty', displayName: 'Title property (optional)', placeholder: 'File name' },
        { type: 'dropdown', key: 'weekStart', displayName: 'First day of week', default: '1', options: { '1': 'Monday', '0': 'Sunday' } },
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

  constructor(controller: QueryController, parentEl: HTMLElement, private readonly infinite = false) {
    super(controller);
    this.type = infinite ? INFINITE_VIEW_TYPE : VIEW_TYPE;
    this.root = parentEl.createDiv({ cls: 'jsc-calendar' });
    this.root.toggleClass('jsc-infinite', infinite);
    const toolbar = this.root.createDiv({ cls: 'jsc-toolbar' });
    this.title = toolbar.createEl('h3', { cls: 'jsc-month', attr: { 'aria-live': 'polite' } });
    const nav = toolbar.createDiv({ cls: 'jsc-navigation' });
    if (!infinite) {
      this.addButton(nav, 'Previous year', 'chevrons-left', () => this.moveMonth(-12));
      this.addButton(nav, 'Previous month', 'chevron-left', () => this.moveMonth(-1));
    }
    const today = nav.createEl('button', { text: 'Today', attr: { type: 'button' } });
    this.registerDomEvent(today, 'click', () => {
      this.shownMonth = localDate(new Date().getFullYear(), new Date().getMonth(), 1);
      this.pendingToday = true;
      this.render();
    });
    if (!infinite) {
      this.addButton(nav, 'Next month', 'chevron-right', () => this.moveMonth(1));
      this.addButton(nav, 'Next year', 'chevrons-right', () => this.moveMonth(12));
    }
    this.weekdays = infinite ? this.root.createDiv({ cls: 'jsc-weekdays' }) : this.root;
    this.viewport = infinite ? this.root.createDiv({ cls: 'jsc-viewport', attr: { tabindex: '0', 'aria-label': 'Scrollable calendar weeks' } }) : this.root;
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
      if (!el || Platform.isMobile || (this.isNode(event.relatedTarget) && el.contains(event.relatedTarget))) return;
      const file = this.entries.get(el.dataset.path ?? '');
      if (!file) return;
      this.app.workspace.trigger('hover-link', {
        event, source: VIEW_TYPE, hoverParent: this, targetEl: el,
        linktext: file.path, sourcePath: file.path,
      });
    });
    this.registerDomEvent(this.grid, 'click', (event) => {
      const el = this.noteElement(event.target);
      if (!el) return;
      event.preventDefault();
      if (Platform.isMobile) this.openElement(el);
    });
    this.registerDomEvent(this.grid, 'dblclick', (event) => {
      const el = this.noteElement(event.target);
      if (Platform.isMobile) return;
      event.preventDefault();
      if (el) this.openElement(el);
      else {
        const day = this.dayElement(event.target)?.dataset.date;
        if (day) void this.createNote(day);
      }
    });
    // Handle focused calendar keys before Bases' document-level shortcuts.
    this.registerDomEvent(this.root.win, 'keydown', (event) => {
      if (!this.isNode(event.target) || !this.grid.contains(event.target)) return;
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
    });
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
    if (!this.data || !this.config) return;
    const anchor = this.infinite ? savedAnchor ?? this.captureAnchor() : null;
    const active = this.infinite ? this.root.doc.activeElement : null;
    const focusedNote = active && this.grid.contains(active) ? this.noteElement(active) : null;
    const focusedDay = active && this.grid.contains(active) ? this.dayElement(active) : null;
    this.rendering = true;
    try {
    const property = this.config.getAsPropertyId('dateProperty');
    const endProperty = this.config.getAsPropertyId('endDateProperty');
    const titleProperty = this.config.getAsPropertyId('titleProperty');
    const weekStart = this.config.get('weekStart') === '0' ? 0 : 1;
    const month = this.shownMonth.getMonth();
    const year = this.shownMonth.getFullYear();
    this.title.setText(new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(this.shownMonth));
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
    this.help.setText(Platform.isMobile ? 'Tap a note to open it · Long-press a day to create a note' : 'Hover to preview · Double-click a note to open, or an empty space to create · Right-click for more');
    this.root.toggleClass('jsc-unconfigured', !property);
    if (!property) {
      this.status.setText('Choose a date property in the view settings to display your notes.');
      return;
    }
    const days = this.infinite
      ? weekWindow(this.firstWeek!, Math.max(40, Math.ceil(this.viewport.clientHeight / 90) + 24))
      : monthDays(year, month, weekStart);
    const monthFirst = dayKey(localDate(year, month, 1));
    const monthLast = dayKey(localDate(year, month + 1, 0));
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
    for (const date of days.slice(0, 7)) {
      (this.infinite ? this.weekdays : this.grid).createDiv({ cls: 'jsc-weekday', text: weekdayFormat.format(date) });
    }
    const todayKey = dayKey(new Date());
    const fullDateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'full' });
    for (let offset = 0; offset < days.length; offset += 7) {
      const weekDays = days.slice(offset, offset + 7);
      const keys = weekDays.map(dayKey);
      const segments = layoutWeek(spans, keys);
      const lanes = segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
      const week = this.grid.createDiv({cls: 'jsc-week', attr: { 'data-week': keys[0] }});
      week.style.gridTemplateRows = `34px ${lanes ? `repeat(${lanes}, 30px) ` : ''}minmax(12px, 1fr)`;
      if (this.infinite) {
        const boundary = weekDays.find(date => date.getDate() === 1);
        const labelDate = boundary ?? (offset === 0 ? weekDays[0] : null);
        week.createDiv({ cls: 'jsc-month-rail', text: labelDate ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(labelDate) : '' });
      }
      weekDays.forEach((date, column) => {
        const key = dayKey(date);
        const cell = week.createEl('section', { cls: 'jsc-day', attr: { 'aria-label': fullDateFormat.format(date), 'data-date': key, tabindex: '0' } });
        cell.style.gridColumn = String(column + (this.infinite ? 2 : 1));
        cell.toggleClass('jsc-outside', !this.infinite && date.getMonth() !== month);
        cell.toggleClass('jsc-today', key === todayKey);
        const number = cell.createEl('time', { cls: 'jsc-day-number', text: this.infinite && date.getDate() === 1 ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date) : String(date.getDate()), attr: { datetime: key } });
        if (key === todayKey) number.setAttribute('aria-current', 'date');
      });
      for (const segment of segments) {
        const {entry, start, end} = spans[segment.index];
        const titleValue = titleProperty ? entry.getValue(titleProperty) : null;
        const title = (titleValue && !(titleValue instanceof NullValue) ? titleValue.toString().trim() : '') || entry.file.basename;
        this.entries.set(entry.file.path, entry.file);
        const note = week.createEl('a', {
          cls: 'jsc-note', text: title,
          attr: { href: entry.file.path, 'data-path': entry.file.path,
            'data-start': keys[segment.column], 'data-end': keys[segment.column + segment.length - 1],
            'aria-label': `${title} — ${start === end ? start : `${start} through ${end}`}${segment.continuesBefore ? ' (continued)' : ''}` },
        });
        note.style.gridColumn = `${segment.column + (this.infinite ? 2 : 1)} / span ${segment.length}`;
        note.style.gridRow = String(segment.lane + 2);
        note.toggleClass('jsc-continues-before', segment.continuesBefore);
        note.toggleClass('jsc-continues-after', segment.continuesAfter);
        note.toggleClass('jsc-multiday', start !== end);
      }
    }
    const count = this.infinite ? spans.length : inMonth;
    const parts = [this.config.getDisplayName(property), `${count} ${count === 1 ? 'note' : 'notes'} ${this.infinite ? 'in loaded weeks' : 'this month'}`];
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

  private openElement(el: HTMLElement): void {
    const file = this.entries.get(el.dataset.path ?? '');
    if (file) void this.openFile(file, 'current');
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

  private async openFile(file: TFile, mode: 'current' | 'tab' | 'right'): Promise<void> {
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
    this.root.remove();
  }
}
