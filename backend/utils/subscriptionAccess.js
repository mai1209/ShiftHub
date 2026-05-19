export function normalizeSubscriptionPlan(value) {
  const plan = String(value || "").trim().toLowerCase();
  return ["free", "basic", "pro", "custom"].includes(plan) ? plan : "free";
}

export function normalizeSubscriptionStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["trial", "active", "past_due", "cancelled"].includes(status)
    ? status
    : "active";
}

export function hasPaidOperationalAccess(subscription) {
  const plan = normalizeSubscriptionPlan(subscription?.plan);
  const status = normalizeSubscriptionStatus(subscription?.status);
  if (isLegacyUnpaidBasic(subscription)) return false;
  return status === "active" && ["basic", "pro", "custom"].includes(plan);
}

export function hasProAccess(subscription) {
  const plan = normalizeSubscriptionPlan(subscription?.plan);
  const status = normalizeSubscriptionStatus(subscription?.status);
  return status === "active" && ["pro", "custom"].includes(plan);
}

export function isFreeActiveSubscription(subscription) {
  return (
    (normalizeSubscriptionPlan(subscription?.plan) === "free" ||
      isLegacyUnpaidBasic(subscription)) &&
    normalizeSubscriptionStatus(subscription?.status) === "active"
  );
}

export function hasRealPaymentLink(subscription = {}) {
  return Boolean(
    subscription.lastPaymentAt ||
      subscription.mercadoPagoPaymentId ||
      subscription.mercadoPagoPreapprovalId ||
      subscription.astroPayPaymentId ||
      subscription.storePurchaseToken ||
      subscription.storeTransactionId,
  );
}

export function shouldNormalizeLegacyTrialToFree(subscription = {}) {
  const plan = normalizeSubscriptionPlan(subscription.plan);
  const status = normalizeSubscriptionStatus(subscription.status);
  return plan === "basic" && ["trial", "active"].includes(status) && !hasRealPaymentLink(subscription);
}

function isLegacyUnpaidBasic(subscription = {}) {
  const plan = normalizeSubscriptionPlan(subscription.plan);
  const status = normalizeSubscriptionStatus(subscription.status);
  return plan === "basic" && status === "active" && !hasRealPaymentLink(subscription);
}

export function buildFreeSubscriptionPatch(existing = {}) {
  return {
    ...(existing?.toObject?.() ?? existing ?? {}),
    plan: "free",
    status: "active",
    billingCycle: null,
    renewalMode: "manual",
    provider: null,
    expiresAt: null,
    nextBillingAt: null,
    pendingPlan: null,
  };
}
