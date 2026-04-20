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
    <div class="relative">
      <div class="cx-input flex items-center cursor-pointer select-none"
           [class.!border-[var(--cx-primary)]]="open()"
           (click)="toggleOpen($event)">
        <span class="flex-1 truncate" [class.text-[var(--cx-text-muted)]]="!selectedLabel()">
          {{ selectedLabel() || placeholder }}
        </span>
        <lucide-icon name="chevron-down" [size]="14" class="text-[var(--cx-text-muted)] flex-shrink-0 ml-2 transition-transform"
                     [class.rotate-180]="open()"></lucide-icon>
      </div>
      @if (open()) {
        <div class="absolute z-[9999] w-full mt-1 cx-card p-0 shadow-xl overflow-hidden cx-animate-in"
             style="min-width:200px"
             (click)="$event.stopPropagation()">
          <div class="p-2 border-b border-[var(--cx-border)]">
            <input type="text" class="cx-input !text-sm w-full" placeholder="Search..."
                   [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)"
                   (click)="$event.stopPropagation()" />
          </div>
          <div class="overflow-y-auto max-h-48">
            @if (clearable) {
              <div class="px-3 py-2 cursor-pointer text-sm text-[var(--cx-text-muted)] hover:bg-[var(--cx-surface-hover)]"
                   (click)="selectOption(null)">— None —</div>
            }
            @for (opt of filteredOptions(); track opt.value) {
              <div class="px-3 py-2 cursor-pointer text-sm transition-colors"
                   [class]="opt.value === selectedValue() ? 'bg-[var(--cx-primary)] text-white font-medium' : 'hover:bg-[var(--cx-surface-hover)]'"
                   (click)="selectOption(opt)">
                <div>{{ opt.label }}</div>
                @if (opt.sublabel) { <div class="text-xs opacity-70 mt-0.5">{{ opt.sublabel }}</div> }
              </div>
            } @empty {
              <div class="px-3 py-4 text-center text-sm text-[var(--cx-text-muted)]">No options found</div>
            }
          </div>
        </div>
      }
    </div>
  `,
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
