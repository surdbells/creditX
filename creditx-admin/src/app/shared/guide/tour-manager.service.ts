import { Injectable, computed, signal } from '@angular/core';
import { GUIDE_TEXT, PageGuide, TourStep } from './page-guide.model';

/**
 * Owns walkthrough state for the whole app: which guide is running, the
 * resolved steps, and where the user is in them.
 *
 * Only one tour can be active at a time — `activeGuideId` is what each
 * PageGuideComponent checks before rendering the overlay, so two guided pages
 * can never fight over the screen.
 */
@Injectable({ providedIn: 'root' })
export class TourManagerService {
  private static readonly STORAGE_PREFIX = 'creditx.guide.completed.';

  readonly activeGuideId = signal<string | null>(null);
  readonly steps = signal<TourStep[]>([]);
  readonly index = signal(0);

  readonly current = computed<TourStep | null>(() => this.steps()[this.index()] ?? null);
  readonly total = computed(() => this.steps().length);
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() >= this.steps().length - 1);
  readonly isActive = computed(() => this.activeGuideId() !== null);

  /**
   * Has this device already seen the guide?
   *
   * Storage failures (private browsing, storage disabled by policy) are
   * swallowed and reported as "not seen" — the tour then simply runs again,
   * which is a far better failure than throwing inside a page's init.
   */
  hasCompleted(guideId: string): boolean {
    try {
      return localStorage.getItem(TourManagerService.STORAGE_PREFIX + guideId) === '1';
    } catch {
      return false;
    }
  }

  private markCompleted(guideId: string): void {
    try {
      localStorage.setItem(TourManagerService.STORAGE_PREFIX + guideId, '1');
    } catch {
      // Nothing to do — worst case the tour offers itself again next visit.
    }
  }

  /** Build the step list for a guide and activate it. */
  start(guide: PageGuide): void {
    const steps = this.buildSteps(guide);
    if (steps.length === 0) return;
    this.steps.set(steps);
    this.index.set(0);
    this.activeGuideId.set(guide.id);
  }

  next(): void {
    if (this.isLast()) { this.finish(); return; }
    this.index.update(i => i + 1);
  }

  previous(): void {
    if (this.isFirst()) return;
    this.index.update(i => i - 1);
  }

  goTo(i: number): void {
    if (i >= 0 && i < this.steps().length) this.index.set(i);
  }

  /**
   * Leaving early (Esc, ×, backdrop) ALSO marks the guide complete.
   *
   * Deliberate: a first-run tour that someone dismissed must not reappear on
   * every subsequent visit. Dismissing is a decision, and nagging past it is
   * how help systems become something users learn to click away reflexively.
   */
  skip(): void {
    const id = this.activeGuideId();
    if (id) this.markCompleted(id);
    this.close();
  }

  /** Completing the final step. */
  finish(): void {
    const id = this.activeGuideId();
    if (id) this.markCompleted(id);
    this.close();
  }

  private close(): void {
    this.activeGuideId.set(null);
    this.steps.set([]);
    this.index.set(0);
  }

  /**
   * Fixed step order, skipping any category the guide did not populate:
   *   welcome → actions → each section → workflow → depends on → used by →
   *   rules → tips → completion
   *
   * Sections are the only source of spotlight selectors.
   */
  buildSteps(guide: PageGuide): TourStep[] {
    const steps: TourStep[] = [];

    steps.push({
      title: guide.titleKey,
      body: `${guide.purposeKey}\n\n${guide.descriptionKey}`,
      icon: 'hand',
    });

    if (guide.actionKeys?.length) {
      steps.push({
        title: GUIDE_TEXT.step.actions,
        body: GUIDE_TEXT.step.actionsBody,
        bullets: guide.actionKeys,
        icon: 'target',
      });
    }

    for (const section of guide.sections ?? []) {
      steps.push({
        selector: section.selector,
        title: section.titleKey,
        body: section.bodyKey,
        icon: 'search',
      });
    }

    const categories: Array<[string[] | undefined, string, string, string]> = [
      [guide.workflowKeys, GUIDE_TEXT.step.workflow, GUIDE_TEXT.step.workflowBody, 'arrow-left-right'],
      [guide.dependsOnKeys, GUIDE_TEXT.step.dependencies, GUIDE_TEXT.step.dependenciesBody, 'link'],
      [guide.usedByKeys, GUIDE_TEXT.step.usedBy, GUIDE_TEXT.step.usedByBody, 'package'],
      [guide.businessRuleKeys, GUIDE_TEXT.step.rules, GUIDE_TEXT.step.rulesBody, 'scale'],
      [guide.tipKeys, GUIDE_TEXT.step.tips, GUIDE_TEXT.step.tipsBody, 'info'],
    ];
    for (const [items, title, body, icon] of categories) {
      if (items?.length) steps.push({ title, body, bullets: items, icon });
    }

    steps.push({
      title: GUIDE_TEXT.step.done,
      body: GUIDE_TEXT.step.doneBody,
      icon: 'badge-check',
    });

    return steps;
  }
}
