import { Platform } from 'react-native';
import type { ActiveSubscription, Purchase } from 'react-native-iap';
import type { StoreSubscriptionSyncPayload } from './api';

export const STORE_SUBSCRIPTION_PRODUCTS = {
  basic: 'shifthub_basic_monthly',
  pro: 'shifthub_pro_monthly',
} as const;

export type StorePlan = keyof typeof STORE_SUBSCRIPTION_PRODUCTS;

// Tiers de Pro por cantidad de locales TOTALES (la base ya incluye 1). Todos en el
// mismo subscription group que `shifthub_pro_monthly`. Tope: 6 locales.
export const STORE_PRO_LOCALE_PRODUCTS: Record<number, string> = {
  2: 'shifthub_pro_2locales',
  3: 'shifthub_pro_3locales',
  4: 'shifthub_pro_4locales',
  5: 'shifthub_pro_5locales',
  6: 'shifthub_pro_6locales',
};

export const MAX_TOTAL_LOCALES = 6;

// Locales TOTALES que representa un productId (1 = base/basic).
export function inferLocalesFromProductId(value?: string | null): number {
  const id = String(value || '').trim();
  if (!id) return 1;
  const found = Object.entries(STORE_PRO_LOCALE_PRODUCTS).find(
    ([, pid]) => pid === id,
  );
  return found ? Number(found[0]) : 1;
}

// productId del tier de Pro para una cantidad de locales totales (null si es 1 o
// supera el tope).
export function proProductIdForLocales(totalLocales: number): string | null {
  if (totalLocales <= 1) return STORE_SUBSCRIPTION_PRODUCTS.pro;
  return STORE_PRO_LOCALE_PRODUCTS[totalLocales] ?? null;
}

export function getStoreSubscriptionSkus() {
  return [
    ...Object.values(STORE_SUBSCRIPTION_PRODUCTS),
    ...Object.values(STORE_PRO_LOCALE_PRODUCTS),
  ];
}

export function isStoreBillingPlatform() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function inferPlanFromProductId(value?: string | null): StorePlan | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  // Los tiers de locales son del plan Pro.
  if (Object.values(STORE_PRO_LOCALE_PRODUCTS).includes(normalized)) {
    return 'pro';
  }

  return (Object.entries(STORE_SUBSCRIPTION_PRODUCTS).find(([, productId]) => productId === normalized)?.[0] ??
    null) as StorePlan | null;
}

export function buildStoreSyncPayloadFromPurchase(purchase: Purchase): StoreSubscriptionSyncPayload | null {
  const productId = String(purchase?.productId || '').trim();
  const plan = inferPlanFromProductId(productId) ?? inferPlanFromProductId(purchase?.currentPlanId);
  if (!productId || !plan) return null;

  const provider = Platform.OS === 'ios' ? 'apple' : 'google';
  const expiresAt =
    Platform.OS === 'ios' && 'expirationDateIOS' in purchase && purchase.expirationDateIOS
      ? new Date(Number(purchase.expirationDateIOS)).toISOString()
      : null;
  const autoRenewing =
    Platform.OS === 'ios'
      ? Boolean('renewalInfoIOS' in purchase && purchase.renewalInfoIOS?.willAutoRenew)
      : Boolean(purchase.isAutoRenewing);
  const environment =
    Platform.OS === 'ios' && 'environmentIOS' in purchase
      ? purchase.environmentIOS || null
      : null;
  const originalTransactionId =
    Platform.OS === 'ios' && 'originalTransactionIdentifierIOS' in purchase
      ? purchase.originalTransactionIdentifierIOS || null
      : null;

  return {
    provider,
    plan,
    productId,
    currentPlanId: purchase.currentPlanId || null,
    purchaseToken: purchase.purchaseToken || null,
    transactionId: 'transactionId' in purchase ? purchase.transactionId || null : null,
    originalTransactionId,
    environment,
    autoRenewing,
    status: 'active',
    expiresAt,
  };
}

export function buildStoreSyncPayloadFromActiveSubscription(
  subscription: ActiveSubscription,
): StoreSubscriptionSyncPayload | null {
  const productId = String(subscription?.productId || '').trim();
  const plan =
    inferPlanFromProductId(productId) ?? inferPlanFromProductId(subscription?.currentPlanId);
  if (!productId || !plan) return null;

  const provider = Platform.OS === 'ios' ? 'apple' : 'google';
  const expiresAt =
    Platform.OS === 'ios' && subscription.expirationDateIOS
      ? new Date(Number(subscription.expirationDateIOS)).toISOString()
      : null;
  const autoRenewing =
    Platform.OS === 'ios'
      ? Boolean(subscription.renewalInfoIOS?.willAutoRenew)
      : Boolean(subscription.autoRenewingAndroid);

  return {
    provider,
    plan,
    productId,
    currentPlanId: subscription.currentPlanId || null,
    purchaseToken: subscription.purchaseToken || subscription.purchaseTokenAndroid || null,
    transactionId: subscription.transactionId || null,
    originalTransactionId: subscription.transactionId || null,
    environment: subscription.environmentIOS || null,
    autoRenewing,
    status: subscription.isActive ? 'active' : 'cancelled',
    expiresAt,
  };
}

export function pickPrimaryActiveSubscription(subscriptions: ActiveSubscription[]) {
  const ordered = [...subscriptions].sort((a, b) => {
    const planRank = (plan: StorePlan | null) => (plan === 'pro' ? 2 : plan === 'basic' ? 1 : 0);
    const aPlan = inferPlanFromProductId(a.productId) ?? inferPlanFromProductId(a.currentPlanId);
    const bPlan = inferPlanFromProductId(b.productId) ?? inferPlanFromProductId(b.currentPlanId);
    const rankDiff = planRank(bPlan) - planRank(aPlan);
    if (rankDiff !== 0) return rankDiff;
    return Number(b.transactionDate || 0) - Number(a.transactionDate || 0);
  });

  return ordered[0] ?? null;
}
