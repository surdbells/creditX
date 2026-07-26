/**
 * Contextual page-guide metadata.
 *
 * One plain object per page describes its whole guide — the walkthrough steps
 * are DERIVED from this (see TourManagerService.buildSteps), so page authors
 * never build steps imperatively.
 *
 * CreditX has no i18n layer, so these fields hold literal display text rather
 * than translation keys. The field names keep the `...Key` shape of the source
 * design so the model stays recognisable if localisation is added later; at
 * that point only the resolver changes, not the per-page guide objects.
 *
 * Only id/title/purpose/description are required. OMIT any optional array that
 * would not add real value for a given page — a lightweight utility page
 * should carry a short guide, not a padded one.
 */
export interface PageGuide {
  /**
   * Stable key for the "already seen it" flag. Never reuse across pages, and
   * never change it once shipped — changing it re-runs the tour for everyone.
   */
  id: string;

  /** The page's own name. Reuse the page's existing header title. */
  titleKey: string;
  /** One line: why this page exists. */
  purposeKey: string;
  /** Short paragraph: the page's business value. */
  descriptionKey: string;

  /** The main things a user can do here. */
  actionKeys?: string[];
  /** Regions of the live page to spotlight during the tour. */
  sections?: GuideSection[];
  /** The upstream business-process steps that lead here. */
  workflowKeys?: string[];
  /** What must be set up before this page is useful. */
  dependsOnKeys?: string[];
  /** What downstream consumes the data captured here. */
  usedByKeys?: string[];
  /** Validation / business rules worth calling out. */
  businessRuleKeys?: string[];
  /** Best-practice tips. */
  tipKeys?: string[];
  /** Roles or permissions that can use this page. */
  permissionKeys?: string[];
  /** Frequently asked questions. */
  faq?: GuideFaq[];
}

export interface GuideSection {
  /**
   * CSS selector for a real element in the page's markup. A step whose target
   * cannot be found at runtime is silently dropped — a guide must never break
   * a page because, say, a stat card did not render this time.
   */
  selector: string;
  titleKey: string;
  bodyKey: string;
}

export interface GuideFaq {
  questionKey: string;
  answerKey: string;
}

/** A resolved walkthrough step, produced from a PageGuide. */
export interface TourStep {
  /** Present only for spotlight steps. */
  selector?: string;
  title: string;
  body: string;
  bullets?: string[];
  icon: string;
}

/**
 * Shared framework-level copy. Written once here rather than repeated per page:
 * only the bullets underneath these headings vary by page.
 */
export const GUIDE_TEXT = {
  help: 'Walkthrough',
  about: 'Overview',
  restart: 'Restart tour',
  nav: {
    back: 'Back',
    next: 'Next',
    skip: 'Skip',
    done: 'Got it',
    close: 'Close guide',
  },
  step: {
    actions: 'What you can do here',
    actionsBody: 'The main actions available on this page:',
    workflow: 'Where this fits',
    workflowBody: 'This page sits in a larger process:',
    dependencies: 'What this page needs',
    dependenciesBody: 'Set these up first — this page depends on them:',
    usedBy: 'What uses this',
    usedByBody: 'Other modules rely on the data captured here:',
    rules: 'Business rules',
    rulesBody: 'Key rules to keep in mind:',
    tips: 'Tips & best practices',
    tipsBody: 'Get the most out of this page:',
    done: "You're all set",
    doneBody: 'You now know your way around this page. Reopen this walkthrough anytime from the Walkthrough button.',
  },
  about_: {
    purpose: 'Purpose',
    relationships: 'How it connects',
    dependsOn: 'Depends on',
    usedBy: 'Used by',
    actions: 'What you can do',
    workflow: 'Workflow',
    permissions: 'Who can access',
    rules: 'Business rules',
    tips: 'Tips',
    faq: 'Common questions',
  },
} as const;
