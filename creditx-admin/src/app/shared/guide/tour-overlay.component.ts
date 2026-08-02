import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { GUIDE_TEXT } from './page-guide.model';
import { TourManagerService } from './tour-manager.service';

interface Rect { top: number; left: number; width: number; height: number; }

/**
 * The walkthrough overlay. Rendered only while a tour is running.
 *
 * Two shapes of step:
 *   - modal    — no selector, or the target is not on screen: dim everything
 *                and centre the card.
 *   - spotlight — the target resolves: dim everything EXCEPT a padded cut-out
 *                around it, achieved with a huge box-shadow on a transparent
 *                clone rect. The backdrop goes transparent and is clipped
 *                around the same rect, so the real element stays undimmed AND
 *                clickable underneath — which matters when a step points at
 *                something the user should actually try.
 *
 * Positions are recomputed on step change, resize and scroll, because the page
 * underneath is live and can move.
 */
@Component({
  selector: 'cx-tour-overlay',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (tour.isActive() && tour.current(); as step) {
      <div class="cx-tg-root" role="dialog" aria-modal="true" [attr.aria-label]="step.title">
        <!-- Backdrop. Dismissing counts as completing (see skip()).
             On a spotlight step it is TRANSPARENT — the spot's box-shadow
             paints the dim — and clipped so the hole is not merely undimmed
             but genuinely click-through to the page beneath. -->
        <div class="cx-tg-backdrop" [class.is-clear]="!!spot()"
             [style.clipPath]="backdropClip()" (click)="tour.skip()"></div>

        @if (spot(); as r) {
          <!-- Cut-out: the shadow paints the dim, the hole stays clear. -->
          <div class="cx-tg-spot" [style.top.px]="r.top" [style.left.px]="r.left"
               [style.width.px]="r.width" [style.height.px]="r.height"></div>
        }

        <div class="cx-tg-card" [class.is-modal]="!spot()"
             [style.top.px]="cardPos().top" [style.left.px]="cardPos().left">
          <button class="cx-tg-close" (click)="tour.skip()" [attr.aria-label]="T.nav.close">
            <lucide-icon name="x" [size]="15"></lucide-icon>
          </button>

          <div class="cx-tg-head">
            <span class="cx-tg-icon"><lucide-icon [name]="step.icon" [size]="16"></lucide-icon></span>
            <h3>{{ step.title }}</h3>
          </div>

          <div class="cx-tg-body">
            @for (p of paragraphs(step.body); track $index) { <p>{{ p }}</p> }
            @if (step.bullets?.length) {
              <ul>
                @for (b of step.bullets; track b) { <li>{{ b }}</li> }
              </ul>
            }
          </div>

          <div class="cx-tg-foot">
            <div class="cx-tg-dots">
              @for (s of tour.steps(); track $index) {
                <button class="cx-tg-dot" [class.is-active]="$index === tour.index()"
                        (click)="tour.goTo($index)" [attr.aria-label]="'Step ' + ($index + 1)"></button>
              }
            </div>
            <span class="cx-tg-count">{{ tour.index() + 1 }} / {{ tour.total() }}</span>
            <div class="cx-tg-actions">
              @if (!tour.isFirst()) {
                <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="tour.previous()">{{ T.nav.back }}</button>
              }
              @if (tour.isLast()) {
                <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="tour.finish()">{{ T.nav.done }}</button>
              } @else {
                <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="tour.skip()">{{ T.nav.skip }}</button>
                <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="tour.next()">{{ T.nav.next }}</button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-tg-root { position:fixed; inset:0; z-index:var(--cx-z-modal, 1000); }
    .cx-tg-backdrop { position:absolute; inset:0; background:rgba(15,28,22,.55); }
    /* The shadow IS the dim for spotlight steps, so the backdrop must go clear
       there. Without this it painted its own 55% dim OVER the spotlit element,
       so the "highlighted" region looked exactly as dimmed as everything else. */
    .cx-tg-backdrop.is-clear { background:transparent; }
    .cx-tg-spot {
      position:absolute; border-radius:10px; pointer-events:none;
      box-shadow:0 0 0 9999px rgba(15,28,22,.55); border:2px solid var(--cx-primary-600);
      transition:top .2s ease, left .2s ease, width .2s ease, height .2s ease;
    }
    .cx-tg-card {
      position:absolute; width:min(380px, calc(100vw - 32px));
      background:var(--cx-surface); border:1px solid var(--cx-border);
      border-radius:var(--cx-radius-xl, 14px); box-shadow:var(--cx-shadow-xl);
      padding:16px 18px 12px;
    }
    .cx-tg-card.is-modal { transform:translate(-50%, -50%); }
    .cx-tg-close { position:absolute; top:10px; right:10px; border:none; background:transparent;
      cursor:pointer; color:var(--cx-text-muted); padding:2px; line-height:0; }
    .cx-tg-head { display:flex; align-items:center; gap:9px; margin-bottom:8px; padding-right:22px; }
    .cx-tg-head h3 { margin:0; font-size:15px; font-weight:700; color:var(--cx-text); }
    .cx-tg-icon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px;
      border-radius:8px; background:color-mix(in srgb, var(--cx-primary-600) 12%, transparent);
      color:var(--cx-primary-600); flex-shrink:0; }
    .cx-tg-body p { margin:0 0 8px; font-size:13px; line-height:1.55; color:var(--cx-text-secondary); }
    .cx-tg-body ul { margin:6px 0 8px; padding-left:18px; }
    .cx-tg-body li { font-size:13px; line-height:1.5; color:var(--cx-text-secondary); margin-bottom:4px; }
    .cx-tg-foot { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
      border-top:1px solid var(--cx-border); padding-top:10px; margin-top:6px; }
    .cx-tg-dots { display:flex; gap:5px; }
    .cx-tg-dot { width:7px; height:7px; border-radius:50%; border:none; padding:0; cursor:pointer;
      background:var(--cx-border); }
    .cx-tg-dot.is-active { background:var(--cx-primary-600); }
    .cx-tg-count { font-size:11px; color:var(--cx-text-muted); }
    .cx-tg-actions { margin-left:auto; display:flex; gap:6px; }

    @media (prefers-reduced-motion: reduce) {
      .cx-tg-spot { transition:none; }
    }
  `],
})
export class TourOverlayComponent {
  readonly tour = inject(TourManagerService);
  readonly T = GUIDE_TEXT;

  spot = signal<Rect | null>(null);
  cardPos = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  constructor() {
    // Re-measure whenever the step changes; the target differs per step.
    effect(() => {
      this.tour.index();
      const step = this.tour.current();
      if (!step) { this.spot.set(null); return; }
      queueMicrotask(() => this.measure());
    });
  }

  paragraphs(body: string): string[] {
    return body.split('\n\n').map(p => p.trim()).filter(Boolean);
  }

  /**
   * Punches the spotlit rect out of the backdrop, so a click on the highlighted
   * element reaches the page instead of hitting the backdrop and ending the
   * tour — which matters for steps pointing at something the user should try.
   *
   * Purely a hit-testing device: on a spotlight step the backdrop is already
   * transparent, so the square corners of this polygon are invisible and the
   * ring keeps its rounded corners from the box-shadow.
   */
  backdropClip(): string | null {
    const r = this.spot();
    if (!r) {
      return null;
    }
    const x1 = Math.round(r.left), y1 = Math.round(r.top);
    const x2 = Math.round(r.left + r.width), y2 = Math.round(r.top + r.height);
    // Outer ring, then the hole; evenodd makes the inner ring subtractive.
    return 'polygon(evenodd,'
      + ' 0px 0px, 100% 0px, 100% 100%, 0px 100%, 0px 0px,'
      + ` ${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px, ${x1}px ${y1}px)`;
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (this.tour.isActive()) this.measure();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    // Guard: these keys belong to the page when no tour is running.
    if (!this.tour.isActive()) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); this.tour.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.tour.previous(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.tour.skip(); }
  }

  /**
   * Resolve the step's target, scroll it into view, and place the card.
   * A missing target degrades to a centred modal rather than a broken step.
   */
  private measure(): void {
    const step = this.tour.current();
    const el = step?.selector ? document.querySelector<HTMLElement>(step.selector) : null;

    if (!el) {
      this.spot.set(null);
      this.cardPos.set({ top: window.innerHeight / 2, left: window.innerWidth / 2 });
      return;
    }

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });

    // Measure after the scroll settles, otherwise the rect is the pre-scroll one.
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      const pad = 6;
      const rect: Rect = {
        top: r.top - pad, left: r.left - pad,
        width: r.width + pad * 2, height: r.height + pad * 2,
      };
      this.spot.set(rect);

      // Prefer below the target; flip above when there isn't room. Clamp
      // horizontally so the card never hangs off-screen on narrow viewports.
      const cardW = Math.min(380, window.innerWidth - 32);
      const estH = 240;
      const below = rect.top + rect.height + 12;
      const top = below + estH < window.innerHeight ? below : Math.max(12, rect.top - estH - 12);
      const left = Math.min(
        Math.max(16, rect.left + rect.width / 2 - cardW / 2),
        window.innerWidth - cardW - 16,
      );
      this.cardPos.set({ top, left });
    }, reduced ? 0 : 220);
  }
}
