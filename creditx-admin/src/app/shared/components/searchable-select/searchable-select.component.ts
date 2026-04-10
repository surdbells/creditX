import { Component, Input, Output, EventEmitter, signal, computed, forwardRef, OnInit } from '@angular/core';
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
    <div class="relative" (clickOutside)="open.set(false)">
      <div class="cx-input flex items-center cursor-pointer" [class.!border-[var(--cx-primary)]]="open()" (click)="open.set(!open())">
        <span class="flex-1 truncate" [class.text-[var(--cx-text-muted)]]="!selectedLabel()">
          {{ selectedLabel() || placeholder }}
        </span>
        <lucide-icon name="chevron-down" [size]="14" class="text-[var(--cx-text-muted)] flex-shrink-0 ml-2"
                     [class.rotate-180]="open()"></lucide-icon>
      </div>
      @if (open()) {
        <div class="absolute z-50 w-full mt-1 cx-card p-0 shadow-lg max-h-60 overflow-hidden cx-animate-in">
          <div class="p-2 border-b border-[var(--cx-border)]">
            <input type="text" class="cx-input !text-sm" placeholder="Search..." [(ngModel)]="searchTerm"
                   (click)="$event.stopPropagation()" />
          </div>
          <div class="overflow-y-auto max-h-48">
            @if (clearable) {
              <div class="px-3 py-2 cursor-pointer text-sm text-[var(--cx-text-muted)] hover:bg-[var(--cx-surface-hover)]"
                   (click)="selectOption(null)">
                — None —
              </div>
            }
            @for (opt of filteredOptions(); track opt.value) {
              <div class="px-3 py-2 cursor-pointer text-sm hover:bg-[var(--cx-surface-hover)] transition-colors"
                   [class.bg-[var(--cx-primary-50)]]="opt.value === selectedValue"
                   [class.font-medium]="opt.value === selectedValue"
                   (click)="selectOption(opt)">
                <div class="text-[var(--cx-text)]">{{ opt.label }}</div>
                @if (opt.sublabel) { <div class="text-xs text-[var(--cx-text-muted)]">{{ opt.sublabel }}</div> }
              </div>
            } @empty {
              <div class="px-3 py-4 text-center text-sm text-[var(--cx-text-muted)]">No options found</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class SearchableSelectComponent implements ControlValueAccessor {
  @Input() options: SelectOption[] = [];
  @Input() placeholder = 'Select...';
  @Input() clearable = false;

  open = signal(false);
  searchTerm = '';
  selectedValue: string | null = null;

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  filteredOptions = computed(() => {
    const term = this.searchTerm.toLowerCase();
    if (!term) return this.options;
    return this.options.filter(o => o.label.toLowerCase().includes(term) || (o.sublabel?.toLowerCase().includes(term) ?? false));
  });

  selectedLabel = computed(() => {
    const opt = this.options.find(o => o.value === this.selectedValue);
    return opt?.label ?? '';
  });

  selectOption(opt: SelectOption | null): void {
    this.selectedValue = opt?.value ?? null;
    this.onChange(this.selectedValue);
    this.open.set(false);
    this.searchTerm = '';
  }

  onDocumentClick(event: Event): void {
    // Close dropdown when clicking outside handled by host listener
  }

  writeValue(value: string | null): void { this.selectedValue = value; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}
