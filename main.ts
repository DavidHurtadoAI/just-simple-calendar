import {
  BasesView, DateValue, Menu, Notice, NullValue, Platform, Plugin, parsePropertyId, setIcon,
  type BasesEntry, type HoverParent, type HoverPopover, type QueryController,
  type TFile, type WorkspaceLeaf,
} from 'obsidian';
import { dateRange, dayKey, layoutWeek, localDate, monthDays, parseDay } from './calendar';

const VIEW_TYPE = 'just-simple-calendar';

export default class JustSimpleCalendar extends Plugin {
  onload(): void {
    this.registerHoverLinkSource(VIEW_TYPE, { display: 'Just Simple Calendar', defaultMod: false });
    this.registerBasesView(VIEW_TYPE, {
      name: 'Simple Calendar',
      icon: 'calendar-days',
      factory: (controller, containerEl) => new CalendarView(controller, containerEl),
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
  readonly type = VIEW_TYPE;
  hoverPopover: HoverPopover | null = null;
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly status: HTMLElement;
  private readonly help: HTMLElement;
  private shownMonth = localDate(new Date().getFullYear(), new Date().getMonth(), 1);
  private entries = new Map<string, TFile>();
  private rightLeaf: WorkspaceLeaf | null = null;
  private creatingNote = false;

  constructor(controller: QueryController, parentEl: HTMLElement) {
    super(controller);
    this.root = parentEl.createDiv({ cls: 'jsc-calendar' });
    const toolbar = this.root.createDiv({ cls: 'jsc-toolbar' });
    this.title = toolbar.createEl('h3', { cls: 'jsc-month', attr: { 'aria-live': 'polite' } });
    const nav = toolbar.createDiv({ cls: 'jsc-navigation' });
    this.addButton(nav, 'Previous year', 'chevrons-left', () => this.moveMonth(-12));
    this.addButton(nav, 'Previous month', 'chevron-left', () => this.moveMonth(-1));
    const today = nav.createEl('button', { text: 'Today', attr: { type: 'button' } });
    this.registerDomEvent(today, 'click', () => {
      this.shownMonth = localDate(new Date().getFullYear(), new Date().getMonth(), 1);
      this.render();
    });
    this.addButton(nav, 'Next month', 'chevron-right', () => this.moveMonth(1));
    this.addButton(nav, 'Next year', 'chevrons-right', () => this.moveMonth(12));
    this.grid = this.root.createDiv({ cls: 'jsc-grid' });
    this.status = this.root.createDiv({ cls: 'jsc-status', attr: { role: 'status' } });
    this.help = this.root.createDiv({ cls: 'jsc-help' });

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

  private render(): void {
    if (!this.data || !this.config) return;
    const property = this.config.getAsPropertyId('dateProperty');
    const endProperty = this.config.getAsPropertyId('endDateProperty');
    const titleProperty = this.config.getAsPropertyId('titleProperty');
    const weekStart = this.config.get('weekStart') === '0' ? 0 : 1;
    const month = this.shownMonth.getMonth();
    const year = this.shownMonth.getFullYear();
    this.title.setText(new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(this.shownMonth));
    this.grid.empty();
    this.entries.clear();
    this.help.setText(Platform.isMobile ? 'Tap a note to open it · Long-press a day to create a note' : 'Hover to preview · Double-click a note to open, or an empty space to create · Right-click for more');
    this.root.toggleClass('jsc-unconfigured', !property);
    if (!property) {
      this.status.setText('Choose a date property in the view settings to display your notes.');
      return;
    }
    const days = monthDays(year, month, weekStart);
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
    for (const date of days.slice(0, 7)) {
      this.grid.createDiv({ cls: 'jsc-weekday', text: weekdayFormat.format(date) });
    }
    const todayKey = dayKey(new Date());
    const fullDateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'full' });
    for (let offset = 0; offset < days.length; offset += 7) {
      const weekDays = days.slice(offset, offset + 7);
      const keys = weekDays.map(dayKey);
      const segments = layoutWeek(spans, keys);
      const lanes = segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
      const week = this.grid.createDiv({cls: 'jsc-week'});
      week.style.gridTemplateRows = `34px ${lanes ? `repeat(${lanes}, 30px) ` : ''}minmax(12px, 1fr)`;
      weekDays.forEach((date, column) => {
        const key = dayKey(date);
        const cell = week.createEl('section', { cls: 'jsc-day', attr: { 'aria-label': fullDateFormat.format(date), 'data-date': key, tabindex: '0' } });
        cell.style.gridColumn = String(column + 1);
        cell.toggleClass('jsc-outside', date.getMonth() !== month);
        cell.toggleClass('jsc-today', key === todayKey);
        const number = cell.createEl('time', { cls: 'jsc-day-number', text: String(date.getDate()), attr: { datetime: key } });
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
        note.style.gridColumn = `${segment.column + 1} / span ${segment.length}`;
        note.style.gridRow = String(segment.lane + 2);
        note.toggleClass('jsc-continues-before', segment.continuesBefore);
        note.toggleClass('jsc-continues-after', segment.continuesAfter);
        note.toggleClass('jsc-multiday', start !== end);
      }
    }
    const parts = [this.config.getDisplayName(property), `${inMonth} ${inMonth === 1 ? 'note' : 'notes'} this month`];
    if (endProperty) parts.push(`End: ${this.config.getDisplayName(endProperty)}`);
    if (undated) parts.push(`${undated} without a valid date`);
    if (invalidEnds) parts.push(`${invalidEnds} with an invalid end date (shown on start date)`);
    this.status.setText(parts.join(' · '));
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
