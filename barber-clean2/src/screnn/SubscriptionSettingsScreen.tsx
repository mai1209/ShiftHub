import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { deepLinkToSubscriptions, ErrorCode, useIAP } from 'react-native-iap';
import {
  getCurrentUser,
  getPlanPricing,
  syncStoreSubscription,
} from '../services/api';
import { saveUserProfile } from '../services/authStorage';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  buildStoreSyncPayloadFromActiveSubscription,
  buildStoreSyncPayloadFromPurchase,
  getStoreSubscriptionSkus,
  inferPlanFromProductId,
  isStoreBillingPlatform,
  pickPrimaryActiveSubscription,
  STORE_SUBSCRIPTION_PRODUCTS,
} from '../services/storeBilling';
import { isSubscriptionRestricted, resolvePostAuthRoute } from '../services/subscriptionAccess';
import { SHIFT_APP_BRAND_NAME } from '../utils/businessCopy';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, SUPPORT_URL } from '../utils/publicLinks';

const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

type SubscriptionState = {
  plan?: 'free' | 'basic' | 'pro' | 'custom';
  status?: 'trial' | 'active' | 'past_due' | 'cancelled';
  billingCycle?: 'monthly' | 'yearly' | 'custom' | null;
  renewalMode?: 'manual' | 'automatic';
  provider?: 'mercadopago' | 'astropay' | 'apple' | 'google' | null;
  customPriceArs?: number | null;
  customPriceUsdReference?: number | null;
  couponCode?: string | null;
  couponDiscountType?: 'percentage' | 'fixed_usd_reference' | null;
  couponDiscountPercent?: number | null;
  couponDiscountAmountUsdReference?: number | null;
  couponBenefitDurationType?: 'forever' | 'one_time' | 'months' | null;
  couponBenefitDurationValue?: number | null;
  couponValidUntil?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  mercadoPagoPreapprovalId?: string | null;
  mercadoPagoPreapprovalStatus?: string | null;
  mercadoPagoPaymentId?: string | null;
  astroPayPaymentId?: string | null;
  nextBillingAt?: string | null;
  storeProductId?: string | null;
  storeCurrentPlanId?: string | null;
  storePurchaseToken?: string | null;
  storeTransactionId?: string | null;
  storeOriginalTransactionId?: string | null;
  storeEnvironment?: string | null;
  storeLastSyncedAt?: string | null;
  storeAutoRenewing?: boolean;
  storeStatus?: string | null;
};

type AccountState = {
  registrationSource?: 'web' | 'mobile' | null;
};

const PLAN_COPY: Record<
  NonNullable<SubscriptionState['plan']>,
  {
    label: string;
    summary: string;
    price: string;
    includes: string[];
  }
> = {
  free: {
    label: 'Gratis',
    summary: 'Versión inicial para empezar a usar la app con límites concretos.',
    price: 'Sin cargo',
    includes: [
      'Acceso al Home y operación básica',
      '1 profesional activo',
      'Servicios y turnos para empezar a trabajar',
      'Upgrade cuando necesites desbloquear más funciones',
    ],
  },
  basic: {
    label: 'Básico',
    summary: 'Todo lo necesario para vender turnos online y ordenar la agenda.',
    price: 'ARS 25.000 / mes · ref. USD 25',
    includes: [
      'Logo, colores y link personalizado',
      'Mercado Pago y cobro online',
      'Barberos, servicios y turnos ilimitados',
      'Mails y recordatorios automáticos',
    ],
  },
  pro: {
    label: 'Pro',
    summary: 'Más control del negocio con métricas, historial y exportaciones.',
    price: 'ARS 35.000 / mes · ref. USD 35',
    includes: [
      'Todo lo del plan Básico',
      'Métricas generales e individuales',
      'Historial de turnos, servicios y caja',
      'Exportación por mail, PDF y Excel',
    ],
  },
  custom: {
    label: 'Personalizable',
    summary: 'Marca propia, dominio propio y solución hecha a medida.',
    price: 'A medida',
    includes: [
      'Todo lo del plan Pro',
      'Web personalizada',
      'Dominio y branding propios',
      'App con nombre propio',
    ],
  },
};

function applyFixedDiscountByUsdReference(amountArs: number, baseUsdReference: number, discountUsdReference: number) {
  if (!(amountArs > 0) || !(baseUsdReference > 0) || !(discountUsdReference > 0)) {
    return amountArs;
  }

  const arsPerUsd = amountArs / baseUsdReference;
  const discountArs = Number((arsPerUsd * discountUsdReference).toFixed(2));
  return Math.max(0, Number((amountArs - discountArs).toFixed(2)));
}

function formatDateLabel(value?: string | null) {
  if (!value) return 'Sin fecha definida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha definida';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getStatusCopy(status?: SubscriptionState['status']) {
  switch (status) {
    case 'active':
      return { label: 'Activa', color: '#21C063' };
    case 'past_due':
      return { label: 'Pago pendiente', color: '#F5C451' };
    case 'cancelled':
      return { label: 'Cancelada', color: '#FF5A5F' };
    case 'trial':
    default:
      return { label: 'Cuenta de prueba', color: '#5A8CFF' };
  }
}

function getPlanAccent(plan: SubscriptionState['plan'], theme: Theme) {
  if (plan === 'pro') return '#21C063';
  if (plan === 'custom') return '#F5C451';
  return theme.primary;
}

function getCycleCopy(cycle?: SubscriptionState['billingCycle']) {
  switch (cycle) {
    case 'yearly':
      return 'Anual';
    case 'custom':
      return 'Manual / especial';
    case 'monthly':
    default:
      return 'Mensual';
  }
}

export default function SubscriptionSettingsScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isIOS = Platform.OS === 'ios';
  const usesStoreBilling = isStoreBillingPlatform();
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [currentUser, setCurrentUser] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingSyncing, setBillingSyncing] = useState(false);
  const [priceOverrides, setPriceOverrides] = useState({
    basic: { ars: 25000, usdReference: 25 },
    pro: { ars: 35000, usdReference: 35 },
  });
  const subscriptionProvider = String(subscription?.provider || '').trim().toLowerCase();
  const isWebSubscriptionAccount =
    subscriptionProvider === 'mercadopago' || subscriptionProvider === 'astropay';
  const isAppleSubscriptionAccount = subscriptionProvider === 'apple';
  const isGoogleSubscriptionAccount = subscriptionProvider === 'google';
  const registrationSource = String(currentUser?.registrationSource || '')
    .trim()
    .toLowerCase();
  const hasStoreSubscriptionLink =
    isAppleSubscriptionAccount ||
    isGoogleSubscriptionAccount ||
    Boolean(
      subscription?.storeProductId ||
        subscription?.storePurchaseToken ||
        subscription?.storeTransactionId ||
        subscription?.storeOriginalTransactionId,
    );
  const hasWebPaymentLink =
    isWebSubscriptionAccount ||
    Boolean(
      subscription?.mercadoPagoPreapprovalId ||
        subscription?.mercadoPagoPreapprovalStatus ||
        subscription?.mercadoPagoPaymentId ||
        subscription?.astroPayPaymentId,
    );
  const currentPlan = subscription?.plan ?? 'free';
  const isPaidPlan =
    currentPlan === 'basic' || currentPlan === 'pro' || currentPlan === 'custom';
  const isExplicitWebAccount = registrationSource === 'web';
  const isLegacyWebManagedAccount =
    !registrationSource &&
    !hasStoreSubscriptionLink &&
    (hasWebPaymentLink ||
      (isPaidPlan &&
        (subscription?.billingCycle === 'monthly' ||
          subscription?.billingCycle === 'yearly' ||
          subscription?.billingCycle === 'custom' ||
          subscription?.renewalMode === 'manual')));
  const isWebManagedAccount = isExplicitWebAccount || isLegacyWebManagedAccount;
  const canUseStoreBillingForAccount =
    usesStoreBilling &&
    !isWebManagedAccount &&
    !isWebSubscriptionAccount &&
    ((Platform.OS === 'ios' && !isGoogleSubscriptionAccount) ||
      (Platform.OS === 'android' && !isAppleSubscriptionAccount));
  const canUseAppleBillingForAccount = Platform.OS === 'ios' && canUseStoreBillingForAccount;
  const canUseGoogleBillingForAccount =
    Platform.OS === 'android' && canUseStoreBillingForAccount;
  const {
    connected: billingConnected,
    subscriptions: storeSubscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getActiveSubscriptions,
    restorePurchases,
  } = useIAP({
    onPurchaseSuccess: async purchase => {
      if (!canUseStoreBillingForAccount) {
        Alert.alert(
          'Suscripción no disponible',
          'Esta cuenta ya tiene una suscripción asociada a otro canal.',
        );
        return;
      }

      const payload = buildStoreSyncPayloadFromPurchase(purchase);
      if (!payload) {
        Alert.alert('Compra recibida', 'Recibimos la compra, pero no pudimos asociarla a un plan válido.');
        return;
      }

      try {
        setBillingBusy(true);
        const response = await syncStoreSubscription(payload);
        await saveUserProfile(response.user);
        setSubscription(response.user?.subscription ?? null);
        await finishTransaction({ purchase, isConsumable: false });
        const nextRoute = resolvePostAuthRoute(response.user);
        Alert.alert('Plan activado', 'La suscripción del negocio quedó activa en esta cuenta.', [
          {
            text: 'Continuar',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: nextRoute }],
              });
            },
          },
        ]);
      } catch (error: any) {
        Alert.alert(
          'No pudimos activar el plan',
          error?.message ?? 'La compra se registró, pero no pudimos sincronizarla con tu cuenta.',
        );
      } finally {
        setBillingBusy(false);
      }
    },
    onPurchaseError: error => {
      if (error.code !== ErrorCode.UserCancelled) {
        Alert.alert('No pudimos completar la compra', error.message || 'Probá de nuevo.');
      }
      setBillingBusy(false);
    },
    onError: error => {
      console.log('Store billing error', error);
    },
  });

  const syncActiveStoreSubscription = useCallback(
    async (options?: { redirectOnSuccess?: boolean }) => {
    if (!canUseStoreBillingForAccount || !billingConnected) return false;

    try {
      setBillingSyncing(true);
      const activeSubscriptions = await getActiveSubscriptions(getStoreSubscriptionSkus());
      const primarySubscription = pickPrimaryActiveSubscription(
        activeSubscriptions.filter(item => item.isActive),
      );

      if (!primarySubscription) {
        return false;
      }

      const payload = buildStoreSyncPayloadFromActiveSubscription(primarySubscription);
      if (!payload) {
        return false;
      }

      const response = await syncStoreSubscription(payload);
      await saveUserProfile(response.user);
      setSubscription(response.user?.subscription ?? null);
      if (
        options?.redirectOnSuccess &&
        response.user &&
        !isSubscriptionRestricted(response.user?.subscription?.status)
      ) {
        const nextRoute = resolvePostAuthRoute(response.user);
        navigation.reset({
          index: 0,
          routes: [{ name: nextRoute }],
        });
      }
      return true;
    } catch (error) {
      console.log('No se pudo sincronizar la suscripción activa del store', error);
      return false;
    } finally {
      setBillingSyncing(false);
    }
    },
    [billingConnected, canUseStoreBillingForAccount, getActiveSubscriptions, navigation],
  );

  const loadSubscription = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [res, pricingResponse] = await Promise.all([getCurrentUser(), getPlanPricing()]);
      setCurrentUser(res.user ?? null);
      setSubscription(res.user?.subscription ?? null);
      await saveUserProfile(res.user);
      setPriceOverrides({
        basic: {
          ars: Number(pricingResponse.pricing?.basic?.ars || 25000),
          usdReference: Number(pricingResponse.pricing?.basic?.usdReference || 25),
        },
        pro: {
          ars: Number(pricingResponse.pricing?.pro?.ars || 35000),
          usdReference: Number(pricingResponse.pricing?.pro?.usdReference || 35),
        },
      });
    } catch (error: any) {
      Alert.alert('No pudimos cargar el plan', error?.message ?? 'Probá de nuevo.');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    if (!canUseStoreBillingForAccount || !billingConnected) return;

    console.log('[StoreBilling] fetchProducts:start', {
      platform: Platform.OS,
      billingConnected,
      skus: getStoreSubscriptionSkus(),
    });

    fetchProducts({ skus: getStoreSubscriptionSkus(), type: 'subs' })
      .then(result => {
        console.log(
          '[StoreBilling] fetchProducts:success',
          Array.isArray(result)
            ? result.map(item => ({
                id: item?.id,
                displayName: 'displayName' in item ? item.displayName : null,
                title: 'title' in item ? item.title : null,
              }))
            : result,
        );
      })
      .catch(error => {
        console.log('No se pudieron cargar los planes del store', error);
      });
  }, [billingConnected, canUseStoreBillingForAccount, fetchProducts]);

  useEffect(() => {
    if (!canUseStoreBillingForAccount || !billingConnected || loading) return;
    syncActiveStoreSubscription().catch(error => {
      console.log('No se pudo sincronizar la suscripción activa', error);
    });
  }, [billingConnected, canUseStoreBillingForAccount, loading, syncActiveStoreSubscription]);

  useEffect(() => {
    if (!usesStoreBilling) return;

    console.log('[StoreBilling] state', {
      platform: Platform.OS,
      billingConnected,
      subscriptionsCount: storeSubscriptions.length,
      subscriptionIds: storeSubscriptions.map(item => item.id),
    });
  }, [billingConnected, storeSubscriptions, usesStoreBilling]);

  const planKey = currentPlan;
  const planInfo = PLAN_COPY[planKey];
  const planAccent = getPlanAccent(planKey, theme);
  const basePriceArs =
    planKey === 'basic' ? priceOverrides.basic.ars : planKey === 'pro' ? priceOverrides.pro.ars : 0;
  const baseUsdReference =
    planKey === 'basic'
      ? priceOverrides.basic.usdReference
      : planKey === 'pro'
        ? priceOverrides.pro.usdReference
        : 0;
  const couponStillValid =
    !subscription?.couponValidUntil ||
    new Date(subscription.couponValidUntil).getTime() >= Date.now();
  const hasFixedUsdCoupon =
    subscription?.couponDiscountType === 'fixed_usd_reference' &&
    Number(subscription?.couponDiscountAmountUsdReference || 0) > 0 &&
    couponStillValid;
  const hasPercentCoupon =
    Number(subscription?.couponDiscountPercent || 0) > 0 && couponStillValid;
  const calculatedCouponArs = hasFixedUsdCoupon
    ? applyFixedDiscountByUsdReference(
        basePriceArs,
        baseUsdReference,
        Number(subscription?.couponDiscountAmountUsdReference || 0),
      )
    : hasPercentCoupon
      ? basePriceArs * (1 - Number(subscription?.couponDiscountPercent || 0) / 100)
      : basePriceArs;
  const calculatedCouponUsdReference = hasFixedUsdCoupon
    ? Math.max(
        0,
        Number(
          (
            baseUsdReference - Number(subscription?.couponDiscountAmountUsdReference || 0)
          ).toFixed(2),
        ),
      )
    : hasPercentCoupon
      ? baseUsdReference * (1 - Number(subscription?.couponDiscountPercent || 0) / 100)
      : baseUsdReference;
  const effectiveArs =
    planKey === 'basic' || planKey === 'pro'
      ? Number(subscription?.customPriceArs ?? calculatedCouponArs)
      : null;
  const effectiveUsdReference =
    planKey === 'basic' || planKey === 'pro'
      ? Number(subscription?.customPriceUsdReference ?? calculatedCouponUsdReference)
      : null;
  const effectivePlanPrice =
    planKey === 'basic' || planKey === 'pro'
      ? `ARS ${Number(effectiveArs || 0).toLocaleString('es-AR')} / mes · ref. USD ${Number(
          effectiveUsdReference || 0,
        )}`
      : planInfo.price;
  const discountArs =
    planKey === 'basic' || planKey === 'pro'
      ? Math.max(0, Number(basePriceArs || 0) - Number(effectiveArs || 0))
      : 0;
  const statusInfo = getStatusCopy(subscription?.status);
  const expiresAtDate = subscription?.expiresAt ? new Date(subscription.expiresAt) : null;
  const daysRemaining =
    expiresAtDate && !Number.isNaN(expiresAtDate.getTime())
      ? Math.ceil((expiresAtDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;
  const isRestrictedAccount =
    subscription?.status === 'past_due' ||
    subscription?.status === 'cancelled';
  const hasWebAutomaticRenewal =
    isWebSubscriptionAccount &&
    subscription?.renewalMode === 'automatic' &&
    Boolean(subscription?.mercadoPagoPreapprovalId);
  const hasStoreAutomaticRenewal =
    (isAppleSubscriptionAccount || isGoogleSubscriptionAccount) &&
    subscription?.renewalMode === 'automatic';
  const nextRelevantBillingDate =
    subscription?.nextBillingAt || subscription?.expiresAt || null;
  const currentStoreProductId = String(subscription?.storeProductId || '').trim() || null;
  const currentStorePlan = inferPlanFromProductId(currentStoreProductId) ?? planKey;
  const basicStoreProduct = storeSubscriptions.find(product => product.id === STORE_SUBSCRIPTION_PRODUCTS.basic);
  const proStoreProduct = storeSubscriptions.find(product => product.id === STORE_SUBSCRIPTION_PRODUCTS.pro);
  const currentGooglePurchaseToken =
    subscription?.storePurchaseToken || null;
  const webManagedAccountMessage =
    subscription?.status === 'past_due' || subscription?.status === 'cancelled'
      ? 'Tu plan venció.'
      : planKey === 'free'
        ? 'Esta cuenta está usando el acceso limitado. Para desbloquear todas las funciones, pagá la suscripción.'
        : 'Esta cuenta está activa. En este dispositivo solo mostramos el estado comercial.';

  const getRenewalHint = () => {
    if (isWebManagedAccount && usesStoreBilling) {
      return webManagedAccountMessage;
    }

    if (isWebSubscriptionAccount && usesStoreBilling) {
      if (subscription?.status === 'active') {
        return 'La cuenta está activa. En este dispositivo solo mostramos el estado general del acceso.';
      }

      return 'La cuenta no tiene acceso operativo en este momento. En este dispositivo solo mostramos el estado general.';
    }

    if (canUseStoreBillingForAccount) {
      if (subscription?.status === 'past_due') {
        return 'La suscripción del negocio quedó con pago pendiente. Revisala desde el store o restaurá la compra.';
      }

      if (subscription?.status === 'cancelled') {
        return 'La suscripción del negocio está cancelada. Podés reactivarla comprando nuevamente el plan.';
      }

      if (!expiresAtDate || Number.isNaN(expiresAtDate.getTime())) {
        return 'Comprá o restaurá tu plan para habilitar el acceso operativo completo.';
      }

      return 'Gestioná la suscripción del negocio desde tu store cuando necesites cambiar, renovar o restaurar el plan.';
    }

    if (!expiresAtDate || Number.isNaN(expiresAtDate.getTime())) {
      return 'Podés renovar tu plan desde esta pantalla cuando lo necesites.';
    }

    if (subscription?.status === 'past_due') {
      return 'Tu plan está pendiente de pago. Renovalo para volver a quedar activo.';
    }

    if (subscription?.status === 'cancelled') {
      return 'Tu plan fue desactivado. Podés activarlo otra vez desde esta pantalla.';
    }

    if (typeof daysRemaining === 'number' && daysRemaining <= 1) {
      return 'Tu plan vence muy pronto. Renovalo ahora para evitar cortes.';
    }

    if (typeof daysRemaining === 'number' && daysRemaining <= 7) {
      return `Tu plan vence en ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}.`;
    }

    return 'Tu plan está activo. Si querés, podés renovarlo antes del vencimiento.';
  };

  const openSupportMail = async () => {
    try {
      await Linking.openURL(
        Platform.OS === 'ios'
          ? SUPPORT_URL
          : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Consulta sobre plan ${SHIFT_APP_BRAND_NAME}`)}`,
      );
    } catch {
      Alert.alert('No pudimos abrir el soporte', Platform.OS === 'ios' ? SUPPORT_URL : SUPPORT_EMAIL);
    }
  };

  const openExternalUrl = async (url: string, fallbackLabel: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No pudimos abrir el enlace', fallbackLabel);
    }
  };

  const handlePurchasePlan = async (targetPlan: 'basic' | 'pro') => {
    if (!canUseStoreBillingForAccount) {
      Alert.alert(
        'Plan no disponible',
        'Esta cuenta ya tiene una suscripción asociada a otro canal.',
      );
      return;
    }

    const targetProductId = STORE_SUBSCRIPTION_PRODUCTS[targetPlan];
    const product = storeSubscriptions.find(item => item.id === targetProductId);

    console.log('[StoreBilling] purchase:attempt', {
      targetPlan,
      targetProductId,
      billingConnected,
      availableProductIds: storeSubscriptions.map(item => item.id),
      matchedProduct: product
        ? {
            id: product.id,
            displayName: 'displayName' in product ? product.displayName : null,
            title: 'title' in product ? product.title : null,
          }
        : null,
    });

    if (!product) {
      Alert.alert('Plan no disponible', 'Todavía no pudimos cargar este plan desde la tienda.');
      return;
    }

    try {
      setBillingBusy(true);

      if (Platform.OS === 'ios') {
        await requestPurchase({
          type: 'subs',
          request: {
            apple: {
              sku: targetProductId,
            },
          },
        });
        return;
      }

      const androidProduct = product.platform === 'android' ? product : null;
      const firstOfferToken =
        androidProduct?.subscriptionOffers?.[0]?.offerTokenAndroid ||
        androidProduct?.subscriptionOfferDetailsAndroid?.[0]?.offerToken ||
        null;

      await requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [targetProductId],
            ...(firstOfferToken
              ? {
                  subscriptionOffers: [
                    {
                      sku: targetProductId,
                      offerToken: firstOfferToken,
                    },
                  ],
                }
              : {}),
            ...(currentStoreProductId &&
            currentStorePlan &&
            currentStorePlan !== targetPlan &&
            currentGooglePurchaseToken
              ? {
                  purchaseToken: currentGooglePurchaseToken,
                  subscriptionProductReplacementParams: {
                    oldProductId: currentStoreProductId,
                    replacementMode: 'with-time-proration',
                  },
                }
              : {}),
          },
        },
      });
    } catch (error: any) {
      setBillingBusy(false);
      Alert.alert('No pudimos abrir la compra', error?.message ?? 'Probá de nuevo.');
    }
  };

  const handleRestorePurchases = async () => {
    if (!canUseStoreBillingForAccount) {
      Alert.alert(
        'Restauración no disponible',
        'Esta cuenta ya tiene una suscripción asociada a otro canal.',
      );
      return;
    }

    try {
      setBillingBusy(true);
      await restorePurchases();
      const synced = await syncActiveStoreSubscription({ redirectOnSuccess: true });
      if (synced) {
        Alert.alert('Compra restaurada', 'La suscripción del negocio volvió a quedar activa.');
      } else {
        Alert.alert('Sin compras activas', 'No encontramos una suscripción activa para esta cuenta.');
      }
    } catch (error: any) {
      Alert.alert('No pudimos restaurar la compra', error?.message ?? 'Probá de nuevo.');
    } finally {
      setBillingBusy(false);
    }
  };

  const handleManageStoreSubscription = async () => {
    if (!canUseStoreBillingForAccount) {
      Alert.alert(
        'Gestión no disponible',
        'Esta cuenta ya tiene una suscripción asociada a otro canal.',
      );
      return;
    }

    try {
      await deepLinkToSubscriptions(
        Platform.OS === 'android' && currentStoreProductId
          ? { skuAndroid: currentStoreProductId }
          : undefined,
      );
    } catch (error: any) {
      Alert.alert('No pudimos abrir la suscripción', error?.message ?? 'Probá de nuevo.');
    }
  };

  if (isIOS) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadSubscription(true)} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>PLAN Y SUSCRIPCIÓN</Text>
          <Text style={styles.title}>Suscripción del negocio</Text>
       
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.loadingText}>Cargando estado de la cuenta...</Text>
          </View>
        ) : (
          <>
            {isRestrictedAccount ? (
              <View style={styles.lockedCard}>
                <Text style={styles.lockedEyebrow}>ACCESO LIMITADO</Text>
                <Text style={styles.lockedTitle}>Esta cuenta tiene acceso limitado</Text>
                <Text style={styles.lockedText}>
                  {isWebManagedAccount
                    ? webManagedAccountMessage
                    : canUseAppleBillingForAccount
                    ? 'Comprá o restaurá la suscripción del negocio para volver a habilitar el acceso operativo completo.'
                    : 'Esta cuenta no tiene acceso operativo en este momento. Por ahora solo mostramos el estado general.'}
                </Text>
              </View>
            ) : null}

            <View style={styles.statusCard}>
              <View style={styles.statusTopRow}>
                <View>
                  <Text style={styles.planLabel}>Plan actual</Text>
                  <Text style={styles.planValue}>{planInfo.label}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}22` }]}>
                  <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                    {statusInfo.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.planSummary}>
                {isWebManagedAccount
                  ? webManagedAccountMessage
                  : canUseAppleBillingForAccount
                  ? 'El plan del negocio se administra con tu suscripción de la App Store.'
                  : 'Información general del acceso disponible en esta cuenta.'}
              </Text>

              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Estado</Text>
                  <Text style={[styles.metaValue, { color: statusInfo.color }]}>
                    {statusInfo.label}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Plan</Text>
                  <Text style={styles.metaValue}>{planInfo.label}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Inicio</Text>
                  <Text style={styles.metaValue}>{formatDateLabel(subscription?.startedAt)}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Vencimiento</Text>
                  <Text style={styles.metaValue}>{formatDateLabel(subscription?.expiresAt)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.actionsCard}>
              <Text style={styles.sectionTitle}>Administrar plan</Text>
              <View style={styles.renewalHintCard}>
                <Text style={styles.renewalHintTitle}>Suscripción actual</Text>
                <View style={styles.renewalMetaList}>
                  <View style={styles.renewalMetaRow}>
                    <Text style={styles.renewalMetaLabel}>Estado</Text>
                    <Text style={[styles.renewalMetaValue, { color: statusInfo.color }]}>
                      {statusInfo.label}
                    </Text>
                  </View>
                  <View style={styles.renewalMetaRow}>
                    <Text style={styles.renewalMetaLabel}>Vencimiento</Text>
                    <Text style={styles.renewalMetaValue}>
                      {formatDateLabel(nextRelevantBillingDate)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.renewalHintText}>{getRenewalHint()}</Text>
              </View>

              {canUseAppleBillingForAccount ? (
                <>
                  <View style={styles.includesCard}>
                    <Text style={styles.sectionTitle}>Elegí un plan</Text>
                    <View style={styles.subscriptionLegalCard}>
                      <Text style={styles.subscriptionLegalTitle}>Suscripciones disponibles</Text>
                      <View style={styles.subscriptionLegalRow}>
                        <Text style={styles.subscriptionLegalPlan}>{SHIFT_APP_BRAND_NAME} Básico</Text>
                        <Text style={styles.subscriptionLegalMeta}>
                          Renovación automática mensual
                          {basicStoreProduct?.displayPrice ? ` · ${basicStoreProduct.displayPrice}` : ''}
                        </Text>
                      </View>
                      <View style={styles.subscriptionLegalRow}>
                        <Text style={styles.subscriptionLegalPlan}>{SHIFT_APP_BRAND_NAME} Pro</Text>
                        <Text style={styles.subscriptionLegalMeta}>
                          Renovación automática mensual
                          {proStoreProduct?.displayPrice ? ` · ${proStoreProduct.displayPrice}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.subscriptionLegalFootnote}>
                        La suscripción se renueva automáticamente hasta que la canceles desde tu cuenta
                        de Apple. El precio y la duración del plan se muestran antes de confirmar la
                        compra.
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.primaryButton, billingBusy && styles.primaryButtonDisabled]}
                      onPress={() => handlePurchasePlan('basic')}
                      disabled={billingBusy || billingSyncing}
                    >
                      <Text style={styles.primaryButtonText}>
                        {billingBusy && currentStorePlan !== 'pro' ? 'Abriendo compra...' : `Activar Básico${basicStoreProduct?.displayPrice ? ` · ${basicStoreProduct.displayPrice}` : ''}`}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primaryButton, billingBusy && styles.primaryButtonDisabled]}
                      onPress={() => handlePurchasePlan('pro')}
                      disabled={billingBusy || billingSyncing}
                    >
                      <Text style={styles.primaryButtonText}>
                        {billingBusy && currentStorePlan === 'pro' ? 'Abriendo compra...' : `Activar Pro${proStoreProduct?.displayPrice ? ` · ${proStoreProduct.displayPrice}` : ''}`}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.iosNoticeCard}>
                    <Text style={styles.iosNoticeTitle}>Restaurar o gestionar</Text>
                    <Text style={styles.iosNoticeText}>
                      Si ya compraste un plan, podés restaurarlo. Si necesitás cambiar o cancelar, lo
                      gestionás desde Apple.
                    </Text>
                  </View>

                  <Pressable
                    style={[styles.secondaryButton, billingBusy && styles.primaryButtonDisabled]}
                    onPress={handleRestorePurchases}
                    disabled={billingBusy || billingSyncing}
                  >
                    <Text style={styles.secondaryButtonText}>Restaurar compra</Text>
                  </Pressable>

                  <Pressable style={styles.secondaryButton} onPress={handleManageStoreSubscription}>
                    <Text style={styles.secondaryButtonText}>Gestionar suscripción</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.iosNoticeCard}>
                  <Text style={styles.iosNoticeTitle}>Estado de la cuenta</Text>
                  <Text style={styles.iosNoticeText}>
                    {isWebManagedAccount
                      ? webManagedAccountMessage
                      : 'En este dispositivo solo mostramos la información general del acceso y el estado actual.'}
                  </Text>
                </View>
              )}

              <Pressable style={styles.ghostButton} onPress={openSupportMail}>
                <Text style={styles.ghostButtonText}>Hablar con soporte</Text>
              </Pressable>

              {canUseAppleBillingForAccount ? (
                <View style={styles.subscriptionLegalLinksCard}>
                  <Text style={styles.subscriptionLegalLinksTitle}>Información legal</Text>
                  <Pressable
                    style={styles.legalLinkButton}
                    onPress={() => openExternalUrl(TERMS_OF_USE_URL, TERMS_OF_USE_URL)}
                  >
                    <Text style={styles.legalLinkButtonText}>Términos de uso (EULA)</Text>
                  </Pressable>
                  <Pressable
                    style={styles.legalLinkButton}
                    onPress={() => openExternalUrl(PRIVACY_POLICY_URL, PRIVACY_POLICY_URL)}
                  >
                    <Text style={styles.legalLinkButtonText}>Política de privacidad</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadSubscription(true)} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PLAN Y SUSCRIPCIÓN</Text>
        <Text style={styles.title}>Estado comercial de tu cuenta</Text>
        <Text style={styles.subtitle}>
          {isIOS
            ? 'Acá ves el estado actual de la cuenta y la información necesaria para seguir usando la app.'
            : 'Acá ves qué plan tenés activo, cómo está la cuenta y qué incluye hoy tu negocio.'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={styles.loadingText}>Cargando estado del plan...</Text>
        </View>
      ) : (
        <>
          {isRestrictedAccount ? (
            <View style={styles.lockedCard}>
              <Text style={styles.lockedEyebrow}>ACCESO LIMITADO</Text>
              <Text style={styles.lockedTitle}>Esta cuenta tiene acceso limitado</Text>
              <Text style={styles.lockedText}>
                Esta cuenta no tiene acceso operativo en este momento. Por ahora dejamos
                bloqueado el panel principal y solo mostramos el estado general.
              </Text>
              <Text style={styles.lockedHint}>
                {isIOS
                  ? 'Si necesitás revisar esta cuenta desde iPhone, escribile a soporte.'
                  : 'Para activar tu cuenta, completá el pago desde la web o pedile a soporte que la active.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.statusCard}>
            <View style={styles.statusTopRow}>
              <View>
                <Text style={styles.planLabel}>Plan actual</Text>
                <Text style={styles.planValue}>{planInfo.label}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}22` }]}>
                <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>

            <Text style={styles.planSummary}>
              {isIOS ? 'Información general del acceso disponible en esta cuenta.' : planInfo.summary}
            </Text>
            {!isIOS ? (
              <Text style={[styles.planPrice, { color: planAccent }]}>Precio: {effectivePlanPrice}</Text>
            ) : null}
            {!isIOS && discountArs > 0 ? (
              <View style={styles.discountCard}>
                <Text style={styles.discountTitle}>Descuento aplicado</Text>
                <Text style={styles.discountText}>
                  Se te aplicó un descuento de ARS {discountArs.toLocaleString('es-AR')} sobre el valor del plan
                  {subscription?.couponCode ? ` con el cupón ${subscription.couponCode}` : ''}
                  {subscription?.couponDiscountType === 'fixed_usd_reference' &&
                  Number(subscription?.couponDiscountAmountUsdReference || 0) > 0
                    ? ` equivalente a USD ${Number(subscription?.couponDiscountAmountUsdReference || 0).toLocaleString('es-AR')} de referencia`
                    : ''}
                  {subscription?.couponBenefitDurationType === 'forever'
                    ? '.'
                    : subscription?.couponBenefitDurationType === 'one_time'
                      ? ' solo en el primer pago.'
                      : subscription?.couponValidUntil
                        ? ` durante ${subscription.couponBenefitDurationValue || 0} mes${Number(subscription?.couponBenefitDurationValue || 0) === 1 ? '' : 'es'}, hasta ${formatDateLabel(subscription.couponValidUntil)}.`
                        : '.'}
                </Text>
              </View>
            ) : null}

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Ciclo</Text>
                <Text style={styles.metaValue}>{getCycleCopy(subscription?.billingCycle)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Inicio</Text>
                <Text style={styles.metaValue}>{formatDateLabel(subscription?.startedAt)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Vencimiento</Text>
                <Text style={styles.metaValue}>{formatDateLabel(subscription?.expiresAt)}</Text>
              </View>
            </View>
          </View>

          {!isIOS ? (
            <View style={styles.includesCard}>
              <Text style={styles.sectionTitle}>Qué incluye hoy tu plan</Text>
              {planInfo.includes.map(item => (
                <View key={item} style={styles.includeRow}>
                  <View style={[styles.includeDot, { backgroundColor: planAccent }]} />
                  <Text style={styles.includeText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.actionsCard}>
            <Text style={styles.sectionTitle}>
              {isIOS ? 'Ayuda con la cuenta' : 'Acciones rápidas'}
            </Text>
            {!isIOS && hasStoreAutomaticRenewal ? (
              <View style={styles.autoRenewCard}>
                <Text style={styles.autoRenewTitle}>Renovación automática activa</Text>
                <Text style={styles.autoRenewText}>
                  Google Play va a gestionar la renovación automática de este plan.
                </Text>
                <Text style={styles.autoRenewMeta}>
                  Próximo intento: {formatDateLabel(subscription?.nextBillingAt || subscription?.expiresAt)}
                </Text>
              </View>
            ) : !isIOS && canUseGoogleBillingForAccount ? (
              <View style={styles.autoRenewCard}>
                <Text style={styles.autoRenewTitle}>Compra desde Google Play</Text>
                <Text style={styles.autoRenewText}>
                  La suscripción del negocio se compra, restaura y gestiona desde Google Play.
                </Text>
              </View>
            ) : !isIOS && isWebSubscriptionAccount ? (
              <View style={styles.autoRenewCard}>
                <Text style={styles.autoRenewTitle}>Estado de la cuenta</Text>
                <Text style={styles.autoRenewText}>
                  En este dispositivo solo mostramos la información general del acceso y el estado actual.
                </Text>
              </View>
            ) : null}
            <View style={styles.renewalHintCard}>
              <Text style={styles.renewalHintTitle}>
                {isIOS
                  ? 'Estado de la cuenta'
                  : subscription?.status === 'past_due' || subscription?.status === 'cancelled'
                    ? 'Estado de renovación'
                    : 'Próximo vencimiento'}
              </Text>
              <View style={styles.renewalMetaList}>
                <View style={styles.renewalMetaRow}>
                  <Text style={styles.renewalMetaLabel}>Estado</Text>
                  <Text style={[styles.renewalMetaValue, { color: statusInfo.color }]}>
                    {statusInfo.label}
                  </Text>
                </View>
                <View style={styles.renewalMetaRow}>
                  <Text style={styles.renewalMetaLabel}>
                    {isIOS ? 'Vencimiento' : hasWebAutomaticRenewal || hasStoreAutomaticRenewal ? 'Próximo cobro' : 'Vence'}
                  </Text>
                  <Text style={styles.renewalMetaValue}>
                    {formatDateLabel(nextRelevantBillingDate)}
                  </Text>
                </View>
                {!isIOS ? (
                  <View style={styles.renewalMetaRow}>
                    <Text style={styles.renewalMetaLabel}>Modo</Text>
                    <Text style={styles.renewalMetaValue}>
                      {hasWebAutomaticRenewal || hasStoreAutomaticRenewal ? 'Renovación automática' : 'Renovación manual'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.renewalHintText}>{getRenewalHint()}</Text>
            </View>
            {isIOS ? (
              <View style={styles.iosNoticeCard}>
                <Text style={styles.iosNoticeTitle}>Soporte para esta cuenta</Text>
                <Text style={styles.iosNoticeText}>
                  Si necesitás ayuda con el acceso, el estado o el vencimiento de esta cuenta, contactá a soporte.
                </Text>
              </View>
            ) : canUseGoogleBillingForAccount ? (
              <>
                <Pressable
                  style={[styles.primaryButton, billingBusy && styles.primaryButtonDisabled]}
                  onPress={() => handlePurchasePlan('basic')}
                  disabled={billingBusy || billingSyncing}
                >
                  <Text style={styles.primaryButtonText}>
                    Activar Básico{basicStoreProduct?.displayPrice ? ` · ${basicStoreProduct.displayPrice}` : ''}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, billingBusy && styles.primaryButtonDisabled]}
                  onPress={() => handlePurchasePlan('pro')}
                  disabled={billingBusy || billingSyncing}
                >
                  <Text style={styles.primaryButtonText}>
                    Activar Pro{proStoreProduct?.displayPrice ? ` · ${proStoreProduct.displayPrice}` : ''}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, billingBusy && styles.primaryButtonDisabled]}
                  onPress={handleRestorePurchases}
                  disabled={billingBusy || billingSyncing}
                >
                  <Text style={styles.secondaryButtonText}>Restaurar compra</Text>
                </Pressable>
                <Pressable style={styles.ghostButton} onPress={handleManageStoreSubscription}>
                  <Text style={styles.ghostButtonText}>Gestionar suscripción en Google Play</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.secondaryButton} onPress={openSupportMail}>
              <Text style={styles.secondaryButtonText}>
                {isIOS ? 'Contactar soporte' : 'Hablar con soporte comercial'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 40,
      paddingBottom: 130,
      gap: 16,
    },
    header: {
      gap: 10,
      paddingTop: 18,
      paddingBottom: 10,
    },
    eyebrow: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    title: {
      color: theme.textPrimary,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
  
    loadingCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    lockedCard: {
      backgroundColor: `${theme.primary}14`,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: `${theme.primary}55`,
      padding: 18,
      gap: 8,
    },
    lockedEyebrow: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    lockedTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '900',
    },
    lockedText: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    lockedHint: {
      color: theme.textPrimary,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    statusCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
      gap: 16,
    },
    statusTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    planLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 4,
    },
    planValue: {
      color: theme.textPrimary,
      fontSize: 24,
      fontWeight: '900',
    },
    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    planSummary: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    planPrice: {
      fontSize: 16,
      fontWeight: '900',
    },
    discountCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    discountTitle: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    discountText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    metaGrid: {
      gap: 12,
    },
    metaItem: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    metaLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 4,
    },
    metaValue: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    includesCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
      gap: 14,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
    },
    includeRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
    },
    includeDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      marginTop: 6,
      flexShrink: 0,
    },
    includeText: {
      flex: 1,
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    actionsCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
      gap: 12,
    },
    autoRenewCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
    },
    autoRenewTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '900',
    },
    autoRenewText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    iosNoticeCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 6,
    },
    iosNoticeTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
    iosNoticeText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    subscriptionLegalCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    subscriptionLegalTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
    subscriptionLegalRow: {
      gap: 2,
    },
    subscriptionLegalPlan: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    subscriptionLegalMeta: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    subscriptionLegalFootnote: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    subscriptionLegalLinksCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    subscriptionLegalLinksTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
    legalLinkButton: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    legalLinkButtonText: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    autoRenewMeta: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 2,
    },
    renewalHintCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
    },
    renewalHintTitle: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    renewalHintText: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    renewalMetaList: {
      gap: 8,
    },
    renewalMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    renewalMetaLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    renewalMetaValue: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'right',
      flexShrink: 1,
    },
    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: 18,
      minHeight: 52,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: theme.textOnPrimary,
      fontSize: 15,
      fontWeight: '900',
    },
    secondaryButton: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      paddingVertical: 15,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    ghostButton: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 15,
      alignItems: 'center',
    },
    ghostButtonText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
  });
