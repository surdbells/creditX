import { Component, EventEmitter, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Searchable bank picker. Replaces the native <datalist>, which is unreliable
 * and confusing in mobile webviews. Tap to open, type to filter the (long)
 * Nigerian bank list, tap a row to select. Emits the bank name via
 * valueChange and the full {code,name} via selected.
 */
@Component({
  selector: 'cxm-bank-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cxbs" (focusout)="onFocusOut($event)">
      <input class="cxbs-input" type="text" [ngModel]="display()" (ngModelChange)="onType($event)"
             (focus)="onFocus()" [placeholder]="placeholder" autocomplete="off"
             autocorrect="off" autocapitalize="off" spellcheck="false" />
      <span class="cxbs-caret" [class.cxbs-caret-open]="open()">⌄</span>

      @if (open()) {
        <div class="cxbs-panel">
          @if (filtered().length === 0) {
            <div class="cxbs-empty">No bank matches “{{ query() }}”</div>
          } @else {
            @for (b of filtered(); track b.code) {
              <button type="button" class="cxbs-opt" [class.cxbs-opt-active]="b.name === value"
                      (mousedown)="pick(b, $event)">{{ b.name }}</button>
            }
            @if (more() > 0) {
              <div class="cxbs-more">+{{ more() }} more — keep typing to narrow</div>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .cxbs { position: relative; }
    .cxbs-input {
      width: 100%;
      padding: 10px 34px 10px 14px;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
    }
    .cxbs-input:focus { background: var(--cx-surface); border-color: var(--cx-primary-600); }
    .cxbs-caret {
      position: absolute; right: 12px; top: 50%; transform: translateY(-60%);
      font-size: 16px; color: var(--cx-text-secondary); pointer-events: none;
      transition: transform 0.15s ease;
    }
    .cxbs-caret-open { transform: translateY(-40%) rotate(180deg); }
    .cxbs-panel {
      position: absolute; z-index: 50; top: calc(100% + 4px); left: 0; right: 0;
      max-height: 260px; overflow-y: auto;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      -webkit-overflow-scrolling: touch;
    }
    .cxbs-opt {
      display: block; width: 100%; text-align: left;
      padding: 11px 14px; background: none; border: none;
      border-bottom: 1px solid var(--cx-border);
      font-size: var(--cx-text-sm); color: var(--cx-text); cursor: pointer;
    }
    .cxbs-opt:last-child { border-bottom: none; }
    .cxbs-opt:active { background: var(--cx-surface-2); }
    .cxbs-opt-active { color: var(--cx-primary-600); font-weight: 600; background: var(--cx-surface-2); }
    .cxbs-empty, .cxbs-more {
      padding: 11px 14px; font-size: var(--cx-text-xs); color: var(--cx-text-secondary);
    }
    .cxbs-more { text-align: center; border-top: 1px solid var(--cx-border); }
  `],
})
export class BankSelectComponent {
  private banksSig = signal<{ code: string; name: string }[]>([]);
  @Input() set banks(v: { code: string; name: string }[]) { this.banksSig.set(v || []); }

  private valueSig = signal('');
  @Input() set value(v: string) { this.valueSig.set(v || ''); }
  get value(): string { return this.valueSig(); }

  @Input() placeholder = 'Search bank…';
  @Output() valueChange = new EventEmitter<string>();
  @Output() selected = new EventEmitter<{ code: string; name: string }>();

  open = signal(false);
  query = signal('');
  private readonly LIMIT = 60;

  /** Text shown in the input: the live query while open, the selected value otherwise. */
  display = computed(() => (this.open() ? this.query() : this.valueSig()));

  private matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.banksSig();
    return q ? list.filter(b => b.name.toLowerCase().includes(q)) : list;
  });
  filtered = computed(() => this.matches().slice(0, this.LIMIT));
  more = computed(() => Math.max(0, this.matches().length - this.LIMIT));

  onFocus(): void { this.query.set(''); this.open.set(true); }
  onType(v: string): void { this.query.set(v); this.open.set(true); }

  pick(b: { code: string; name: string }, ev: Event): void {
    ev.preventDefault(); // keep focus stable; select before blur closes the panel
    this.value = b.name;
    this.open.set(false);
    this.valueChange.emit(b.name);
    this.selected.emit(b);
  }

  onFocusOut(ev: FocusEvent): void {
    // Close only when focus leaves the whole widget (not when moving to an option).
    const next = ev.relatedTarget as Node | null;
    if (next && (ev.currentTarget as HTMLElement).contains(next)) return;
    this.open.set(false);
  }
}
