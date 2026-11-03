// Client-side mirror of public.household_has_paid_plan(). Both screens ask the same question
// ("may this household share and use AI receipt parsing?") and they must agree with the
// database, otherwise the UI offers an upgrade to a household that is already entitled —
// which is how an owner ends up with two Stripe subscriptions.

export type BillingSummary = {
  is_owner: boolean;
  has_access: boolean;
  status: string;
  active_members: number;
  included_members: number;
  extra_seats: number;
  monthly_cents: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

const paidStatuses = new Set(['active', 'trialing', 'past_due', 'comped']);

/**
 * True when the household currently holds the paid entitlement, including the
 * cancel-at-period-end grace window where Stripe may already report `canceled` while the
 * paid period has not ended yet.
 */
export function hasPaidPlan(billing: Pick<BillingSummary, 'status'> & Partial<BillingSummary> | null | undefined) {
  if (!billing) return false;
  if (paidStatuses.has(billing.status)) return true;
  if (!billing.cancel_at_period_end || !billing.current_period_end) return false;
  const periodEnd = new Date(billing.current_period_end).getTime();
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
}

/** Formats monthly_cents for display, e.g. 749 -> "7.49". */
export function formatMonthly(cents: number | null | undefined) {
  return ((cents ?? 500) / 100).toFixed(2);
}
