import { Component, Input, signal, computed, forwardRef, ElementRef, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

@Component({
  selector: 'cx-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchableSelectComponent), multi: true }],
  template: `
    <div class="cx-ssel-root">
      <div class="cx-ssel-trigger"
           [class.is-open]="open()"
           [class.has-value]="!!selectedLabel()"
           (click)="toggleOpen($event)">
        <span class="cx-ssel-label">
          {{ selectedLabel() || placeholder }}
        </span>
        <lucide-icon name="chevron-down" [size]="14" class="cx-ssel-chev"
                     [class.is-open]="open()"></lucide-icon>
      </div>
      @if (open()) {
        <div class="cx-ssel-panel" (click)="$event.stopPropagation()">
          <div class="cx-ssel-search">
            <lucide-icon name="search" [size]="14" class="cx-ssel-search-icon"></lucide-icon>
            <input type="text" class="cx-ssel-search-input" placeholder="Search..."
                   [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)"
                   (click)="$event.stopPropagation()" />
          </div>
          <div class="cx-ssel-list">
            @if (clearable) {
              <button class="cx-ssel-item cx-ssel-item-clear" (click)="selectOption(null)">
                <lucide-icon name="x-circle" [size]="14"></lucide-icon>
                <span>Clear selection</span>
              </button>
            }
            @for (opt of filteredOptions(); track opt.value) {
              <button class="cx-ssel-item" [class.is-selected]="opt.value === selectedValue()"
                   (click)="selectOption(opt)">
                <div class="cx-ssel-item-text">
                  <div class="cx-ssel-item-label">{{ opt.label }}</div>
                  @if (opt.sublabel) { <div class="cx-ssel-item-sublabel">{{ opt.sublabel }}</div> }
                </div>
                @if (opt.value === selectedValue()) {
                  <lucide-icon name="check" [size]="14" class="cx-ssel-check"></lucide-icon>
                }
              </button>
            } @empty {
              <div class="cx-ssel-empty">No options found</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-ssel-root { position: relative; }
    .cx-ssel-trigger {
      display: flex; align-items: center;
      padding: 0.55rem 0.85rem;
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      cursor: pointer; user-select: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-ssel-trigger:hover:not(.is-open) { border-color: var(--cx-border-strong); }
    .cx-ssel-trigger.is-open {
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }
    .cx-ssel-label {
      flex: 1;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--cx-text-muted);
    }
    .cx-ssel-trigger.has-value .cx-ssel-label { color: var(--cx-text); }
    .cx-ssel-chev {
      color: var(--cx-text-muted);
      flex-shrink: 0; margin-left: 0.5rem;
      transition: transform var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-ssel-chev.is-open { transform: rotate(180deg); }
    .cx-ssel-panel {
      position: absolute; z-index: var(--cx-z-dropdown);
      top: calc(100% + 4px); left: 0; right: 0;
      min-width: 200px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      box-shadow: var(--cx-shadow-lg);
      overflow: hidden;
      animation: cx-ssel-in var(--cx-dur-base) var(--cx-ease-premium);
    }
    @keyframes cx-ssel-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .cx-ssel-search {
      position: relative;
      padding: 0.5rem;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-ssel-search-icon {
      position: absolute; left: 1rem; top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted);
      pointer-events: none;
    }
    .cx-ssel-search-input {
      width: 100%;
      padding: 0.4rem 0.65rem 0.4rem 2rem;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-ssel-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-border);
    }
    .cx-ssel-list {
      overflow-y: auto; max-height: 14rem;
      padding: 0.25rem;
    }
    .cx-ssel-item {
      display: flex; align-items: center; justify-content: space-between;
      gap: 0.5rem;
      width: 100%;
      padding: 0.5rem 0.65rem;
      background: transparent; border: none;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      cursor: pointer;
      text-align: left;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-ssel-item:hover { background: var(--cx-surface-hover); }
    .cx-ssel-item.is-selected {
      background: var(--cx-primary-50);
      color: var(--cx-primary-700);
      font-weight: 500;
    }
    .cx-ssel-item.is-selected:hover { background: var(--cx-primary-100); }
    .cx-ssel-item-text { flex: 1; min-width: 0; }
    .cx-ssel-item-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cx-ssel-item-sublabel {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cx-ssel-item.is-selected .cx-ssel-item-sublabel { color: var(--cx-primary-600); opacity: 0.8; }
    .cx-ssel-check { color: var(--cx-primary-600); flex-shrink: 0; }
    .cx-ssel-item-clear {
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-sm) var(--cx-radius-sm) 0 0;
    }
    .cx-ssel-empty {
      padding: 1.25rem 1rem;
      text-align: center;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
  `],
})
export class SearchableSelectComponent implements ControlValueAccessor {
  @Input() set options(val: SelectOption[]) { this._options.set(val ?? []); }
  @Input() placeholder = 'Select...';
  @Input() clearable = false;

  private el = inject(ElementRef);
  private _options = signal<SelectOption[]>([]);
  open = signal(false);
  searchTerm = signal('');
  private _selectedValue = signal<string | null>(null);

  private onChange: (v: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  filteredOptions = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const opts = this._options();
    if (!term) return opts;
    return opts.filter(o => o.label.toLowerCase().includes(term) || (o.sublabel?.toLowerCase().includes(term) ?? false));
  });

  selectedLabel = computed(() => this._options().find(o => o.value === this._selectedValue())?.label ?? '');
  selectedValue = computed(() => this._selectedValue());

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.el.nativeElement.contains(e.target)) this.open.set(false);
  }

  toggleOpen(e: MouseEvent): void {
    e.stopPropagation();
    const wasOpen = this.open();
    this.open.set(!wasOpen);
    if (!wasOpen) this.searchTerm.set('');
    this.onTouched();
  }

  selectOption(opt: SelectOption | null): void {
    this._selectedValue.set(opt?.value ?? null);
    this.onChange(this._selectedValue());
    this.open.set(false);
    this.searchTerm.set('');
  }

  writeValue(v: string | null): void { this._selectedValue.set(v ?? null); }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}
