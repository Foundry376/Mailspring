import moment from 'moment';
import { localized } from 'mailspring-exports';

// Pro's allowance, quoted to free users in upgrade prompts. The backend only reports the
// caller's own plan, so these mirror its defaults (VIEWS_AGENT_PRO_MONTHLY_*); a quota payload
// that carries `proLimits` overrides them.
const PRO_MONTHLY_BUILDS = 10;
const PRO_MONTHLY_CENTS = 800;

/** One session's budget step, matching the backend's raise increment. */
export const BUDGET_STEP_CENTS = 200;

export type Plan = 'pro' | 'free';

/** `GET /api/views/agent/usage` (docs/plans/views-agent-protocol.md). */
export interface AccountUsage {
  plan: Plan;
  /** `YYYY-MM` for monthly allowances, `unlimited` for the free plan's all-time one. */
  period: string;
  builds: { used: number; limit: number };
  spend: { usedCents: number; limitCents: number };
  resetsAt: string | null;
}

/** The details of a 429 `quota` or `spend_quota` from the backend. */
export interface QuotaDetails {
  feature?: string;
  plan?: Plan;
  limit?: number;
  used?: number;
  limitCents?: number;
  usedCents?: number;
  period?: string;
  resetsAt?: string | null;
  proLimits?: { builds?: number; cents?: number };
}

/** What the panel shows when the account's allowance stops a build, message or budget raise. */
export interface LimitNotice {
  kind: 'build' | 'spend';
  plan: Plan;
  message: string;
  /** Free users are offered Pro; Pro users already have the larger allowance. */
  canUpgrade: boolean;
  details: QuotaDetails;
}

const isNum = (v: any): v is number => typeof v === 'number' && isFinite(v);

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Allowances reset at the start of a UTC month, so the date is shown in UTC; in local time
// it would read as the last day of the previous month for most of the Americas.
function resetDate(resetsAt?: string | null) {
  const m = resetsAt ? moment.utc(resetsAt) : null;
  return m && m.isValid() ? m.format('MMMM D') : null;
}

/**
 * The fully formatted message for a quota rejection. Every number comes from the payload,
 * except Pro's allowance when quoting it to a free user (see PRO_MONTHLY_*).
 */
export function limitNotice(code: string, details: QuotaDetails = {}): LimitNotice | null {
  if (code !== 'quota' && code !== 'spend_quota') return null;
  const kind = code === 'quota' ? 'build' : 'spend';
  const plan: Plan = details.plan === 'pro' ? 'pro' : 'free';
  const pro = details.proLimits || {};
  const proBuilds = isNum(pro.builds) ? pro.builds : PRO_MONTHLY_BUILDS;
  const proCents = isNum(pro.cents) ? pro.cents : PRO_MONTHLY_CENTS;
  const resets = resetDate(details.resetsAt);
  let message: string;

  if (plan === 'free' && kind === 'build') {
    message = isNum(details.limit)
      ? details.limit === 1
        ? localized("You've used your free View.")
        : localized("You've used your %@ free Views.", details.limit)
      : localized("You've used the free Views included with your plan.");
    message += ` ${localized('Upgrade to Pro to build up to %@ Views a month.', proBuilds)}`;
  } else if (plan === 'free') {
    message = isNum(details.limitCents)
      ? localized(
          "You've used the %@ of AI building included with the free plan.",
          formatCents(details.limitCents)
        )
      : localized("You've used the AI building included with the free plan.");
    message += ` ${localized('Upgrade to Pro for %@ of building every month.', formatCents(proCents))}`;
  } else if (kind === 'build') {
    message = isNum(details.limit)
      ? localized("You've built %@ Views this month.", details.limit)
      : localized("You've built this month's Views.");
    if (resets) message += ` ${localized('Your limit resets on %@.', resets)}`;
  } else {
    message = isNum(details.limitCents)
      ? localized("You've used this month's %@ of AI building.", formatCents(details.limitCents))
      : localized("You've used this month's AI building.");
    if (resets) message += ` ${localized('It resets on %@.', resets)}`;
  }
  return { kind, plan, message, canUpgrade: plan === 'free', details };
}

/** Validates a `/usage` response, or returns null for anything malformed. */
export function parseUsage(json: any): AccountUsage | null {
  if (!json || typeof json !== 'object') return null;
  const { builds, spend } = json;
  if (!builds || !spend) return null;
  if (!isNum(builds.used) || !isNum(builds.limit)) return null;
  if (!isNum(spend.usedCents) || !isNum(spend.limitCents)) return null;
  return {
    plan: json.plan === 'pro' ? 'pro' : 'free',
    period: typeof json.period === 'string' ? json.period : 'unlimited',
    builds: { used: builds.used, limit: builds.limit },
    spend: { usedCents: spend.usedCents, limitCents: spend.limitCents },
    resetsAt: typeof json.resetsAt === 'string' ? json.resetsAt : null,
  };
}

/** Cents the next "Continue" can add: the usual step, or what's left of the allowance. */
export function raiseStepCents(usage: AccountUsage | null) {
  if (!usage) return BUDGET_STEP_CENTS;
  const remaining = usage.spend.limitCents - usage.spend.usedCents;
  return Math.max(0, Math.min(BUDGET_STEP_CENTS, remaining));
}

export function continueLabel(cents: number) {
  const amount = cents % 100 === 0 ? `$${cents / 100}` : formatCents(cents);
  return localized('Continue +%@', amount);
}

/** Dollar figures are a warning, not a running tally: below this share of the limit they're
 * hidden so people don't feel they're rationing what they paid for. */
export const SPEND_WARNING_RATIO = 0.75;

function nearSpendLimit(usage: AccountUsage) {
  return (
    usage.spend.limitCents > 0 &&
    usage.spend.usedCents >= usage.spend.limitCents * SPEND_WARNING_RATIO
  );
}

/** The panel header's account-wide spend, e.g. "$2.11 of $2.50 used", once it's near the limit;
 * null before that. */
export function meterText(usage: AccountUsage) {
  if (!nearSpendLimit(usage)) return null;
  const used = formatCents(usage.spend.usedCents);
  const limit = formatCents(usage.spend.limitCents);
  return usage.plan === 'pro'
    ? localized('%1$@ of %2$@ this month', used, limit)
    : localized('%1$@ of %2$@ used', used, limit);
}

/** The Views home's allowance line under "Create a View". */
export function homeUsageLine(usage: AccountUsage) {
  const { used, limit } = usage.builds;
  if (usage.plan === 'pro') {
    const views = localized('%1$@ of %2$@ Views this month', used, limit);
    if (!nearSpendLimit(usage)) return views;
    return localized(
      '%1$@ · %2$@ of %3$@',
      views,
      formatCents(usage.spend.usedCents),
      formatCents(usage.spend.limitCents)
    );
  }
  if (limit === 1) {
    return used >= 1
      ? localized("You've used your free View")
      : localized('Your first View is free');
  }
  return localized('%1$@ of %2$@ free Views used', Math.min(used, limit), limit);
}

/** The allowance the account would hit next, as a notice, or null while there's room. */
export function exhaustedNotice(usage: AccountUsage | null, kind: 'build' | 'spend') {
  if (!usage) return null;
  const details: QuotaDetails = {
    plan: usage.plan,
    period: usage.plan === 'pro' ? 'monthly' : 'unlimited',
    resetsAt: usage.resetsAt,
  };
  if (kind === 'spend') {
    if (usage.spend.usedCents < usage.spend.limitCents) return null;
    return limitNotice('spend_quota', {
      ...details,
      feature: 'view-agent-spend',
      limitCents: usage.spend.limitCents,
      usedCents: usage.spend.usedCents,
    });
  }
  if (usage.builds.used < usage.builds.limit) return null;
  return limitNotice('quota', {
    ...details,
    feature: 'view-agent-build',
    limit: usage.builds.limit,
    used: usage.builds.used,
  });
}
