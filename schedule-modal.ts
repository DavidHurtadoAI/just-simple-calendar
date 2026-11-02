import { Modal, Notice, Setting, type App } from 'obsidian';
import { DATE_LIST_LIMIT, dateList, parseDay } from './calendar';

export interface ScheduleDraft { until?: string; days: string[] }

/** Date pickers for the opt-in features; no rule syntax or YAML editing needed. */
export class ScheduleModal extends Modal {
  private days: string[];
  private until: string;
  private error!: HTMLElement;
  private list!: HTMLElement;
  private saving = false;

  constructor(app: App, private readonly options: {
    title: string;
    firstDay: string;
    repeating: boolean;
    days?: unknown;
    until?: unknown;
    editDays: boolean;
    editUntil: boolean;
    save: (draft: ScheduleDraft) => Promise<void>;
  }) {
    super(app);
    this.days = dateList(options.days).days;
    this.until = typeof options.until === 'string' ? options.until : '';
  }

  onOpen(): void {
    const o = this.options;
    this.setTitle(o.title);
    this.contentEl.addClass('jsc-schedule-editor');
    this.contentEl.createEl('p', { text: o.repeating
      ? 'These changes apply to this repeating note. Skipped dates omit occurrences starting on those days.'
      : 'The same note appears on its main date and on these additional days. No notes are duplicated.' });
    new Setting(this.contentEl).setName('Main date').setDesc(o.firstDay);
    if (o.editUntil) new Setting(this.contentEl)
      .setName('Repeat until').setDesc('Last allowed start date, included. Leave empty to keep repeating.')
      .addText(text => {
        text.inputEl.type = 'date'; text.inputEl.min = o.firstDay;
        text.inputEl.setAttribute('aria-label', 'Repeat until');
        text.setValue(this.until).onChange(value => { this.until = value; });
      });
    if (o.editDays) {
      if (o.repeating) this.contentEl.createEl('h4', { text: 'Skipped dates' });
      this.list = this.contentEl.createDiv({ cls: 'jsc-date-list' });
      this.renderDays();
      new Setting(this.contentEl).addButton(button => button.setButtonText('Add date').onClick(() => {
        if (this.saving || this.days.length >= DATE_LIST_LIMIT) return;
        this.days.push(''); this.renderDays();
        const inputs = this.list.querySelectorAll<HTMLInputElement>('input'); inputs[inputs.length - 1]?.focus();
      }));
    }
    this.error = this.contentEl.createEl('p', { cls: 'jsc-schedule-error', attr: { role: 'alert' } });
    const parsed = dateList(o.days);
    const rawUntil = o.until;
    const invalidUntil = rawUntil !== undefined && rawUntil !== null && rawUntil !== '' && (typeof rawUntil !== 'string' || parseDay(rawUntil) !== rawUntil);
    if (parsed.invalid || parsed.limited || invalidUntil) {
      this.error.setText('Some stored dates are invalid or exceed the 128-date limit. Repair them in the note before using this editor.');
      new Setting(this.contentEl).addButton(button => button.setButtonText('Close').onClick(() => this.close()));
      return;
    }
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(button => button.setButtonText('Save').setCta().onClick(() => { void this.submit(); }));
  }

  private renderDays(): void {
    this.list.empty();
    if (!this.days.length) this.list.createEl('p', { cls: 'jsc-empty-dates', text: this.options.repeating ? 'No dates skipped.' : 'No additional dates.' });
    this.days.forEach((day, index) => {
      const row = this.list.createDiv({ cls: 'jsc-date-row' });
      const input = row.createEl('input', { type: 'date', value: day, attr: { 'aria-label': `${this.options.repeating ? 'Skipped' : 'Additional'} date ${index + 1}` } });
      input.addEventListener('change', () => { if (!this.saving) this.days[index] = input.value; });
      const remove = row.createEl('button', { text: 'Remove', attr: { type: 'button', 'aria-label': `Remove date ${index + 1}` } });
      remove.addEventListener('click', () => { if (!this.saving) { this.days.splice(index, 1); this.renderDays(); } });
    });
  }

  private async submit(): Promise<void> {
    if (this.saving) return;
    if (this.days.some(day => !day || parseDay(day) !== day)) { this.error.setText('Choose a date for each row, or remove the empty row.'); return; }
    if (this.options.editUntil && this.until && (parseDay(this.until) !== this.until || this.until < this.options.firstDay)) {
      this.error.setText('Choose an end date on or after the main date.'); return;
    }
    const days = dateList(this.days).days.filter(day => this.options.repeating || day !== this.options.firstDay);
    this.saving = true;
    this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(el => { el.disabled = true; });
    try {
      await this.options.save({ days, ...(this.options.editUntil ? { until: this.until } : {}) });
      this.close();
    } catch (error) {
      this.error.setText(error instanceof Error ? error.message : 'Could not save these dates.');
      new Notice('The dates were not saved. Review the message in the editor.');
    } finally {
      this.saving = false;
      this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(el => { el.disabled = false; });
    }
  }

  onClose(): void { this.contentEl.empty(); }
}
