import moment from 'moment';
import { z } from 'zod';
import { localized } from 'mailspring-exports';

// Pro's monthly build allowance, quoted to free users in upgrade prompts. The backend only
// reports the caller's own plan, so this mirrors its default (VIEWS_AGENT_PRO_MONTHLY_BUILDS).
const PRO_MONTHLY_BUILDS = 10;

/** One session's budget step, matching the backend's raise increment. */
export const BUDGET_STEP_CENTS = 200;

const PlanSchema = z.enum(['pro', 'free']).catch('free');
export type Plan = z.infer<typeof PlanSchema>;

/** The fields the client reads from the authoring proxy's `GET /api/views/agent/usage`. */
const AccountUsageSchema = z.object({
  plan: PlanSchema,
  builds: z.object({ used: z.number(), limit: z.number() }),
  spend: z.object({ usedCents: z.number(), limitCents: z.number() }),
  resetsAt: z.string().nullable().catch(null),
});
export type AccountUsage = z.infer<typeof AccountUsageSchema>;

/** The fields the client reads from the details of a 429 `quota` or `spend_quota`. */
const QuotaDetailsSchema = z.object({
  feature: z.string().optional(),
  plan: PlanSchema.optional(),
  limit: z.number().optional(),
  resetsAt: z.string().nullable().optional(),
});
export type QuotaDetails = z.infer<typeof QuotaDetailsSchema>;

/** What the panel shows when the account's allowance stops a build, message or budget raise. */
export interface LimitNotice {
  kind: 'build' | 'spend';
  plan: Plan;
  message: string;
  /** Free users are offered Pro; Pro users already have the larger allowance. */
  canUpgrade: boolean;
  details: QuotaDetails;
}

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
 * The fully formatted message for a quota rejection, from the error's details as the backend
 * sent them. Every number comes from the payload, except Pro's allowance when quoting it to a
 * free user (see PRO_MONTHLY_BUILDS).
 */
export function limitNotice(code: string, raw: unknown = {}): LimitNotice | null {
  if (code !== 'quota' && code !== 'spend_quota') return null;
  const parsed = QuotaDetailsSchema.safeParse(raw);
  const details: QuotaDetails = parsed.success ? parsed.data : {};
  const kind = code === 'quota' ? 'build' : 'spend';
  const plan: Plan = details.plan || 'free';
  const resets = resetDate(details.resetsAt);
  const upgrade = localized(
    'Upgrade to Mailspring Pro and build %@ new Views every month.',
    PRO_MONTHLY_BUILDS
  );
  let message: string;

  if (plan === 'free' && kind === 'build') {
    message = localized('Thanks for trying out Views!');
    message += ` ${upgrade}`;
  } else if (plan === 'free') {
    message = localized("You've used the AI tokens included with your trial of this Pro feature.");
    message += ` ${upgrade}`;
  } else if (kind === 'build') {
    message =
      details.limit !== undefined
        ? localized("You've built %@ Views this month.", details.limit)
        : localized("You've built this month's Views.");
    if (resets) message += ` ${localized('Your limit resets on %@.', resets)}`;
  } else {
    message = localized(
      "You've used up the AI tokens included in your Pro subscription this month."
    );
    if (resets) message += ` ${localized('Tokens reset on %@.', resets)}`;
  }
  return { kind, plan, message, canUpgrade: plan === 'free', details };
}

/** Validates a `/usage` response, or returns null for anything malformed. */
export function parseUsage(json: unknown): AccountUsage | null {
  const parsed = AccountUsageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
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
      ? localized('Custom views are a Mailspring Pro feature - Upgrade today to create more Views!')
      : localized(
          'Custom views are a Mailspring Pro feature, but you can try building one for free!'
        );
  }
  return localized('%1$@ of %2$@ free Views used', Math.min(used, limit), limit);
}

/** The allowance the account would hit next, as a notice, or null while there's room. */
export function exhaustedNotice(usage: AccountUsage | null, kind: 'build' | 'spend') {
  if (!usage) return null;
  const details: QuotaDetails = { plan: usage.plan, resetsAt: usage.resetsAt };
  if (kind === 'spend') {
    if (usage.spend.usedCents < usage.spend.limitCents) return null;
    return limitNotice('spend_quota', { ...details, feature: 'view-agent-spend' });
  }
  if (usage.builds.used < usage.builds.limit) return null;
  return limitNotice('quota', {
    ...details,
    feature: 'view-agent-build',
    limit: usage.builds.limit,
  });
}

// ── Message length ───────────────────────────────────────────────────────────

/** The backend's cap on one user message (VIEWS_AGENT_MAX_MESSAGE_CHARS); a 400
 * `message_too_long` carrying `{ limit }` overrides it. */
export const MAX_MESSAGE_CHARS = 4000;

const MessageLimitSchema = z.object({ limit: z.number().int().positive() });

/** The cap a `message_too_long` error's details report, or null if they don't. */
export function messageLimitFrom(details: unknown): number | null {
  const parsed = MessageLimitSchema.safeParse(details);
  return parsed.success ? parsed.data.limit : null;
}

/** The composer's count appears only from this share of the limit, so short messages stay quiet. */
const COUNT_FROM_RATIO = 0.9;

const formatCount = (n: number) => n.toLocaleString('en-US');

/**
 * What the composer shows under the text box for a message of `length` characters: nothing
 * until it nears the limit, then a count, then a hint once it's over (and sending is blocked).
 */
export function messageLengthHint(
  length: number,
  limit = MAX_MESSAGE_CHARS
): { text: string; over: boolean } | null {
  if (length > limit) {
    return {
      over: true,
      text: localized(
        'Messages can be up to %1$@ characters — this one is %2$@.',
        formatCount(limit),
        formatCount(length)
      ),
    };
  }
  if (length < limit * COUNT_FROM_RATIO) return null;
  return { over: false, text: `${formatCount(length)} / ${formatCount(limit)}` };
}
