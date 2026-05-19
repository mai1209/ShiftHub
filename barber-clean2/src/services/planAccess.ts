function getSubscription(user: any) {
  return user?.subscription ?? user;
}

function getPlan(user: any) {
  return String(getSubscription(user)?.plan || 'free').trim().toLowerCase();
}

function getStatus(user: any) {
  return String(getSubscription(user)?.status || '').trim().toLowerCase();
}

function hasRealPaymentLink(user: any) {
  const subscription = getSubscription(user) || {};
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
  return getPlan(user) === 'basic' && getStatus(user) === 'active' && !hasRealPaymentLink(user);
}

export function hasProPlanAccess(user: any) {
  const plan = getPlan(user);
  const status = getStatus(user);
  return (plan === 'pro' || plan === 'custom') && status === 'active';
}

export function hasBasicPlanAccess(user: any) {
  const plan = getPlan(user);
  const status = getStatus(user);
  if (isLegacyUnpaidBasic(user)) return false;
  return ['basic', 'pro', 'custom'].includes(plan) && status === 'active';
}

export function isFreePlan(user: any) {
  const plan = getPlan(user);
  const status = getStatus(user);
  return (plan === 'free' || isLegacyUnpaidBasic(user)) && status === 'active';
}
