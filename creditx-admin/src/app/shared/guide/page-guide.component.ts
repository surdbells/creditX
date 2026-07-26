import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { GUIDE_TEXT, PageGuide } from './page-guide.model';
import { TourManagerService } from './tour-manager.service';
import { TourOverlayComponent } from './tour-overlay.component';

/**
 * Drop-in page guide: the Walkthrough / Overview buttons, the expandable
 * Overview panel, and the tour overlay for this page.
 *
 * Place it immediately after the page header and before the main content:
 *   <cx-page-guide [guide]="guide"></cx-page-guide>
 *
 * The tour auto-starts once per device, shortly after mount, so a first-time
 * visitor is shown around without clicking anything — and never again after
 * they finish or dismiss it.
 */
@Component({
  selector: 'cx-page-guide',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TourOverlayComponent],
  template: `
    <div class="cx-pg">
      <div class="cx-pg-bar">
        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="startTour()">
          <lucide-icon name="play" [size]="13"></lucide-icon>
          <span>{{ T.help }}</span>
        </button>
        <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="showAbout.set(!showAbout())"
                [attr.aria-expanded]="showAbout()">
          <lucide-icon name="info" [size]="13"></lucide-icon>
          <span>{{ T.about }}</span>
          <lucide-icon [name]="showAbout() ? 'chevron-up' : 'chevron-down'" [size]="13"></lucide-icon>
        </button>
      </div>

      @if (showAbout() && guide) {
        <div class="cx-card cx-pg-panel">
          <!-- 1. Purpose -->
          <section>
            <h4>{{ A.purpose }}</h4>
            <p class="cx-pg-lead">{{ guide.purposeKey }}</p>
            <p class="cx-pg-muted">{{ guide.descriptionKey }}</p>
          </section>

          <!-- 2. How it connects: depends on → this page → used by -->
          @if (guide.dependsOnKeys?.length || guide.usedByKeys?.length) {
            <section>
              <h4>{{ A.relationships }}</h4>
              <div class="cx-pg-flow">
                @if (guide.dependsOnKeys?.length) {
                  <div class="cx-pg-flow-col">
                    <span class="cx-pg-flow-label">{{ A.dependsOn }}</span>
                    @for (d of guide.dependsOnKeys; track d) { <span class="cx-pg-node">{{ d }}</span> }
                  </div>
                  <lucide-icon name="arrow-right" [size]="15" class="cx-pg-arrow"></lucide-icon>
                }
                <div class="cx-pg-flow-col">
                  <span class="cx-pg-node is-self">{{ guide.titleKey }}</span>
                </div>
                @if (guide.usedByKeys?.length) {
                  <lucide-icon name="arrow-right" [size]="15" class="cx-pg-arrow"></lucide-icon>
                  <div class="cx-pg-flow-col">
                    <span class="cx-pg-flow-label">{{ A.usedBy }}</span>
                    @for (u of guide.usedByKeys; track u) { <span class="cx-pg-node">{{ u }}</span> }
                  </div>
                }
              </div>
            </section>
          }

          <!-- 3. What you can do -->
          @if (guide.actionKeys?.length) {
            <section>
              <h4>{{ A.actions }}</h4>
              <ul class="cx-pg-list">
                @for (a of guide.actionKeys; track a) { <li>{{ a }}</li> }
              </ul>
            </section>
          }

          <!-- 4. Workflow — a chain, not a list -->
          @if (guide.workflowKeys?.length) {
            <section>
              <h4>{{ A.workflow }}</h4>
              <div class="cx-pg-chain">
                @for (w of guide.workflowKeys; track w; let last = $last) {
                  <span class="cx-pg-chain-step">{{ w }}</span>
                  @if (!last) { <lucide-icon name="chevron-right" [size]="13" class="cx-pg-chain-sep"></lucide-icon> }
                }
              </div>
            </section>
          }

          <!-- 5. Who can access -->
          @if (guide.permissionKeys?.length) {
            <section>
              <h4>{{ A.permissions }}</h4>
              <div class="cx-pg-chips">
                @for (p of guide.permissionKeys; track p) { <span class="cx-pg-chip">{{ p }}</span> }
              </div>
            </section>
          }

          <!-- 6. Business rules -->
          @if (guide.businessRuleKeys?.length) {
            <section>
              <h4>{{ A.rules }}</h4>
              <ul class="cx-pg-list">
                @for (r of guide.businessRuleKeys; track r) { <li>{{ r }}</li> }
              </ul>
            </section>
          }

          <!-- 7. Tips -->
          @if (guide.tipKeys?.length) {
            <section>
              <h4>{{ A.tips }}</h4>
              <ul class="cx-pg-list">
                @for (t of guide.tipKeys; track t) { <li>{{ t }}</li> }
              </ul>
            </section>
          }

          <!-- 8. FAQ -->
          @if (guide.faq?.length) {
            <section>
              <h4>{{ A.faq }}</h4>
              <dl class="cx-pg-faq">
                @for (f of guide.faq; track f.questionKey) {
                  <dt>{{ f.questionKey }}</dt>
                  <dd>{{ f.answerKey }}</dd>
                }
              </dl>
            </section>
          }

          <div class="cx-pg-panel-foot">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="startTour()">
              <lucide-icon name="refresh-cw" [size]="13"></lucide-icon>
              <span>{{ T.restart }}</span>
            </button>
          </div>
        </div>
      }
    </div>

    <!-- Only the page whose guide is running renders the overlay. -->
    @if (guide && tour.activeGuideId() === guide.id) {
      <cx-tour-overlay></cx-tour-overlay>
    }
  `,
  styles: [`
    .cx-pg { margin:-0.75rem 0 1.25rem; }
    .cx-pg-bar { display:flex; gap:6px; flex-wrap:wrap; }
    .cx-pg-panel { padding:16px 18px; margin-top:10px; display:flex; flex-direction:column; gap:14px; }
    .cx-pg-panel h4 { margin:0 0 6px; font-size:11px; font-weight:700; text-transform:uppercase;
      letter-spacing:.05em; color:var(--cx-text-muted); }
    .cx-pg-lead { margin:0; font-size:13.5px; color:var(--cx-text); }
    .cx-pg-muted { margin:4px 0 0; font-size:12.5px; line-height:1.55; color:var(--cx-text-muted); }
    .cx-pg-list { margin:0; padding-left:18px; }
    .cx-pg-list li { font-size:13px; line-height:1.5; color:var(--cx-text-secondary); margin-bottom:3px; }

    .cx-pg-flow { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .cx-pg-flow-col { display:flex; flex-direction:column; gap:4px; }
    .cx-pg-flow-label { font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:var(--cx-text-muted); }
    .cx-pg-node { font-size:12px; padding:4px 9px; border-radius:7px; background:var(--cx-surface-2, var(--cx-stone-100));
      color:var(--cx-text-secondary); white-space:nowrap; }
    .cx-pg-node.is-self { background:color-mix(in srgb, var(--cx-primary-600) 14%, transparent);
      color:var(--cx-primary-600); font-weight:700; }
    .cx-pg-arrow { color:var(--cx-text-muted); flex-shrink:0; }

    .cx-pg-chain { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
    .cx-pg-chain-step { font-size:12px; padding:4px 9px; border-radius:999px;
      background:var(--cx-surface-2, var(--cx-stone-100)); color:var(--cx-text-secondary); }
    .cx-pg-chain-sep { color:var(--cx-text-muted); }

    .cx-pg-chips { display:flex; gap:6px; flex-wrap:wrap; }
    .cx-pg-chip { font-size:11.5px; padding:3px 9px; border-radius:999px;
      background:color-mix(in srgb, var(--cx-primary-600) 10%, transparent); color:var(--cx-primary-600); }

    .cx-pg-faq dt { font-size:12.5px; font-weight:600; color:var(--cx-text); margin-top:8px; }
    .cx-pg-faq dt:first-child { margin-top:0; }
    .cx-pg-faq dd { margin:3px 0 0; font-size:12.5px; line-height:1.5; color:var(--cx-text-muted); }

    .cx-pg-panel-foot { border-top:1px solid var(--cx-border); padding-top:12px; }
  `],
})
export class PageGuideComponent implements OnInit {
  @Input({ required: true }) guide!: PageGuide;

  readonly tour = inject(TourManagerService);
  readonly T = GUIDE_TEXT;
  readonly A = GUIDE_TEXT.about_;

  showAbout = signal(false);

  ngOnInit(): void {
    if (!this.guide || this.tour.hasCompleted(this.guide.id)) return;
    // Brief delay so the page's own content has rendered and any spotlight
    // target exists before the first step tries to measure it.
    setTimeout(() => {
      if (this.guide && !this.tour.hasCompleted(this.guide.id) && !this.tour.isActive()) {
        this.tour.start(this.guide);
      }
    }, 700);
  }

  startTour(): void {
    if (this.guide) this.tour.start(this.guide);
  }
}
