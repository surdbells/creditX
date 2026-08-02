import { Directive, DoCheck, ElementRef, OnDestroy, AfterViewInit, inject, NgZone } from '@angular/core';

/**
 * Makes every native <select> searchable without changing any template markup
 * or binding. It hides the native control and overlays a premium searchable
 * dropdown, but DRIVES the underlying <select> (sets selectedIndex + dispatches
 * a native change event) so Angular's SelectControlValueAccessor keeps working
 * unchanged — including [(ngModel)], [ngValue] objects/numbers, (change)
 * handlers, and reactive forms.
 *
 * Usage: add `SearchableSelectDirective` to a component's `imports` and every
 * <select> in that component becomes searchable. Opt a single select out with
 * `data-no-search`.
 */
@Directive({
  selector: 'select:not([multiple]):not([data-no-search])',
  standalone: true,
})
export class SearchableSelectDirective implements AfterViewInit, DoCheck, OnDestroy {
  private select = inject(ElementRef).nativeElement as HTMLSelectElement;
  private zone = inject(NgZone);

  private trigger!: HTMLDivElement;
  private labelEl!: HTMLSpanElement;
  private panel: HTMLDivElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private optionMo?: MutationObserver;
  private attrMo?: MutationObserver;
  private destroyed = false;
  /** Last value we painted, so ngDoCheck only repaints on a real change. */
  private lastValue: string | null = null;

  ngAfterViewInit(): void {
    // Run all DOM plumbing outside Angular to avoid extra change detection.
    this.zone.runOutsideAngular(() => {
      SearchableSelectDirective.injectStylesOnce();

      // Capture the native select's constrained width (e.g. a toolbar
      // `max-width`) BEFORE hiding it, so the trigger keeps the same footprint.
      const cs = getComputedStyle(this.select);
      const nativeMaxWidth = cs.maxWidth && cs.maxWidth !== 'none' ? cs.maxWidth : '';

      this.select.classList.add('cx-ss-native');
      this.select.setAttribute('tabindex', '-1'); // keep the hidden select out of tab order

      this.trigger = document.createElement('div');
      this.trigger.className = 'cx-ss-trigger';
      if (nativeMaxWidth) this.trigger.style.maxWidth = nativeMaxWidth;
      this.trigger.setAttribute('role', 'button');
      this.trigger.setAttribute('tabindex', '0');
      this.labelEl = document.createElement('span');
      this.labelEl.className = 'cx-ss-value';
      const chev = document.createElement('span');
      chev.className = 'cx-ss-chev';
      chev.innerHTML = svgChevron();
      this.trigger.appendChild(this.labelEl);
      this.trigger.appendChild(chev);

      // Insert the trigger right after the native select.
      this.select.insertAdjacentElement('afterend', this.trigger);

      this.trigger.addEventListener('click', this.onTriggerClick);
      this.trigger.addEventListener('keydown', this.onTriggerKeydown);
      this.select.addEventListener('change', this.syncLabel);

      // Reflect dynamic option changes (@for) and disabled/class changes.
      this.optionMo = new MutationObserver(() => this.syncLabel());
      this.optionMo.observe(this.select, { childList: true, subtree: true, characterData: true });
      this.attrMo = new MutationObserver(() => this.reflectAttrs());
      this.attrMo.observe(this.select, { attributes: true, attributeFilter: ['disabled', 'class'] });

      // Initial sync — ngModel writes the value asynchronously, so defer a tick.
      setTimeout(() => { this.syncLabel(); this.reflectAttrs(); }, 0);
    });
  }

  /**
   * Catch PROGRAMMATIC value changes.
   *
   * Angular's SelectControlValueAccessor writes the model by setting
   * select.value / selectedIndex. That fires no `change` event and mutates no
   * attribute or child node, so neither the change listener nor either
   * MutationObserver sees it — and it happens after the one-shot init sync.
   * The visible result was an edit dialog opening with its selects blank while
   * the underlying control held the right value (interest method, product
   * status, and every other select in every edit form).
   *
   * DoCheck runs per change-detection pass; the guard is a string compare, so
   * this repaints only when the value actually moved.
   */
  ngDoCheck(): void {
    if (this.destroyed || !this.labelEl) return;
    const v = this.select.value;
    if (v !== this.lastValue) {
      this.lastValue = v;
      this.syncLabel();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.closePanel();
    this.trigger?.removeEventListener('click', this.onTriggerClick);
    this.trigger?.removeEventListener('keydown', this.onTriggerKeydown);
    this.select?.removeEventListener('change', this.syncLabel);
    this.optionMo?.disconnect();
    this.attrMo?.disconnect();
    this.trigger?.remove();
  }

  private reflectAttrs = (): void => {
    const disabled = this.select.disabled;
    this.trigger.classList.toggle('is-disabled', disabled);
    // Mirror sizing classes so the trigger matches the app's input styling.
    this.trigger.classList.toggle('cx-select', this.select.classList.contains('cx-select'));
  };

  private syncLabel = (): void => {
    // Keep the DoCheck watermark aligned however the repaint was triggered
    // (user pick, option list change, or programmatic write).
    this.lastValue = this.select.value;
    const opt = this.select.selectedOptions[0];
    const text = opt ? (opt.textContent || '').trim() : '';
    const isPlaceholder = !opt || opt.value === '' || opt.disabled;
    this.labelEl.textContent = text || 'Select...';
    this.trigger.classList.toggle('is-placeholder', isPlaceholder && (text === '' || this.select.value === ''));
    if (this.panel) this.renderOptions();
  };

  private onTriggerClick = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (this.select.disabled) return;
    this.panel ? this.closePanel() : this.openPanel();
  };

  private onTriggerKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.panel) this.openPanel();
    }
  };

  private openPanel(): void {
    this.closePanel();
    const panel = document.createElement('div');
    panel.className = 'cx-ss-panel';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'cx-ss-search';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cx-ss-search-input';
    input.placeholder = 'Search...';
    searchWrap.appendChild(input);
    panel.appendChild(searchWrap);

    const list = document.createElement('div');
    list.className = 'cx-ss-list';
    panel.appendChild(list);

    document.body.appendChild(panel);
    this.panel = panel;
    this.searchInput = input;
    this.trigger.classList.add('is-open');

    this.positionPanel();
    this.renderOptions();

    input.addEventListener('input', () => this.renderOptions());
    input.addEventListener('keydown', this.onSearchKeydown);
    setTimeout(() => input.focus(), 0);

    document.addEventListener('mousedown', this.onDocMouseDown, true);
    window.addEventListener('scroll', this.onWindowChange, true);
    window.addEventListener('resize', this.onWindowChange, true);
  }

  private onSearchKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { this.closePanel(); this.trigger.focus(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const first = this.panel?.querySelector('.cx-ss-item:not(.is-disabled)') as HTMLElement | null;
      first?.click();
    }
  };

  private renderOptions(): void {
    if (!this.panel || !this.searchInput) return;
    const list = this.panel.querySelector('.cx-ss-list') as HTMLElement;
    const term = this.searchInput.value.toLowerCase().trim();
    list.innerHTML = '';

    const options = Array.from(this.select.options);
    let shown = 0;
    options.forEach((opt) => {
      const text = (opt.textContent || '').trim();
      if (term && !text.toLowerCase().includes(term)) return;
      shown++;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'cx-ss-item';
      if (opt.selected) item.classList.add('is-selected');
      if (opt.disabled) item.classList.add('is-disabled');
      item.textContent = text || ' ';
      if (!opt.disabled) {
        item.addEventListener('click', () => this.pick(opt));
      }
      list.appendChild(item);
    });

    if (shown === 0) {
      const empty = document.createElement('div');
      empty.className = 'cx-ss-empty';
      empty.textContent = 'No options found';
      list.appendChild(empty);
    }
  }

  private pick(opt: HTMLOptionElement): void {
    // Drive the native select so Angular's value accessor updates the model.
    this.select.selectedIndex = opt.index;
    this.zone.run(() => {
      this.select.dispatchEvent(new Event('input', { bubbles: true }));
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    this.syncLabel();
    this.closePanel();
    this.trigger.focus();
  }

  private positionPanel(): void {
    if (!this.panel) return;
    const r = this.trigger.getBoundingClientRect();
    const panel = this.panel;
    panel.style.position = 'fixed';
    panel.style.left = `${r.left}px`;
    panel.style.width = `${r.width}px`;
    // Flip above if not enough room below.
    const belowSpace = window.innerHeight - r.bottom;
    const panelH = Math.min(320, panel.scrollHeight || 320);
    if (belowSpace < panelH && r.top > belowSpace) {
      panel.style.top = 'auto';
      panel.style.bottom = `${window.innerHeight - r.top + 4}px`;
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = `${r.bottom + 4}px`;
    }
  }

  private onWindowChange = (): void => {
    // Reposition on scroll/resize; close if the trigger scrolled out of view.
    if (!this.panel) return;
    this.positionPanel();
  };

  private onDocMouseDown = (e: MouseEvent): void => {
    const t = e.target as Node;
    if (this.panel && !this.panel.contains(t) && !this.trigger.contains(t)) {
      this.closePanel();
    }
  };

  private closePanel(): void {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
      this.searchInput = null;
    }
    this.trigger?.classList.remove('is-open');
    document.removeEventListener('mousedown', this.onDocMouseDown, true);
    window.removeEventListener('scroll', this.onWindowChange, true);
    window.removeEventListener('resize', this.onWindowChange, true);
  }

  // ── Shared styles injected once into <head> ──
  private static stylesInjected = false;
  private static injectStylesOnce(): void {
    if (SearchableSelectDirective.stylesInjected) return;
    SearchableSelectDirective.stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'cx-searchable-select-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

function svgChevron(): string {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
}

const CSS = `
.cx-ss-native {
  position: absolute !important;
  width: 1px !important; height: 1px !important;
  padding: 0 !important; margin: -1px !important;
  overflow: hidden !important; clip: rect(0 0 0 0) !important;
  white-space: nowrap !important; border: 0 !important;
  opacity: 0 !important; pointer-events: none !important;
}
.cx-ss-trigger {
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%;
  padding: 0.55rem 0.85rem;
  background: var(--cx-surface); border: 1px solid var(--cx-border);
  border-radius: var(--cx-radius-md, 8px);
  font-size: var(--cx-text-sm, 13px);
  color: var(--cx-text);
  cursor: pointer; user-select: none;
  box-sizing: border-box;
  transition: border-color 120ms, box-shadow 120ms;
}
.cx-ss-trigger:hover:not(.is-open):not(.is-disabled) { border-color: var(--cx-border-strong, var(--cx-border)); }
.cx-ss-trigger.is-open { border-color: var(--cx-primary-600); box-shadow: var(--cx-ring-focus, 0 0 0 3px rgba(37,99,235,0.15)); }
.cx-ss-trigger.is-disabled { opacity: 0.6; cursor: not-allowed; background: var(--cx-surface-2, var(--cx-stone-50)); }
.cx-ss-value { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cx-ss-trigger.is-placeholder .cx-ss-value { color: var(--cx-text-muted); }
.cx-ss-chev { display: inline-flex; color: var(--cx-text-muted); flex-shrink: 0; transition: transform 160ms; }
.cx-ss-trigger.is-open .cx-ss-chev { transform: rotate(180deg); }
.cx-ss-panel {
  z-index: 2000;
  min-width: 180px; max-width: 480px;
  background: var(--cx-surface); border: 1px solid var(--cx-border);
  border-radius: var(--cx-radius-lg, 12px);
  box-shadow: var(--cx-shadow-lg, 0 12px 32px rgba(0,0,0,0.16));
  overflow: hidden;
  animation: cx-ss-in 140ms ease;
}
@keyframes cx-ss-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.cx-ss-search { padding: 0.5rem; border-bottom: 1px solid var(--cx-border); }
.cx-ss-search-input {
  width: 100%; box-sizing: border-box;
  padding: 0.4rem 0.65rem;
  background: var(--cx-surface-2, var(--cx-stone-50));
  border: 1px solid transparent; border-radius: var(--cx-radius-sm, 6px);
  font-size: var(--cx-text-sm, 13px); color: var(--cx-text); outline: none;
}
.cx-ss-search-input:focus { background: var(--cx-surface); border-color: var(--cx-border); }
.cx-ss-list { overflow-y: auto; max-height: 15rem; padding: 0.25rem; }
.cx-ss-item {
  display: block; width: 100%; text-align: left;
  padding: 0.5rem 0.65rem;
  background: transparent; border: none; border-radius: var(--cx-radius-sm, 6px);
  font-size: var(--cx-text-sm, 13px); color: var(--cx-text);
  cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cx-ss-item:hover { background: var(--cx-surface-hover, var(--cx-stone-100)); }
.cx-ss-item.is-selected { background: var(--cx-primary-50, rgba(37,99,235,0.08)); color: var(--cx-primary-700); font-weight: 500; }
.cx-ss-item.is-disabled { color: var(--cx-text-muted); cursor: default; }
.cx-ss-item.is-disabled:hover { background: transparent; }
.cx-ss-empty { padding: 1rem; text-align: center; font-size: var(--cx-text-sm, 13px); color: var(--cx-text-muted); }
`;
