import { Component, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { FontScaleService } from '../../../core/services/font-scale.service';

/**
 * CxFontScaleControl — 5-step font size slider.
 *
 * Designed for the admin topbar. Click trigger button to open popover,
 * slide to adjust. Updates apply instantly + persist to backend (debounced).
 *
 * Usage: <cx-font-scale-control></cx-font-scale-control>
 */
@Component({
  selector: 'cx-font-scale-control',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cx-fsc-root">
      <button class="cx-fsc-trigger" [class.is-open]="open()" (click)="toggle($event)" aria-label="Adjust font size"
              [title]="'Font size: ' + currentLabel()">
        <lucide-icon name="a-large-small" [size]="16"></lucide-icon>
        <span class="cx-fsc-trigger-label">{{ currentLabel() }}</span>
      </button>
      @if (open()) {
        <div class="cx-fsc-popover" (click)="$event.stopPropagation()">
          <div class="cx-fsc-header">
            <div class="cx-fsc-title">Text size</div>
            <button class="cx-fsc-reset" (click)="reset()" title="Reset to default">Reset</button>
          </div>
          <div class="cx-fsc-slider-row">
            <span class="cx-fsc-end-label cx-fsc-end-xs">A</span>
            <input type="range"
                   class="cx-fsc-slider"
                   min="0" max="4" step="1"
                   [value]="currentIndex()"
                   (input)="onSlide($event)"
                   aria-label="Font size" />
            <span class="cx-fsc-end-label cx-fsc-end-xl">A</span>
          </div>
          <div class="cx-fsc-steps">
            @for (opt of options; track opt.step; let i = $index) {
              <button class="cx-fsc-step"
                      [class.is-active]="i === currentIndex()"
                      (click)="setStep(i)"
                      [attr.aria-pressed]="i === currentIndex()">
                {{ opt.label }}
              </button>
            }
          </div>
          <div class="cx-fsc-preview">
            <div class="cx-fsc-preview-sample">Sample text renders at this size</div>
          </div>
        </div>
      }
    </div>
  `,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  styles: [`
    .cx-fsc-root { position: relative; display: inline-block; }

    .cx-fsc-trigger {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 0.4rem 0.7rem;
      background: transparent;
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-secondary);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-fsc-trigger:hover {
      background: var(--cx-surface-hover);
      color: var(--cx-text);
      border-color: var(--cx-border-strong);
    }
    .cx-fsc-trigger.is-open {
      background: var(--cx-primary-50);
      color: var(--cx-primary-700);
      border-color: var(--cx-primary-200);
    }
    .cx-fsc-trigger-label {
      font-variant-numeric: tabular-nums;
      min-width: 1.5em; text-align: center;
    }

    .cx-fsc-popover {
      position: absolute; top: calc(100% + 6px); right: 0;
      z-index: var(--cx-z-dropdown);
      min-width: 280px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      box-shadow: var(--cx-shadow-lg);
      padding: 0.85rem;
      animation: cx-fsc-in var(--cx-dur-base) var(--cx-ease-premium);
    }
    @keyframes cx-fsc-in {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .cx-fsc-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 0.85rem;
    }
    .cx-fsc-title {
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--cx-text-muted);
    }
    .cx-fsc-reset {
      background: transparent; border: none;
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-primary-600);
      cursor: pointer;
      padding: 2px 6px;
      border-radius: var(--cx-radius-xs);
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-fsc-reset:hover { background: var(--cx-primary-50); }

    .cx-fsc-slider-row {
      display: flex; align-items: center; gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .cx-fsc-end-label {
      color: var(--cx-text-muted);
      font-weight: 500;
      font-family: var(--cx-font-sans);
      flex-shrink: 0;
      user-select: none;
    }
    .cx-fsc-end-xs { font-size: 12px; }
    .cx-fsc-end-xl { font-size: 22px; }

    .cx-fsc-slider {
      flex: 1;
      -webkit-appearance: none; appearance: none;
      height: 4px;
      background: var(--cx-stone-200);
      border-radius: var(--cx-radius-pill);
      outline: none;
      cursor: pointer;
    }
    .cx-fsc-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 18px; height: 18px;
      background: var(--cx-primary-600);
      border: 2px solid var(--cx-surface);
      border-radius: 50%;
      cursor: grab;
      box-shadow: var(--cx-shadow-sm);
      transition: transform var(--cx-dur-fast) var(--cx-ease-premium), box-shadow var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-fsc-slider::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: var(--cx-shadow-md); }
    .cx-fsc-slider::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.1); }
    .cx-fsc-slider::-moz-range-thumb {
      width: 18px; height: 18px;
      background: var(--cx-primary-600);
      border: 2px solid var(--cx-surface);
      border-radius: 50%;
      cursor: grab;
      box-shadow: var(--cx-shadow-sm);
    }

    .cx-fsc-steps {
      display: flex; justify-content: space-between; gap: 4px;
      padding: 0 2px;
      margin-bottom: 0.85rem;
    }
    .cx-fsc-step {
      flex: 1;
      background: transparent; border: 1px solid transparent;
      padding: 4px 6px;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-muted);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-fsc-step:hover { background: var(--cx-surface-hover); color: var(--cx-text-secondary); }
    .cx-fsc-step.is-active {
      background: var(--cx-primary-50);
      color: var(--cx-primary-700);
      border-color: var(--cx-primary-200);
    }

    .cx-fsc-preview {
      padding: 0.75rem;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      border: 1px solid var(--cx-border-subtle);
    }
    .cx-fsc-preview-sample {
      font-size: var(--cx-text-base);
      color: var(--cx-text);
      line-height: 1.5;
    }
  `],
})
export class FontScaleControlComponent {
  readonly options = FontScaleService.OPTIONS;

  open = signal(false);
  currentIndex = computed(() => {
    const step = this.fs.currentStep();
    return this.options.findIndex(o => o.step === step);
  });
  currentLabel = computed(() => {
    const idx = this.currentIndex();
    return idx >= 0 ? this.options[idx].label : 'M';
  });

  constructor(private fs: FontScaleService) {}

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open.update(v => !v);
  }

  setStep(index: number): void {
    const opt = this.options[index];
    if (opt) this.fs.setStep(opt.step);
  }

  onSlide(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.setStep(val);
  }

  reset(): void {
    this.fs.reset();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const root = (event.target as HTMLElement).closest('.cx-fsc-root');
    if (!root) this.open.set(false);
  }
}
