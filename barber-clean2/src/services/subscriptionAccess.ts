export type SubscriptionPlan = 'free' | 'basic' | 'pro' | 'custom' | null | undefined;
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | null | undefined;
export type AppRole = 'admin' | 'barber';

export function isSubscriptionRestricted(status: SubscriptionStatus) {
  return status === 'past_due' || status === 'cancelled';
}

export function getSubscriptionPlan(user: any): NonNullable<SubscriptionPlan> {
  const plan = String(user?.subscription?.plan || '').trim().toLowerCase();
  if (plan === 'basic' || plan === 'pro' || plan === 'custom') return plan;
  return 'free';
}

export function hasActiveSubscription(user: any) {
  return String(user?.subscription?.status || '').trim() === 'active';
}

function hasRealPaymentLink(user: any) {
  const subscription = user?.subscription || {};
  return Boolean(
    subscription.lastPaymentAt ||
      subscription.mercadoPagoPaymentId ||
      subscription.mercadoPagoPreapprovalId ||
      subscription.astroPayPaymentId ||
      subscription.storePurchaseToken ||
      subscription.storeTransactionId
  );
}

function isLegacyUnpaidBasic(user: any) {
  return getSubscriptionPlan(user) === 'basic' && hasActiveSubscription(user) && !hasRealPaymentLink(user);
}

export function hasBasicPlanAccess(user: any) {
  const plan = getSubscriptionPlan(user);
  if (isLegacyUnpaidBasic(user)) return false;
  return hasActiveSubscription(user) && ['basic', 'pro', 'custom'].includes(plan);
}

export function isFreePlan(user: any) {
  return hasActiveSubscription(user) && (getSubscriptionPlan(user) === 'free' || isLegacyUnpaidBasic(user));
}

export function resolveUserRole(user: any): AppRole {
  return String(user?.role ?? '').trim().toLowerCase() === 'barber'
    ? 'barber'
    : 'admin';
}

export function resolvePostAuthRoute(user: any) {
  if (isSubscriptionRestricted(user?.subscription?.status)) {
    return 'Subscription-Settings';
  }

  if (resolveUserRole(user) === 'barber') {
    return 'Barber-Home';
  }

  return 'Home';
}
