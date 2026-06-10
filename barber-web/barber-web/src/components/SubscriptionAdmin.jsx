import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSubscriptionCoupon,
  deleteAdminUser,
  deleteSubscriptionCoupon,
  fetchPlanPricing,
  fetchSubscriptionCoupons,
  fetchSubscriptions,
  updatePlanPricing,
  updateSubscriptionCoupon,
  updateSubscription,
} from '../services/adminApi';
import styles from '../styles/SubscriptionAdmin.module.css';

const PLAN_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'basic', label: 'Básico' },
  { value: 'pro', label: 'Pro' },
  { value: 'custom', label: 'Personalizable' },
];

const STATUS_OPTIONS = [
  { value: 'trial', label: 'Cuenta de prueba' },
  { value: 'active', label: 'Activa' },
  { value: 'past_due', label: 'Pago pendiente' },
  { value: 'cancelled', label: 'Cancelada' },
];

const BILLING_OPTIONS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'yearly', label: 'Anual' },
  { value: 'custom', label: 'Manual / especial' },
];

const RENEWAL_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automática' },
];

const PLAN_PRICE_META = [
  {
    key: 'basic',
    label: 'Básico',
    accentClassName: styles.priceCardPink,
    description: 'Turnos online, cobro online, mails y automatización base.',
  },
  {
    key: 'pro',
    label: 'Pro',
    accentClassName: styles.priceCardGreen,
    description: 'Todo lo anterior más métricas, historial y exportaciones.',
  },
  {
    key: 'custom',
    label: 'Personalizable',
    accentClassName: styles.priceCardGold,
    description: 'Marca propia, dominio propio y solución comercial a medida.',
  },
];

const MONTH_LABELS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const PUBLIC_PLANS_BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/planes`
    : '/planes';

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveRenewalModeLabel(value) {
  return value === 'automatic' ? 'Automática' : 'Manual';
}

function getCouponDurationBadge(coupon) {
  if (coupon?.benefitDurationType === 'one_time') {
    return {
      label: 'Primer pago',
      className: styles.couponBadgeOneTime,
    };
  }

  if (coupon?.benefitDurationType === 'days') {
    return {
      label: `${coupon?.benefitDurationValue || 0} dias`,
      className: styles.couponBadgeMonths,
    };
  }

  if (coupon?.benefitDurationType === 'months') {
    return {
      label: `${coupon?.benefitDurationValue || 0} meses`,
      className: styles.couponBadgeMonths,
    };
  }

  return {
    label: 'Permanente',
    className: styles.couponBadgeForever,
  };
}

function getCouponDiscountLabel(coupon) {
  if (coupon?.discountType === 'fixed_usd_reference') {
    return `USD ${Number(coupon?.discountAmountUsdReference || 0).toLocaleString('es-AR')} OFF`;
  }

  return `${Number(coupon?.discountPercent || 0).toLocaleString('es-AR')}% OFF`;
}

function buildCouponEditDraft(coupon) {
  return {
    expiresAt: formatDateInputValue(coupon?.expiresAt),
    maxRedemptions:
      coupon?.maxRedemptions != null && coupon?.maxRedemptions !== ''
        ? String(coupon.maxRedemptions)
        : '',
    isActive: Boolean(coupon?.isActive),
    internalNote: coupon?.internalNote || '',
  };
}

function isCouponExpired(coupon) {
  if (!coupon?.expiresAt) return false;
  const expiresAt = new Date(coupon.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() < Date.now();
}

function isSubscriptionCouponStillValid(subscription) {
  if (!subscription?.couponCode) return false;
  if (!subscription?.couponValidUntil) return true;

  const validUntil = new Date(subscription.couponValidUntil);
  if (Number.isNaN(validUntil.getTime())) return true;
  return validUntil.getTime() >= Date.now();
}

function getSubscriptionDiscountLabel(subscription) {
  if (!isSubscriptionCouponStillValid(subscription)) return '';

  if (subscription?.couponDiscountType === 'fixed_usd_reference') {
    return `USD ${Number(subscription?.couponDiscountAmountUsdReference || 0).toLocaleString('es-AR')} OFF`;
  }

  return `${Number(subscription?.couponDiscountPercent || 0).toLocaleString('es-AR')}% OFF`;
}

function hasSubscriptionDiscount(subscription) {
  return (
    subscription?.customPriceArs != null ||
    subscription?.customPriceUsdReference != null ||
    (isSubscriptionCouponStillValid(subscription) &&
      (Number(subscription?.couponDiscountPercent || 0) > 0 ||
        Number(subscription?.couponDiscountAmountUsdReference || 0) > 0))
  );
}

function buildRenewalUrl({ email, plan, renewalMode }) {
  const params = new URLSearchParams();
  if (email) params.set('email', String(email));
  if (plan === 'basic' || plan === 'pro') params.set('plan', plan);
  if (renewalMode) params.set('mode', renewalMode);
  return `${PUBLIC_PLANS_BASE_URL}?${params.toString()}`;
}

function resolveNextDueDate(subscription) {
  return subscription?.expiresAt || subscription?.nextBillingAt || null;
}

function resolvePlanStatusMeta(subscription) {
  const dueDateValue = resolveNextDueDate(subscription);
  const status = String(subscription?.status || 'active');

  if (dueDateValue && isOverdue(subscription)) {
    return {
      label: 'Vencido',
      className: 'planStatusExpired',
      dueLabel: `Vence: ${formatDate(dueDateValue)}`,
    };
  }

  if (!dueDateValue) {
    return {
      label: status === 'past_due' || status === 'cancelled' ? 'Vencido' : 'Activo',
      className: status === 'past_due' || status === 'cancelled' ? 'planStatusExpired' : 'planStatusActive',
      dueLabel: 'Sin vencimiento configurado',
    };
  }

  return {
    label: status === 'past_due' || status === 'cancelled' ? 'Vencido' : 'Activo',
    className: status === 'past_due' || status === 'cancelled' ? 'planStatusExpired' : 'planStatusActive',
    dueLabel: `Vence: ${formatDate(dueDateValue)}`,
  };
}

function isDueWithinDays(subscription, days) {
  const dueDateValue = resolveNextDueDate(subscription);
  if (!dueDateValue) return false;
  const dueDate = new Date(dueDateValue);
  if (Number.isNaN(dueDate.getTime())) return false;
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

function isOverdue(subscription) {
  const dueDateValue = resolveNextDueDate(subscription);
  if (!dueDateValue) return false;
  const dueDate = new Date(dueDateValue);
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate.getTime() < Date.now();
}

function getBasePlanValues(plan, pricingDraft) {
  if (plan === 'basic') {
    return {
      ars: Number(pricingDraft.basicPriceArs || 0),
      usdReference: Number(pricingDraft.basicPriceUsdReference || 0),
    };
  }

  if (plan === 'pro') {
    return {
      ars: Number(pricingDraft.proPriceArs || 0),
      usdReference: Number(pricingDraft.proPriceUsdReference || 0),
    };
  }

  return { ars: 0, usdReference: 0 };
}

function calculateDiscountPercent({ plan, subscription, pricingDraft }) {
  const base = getBasePlanValues(plan, pricingDraft);
  const customArs = Number(subscription?.customPriceArs ?? 0);
  const couponPercent = isSubscriptionCouponStillValid(subscription)
    ? Number(subscription?.couponDiscountPercent ?? 0)
    : 0;

  if (couponPercent > 0) {
    return Number(couponPercent.toFixed(2));
  }

  if (!(base.ars > 0) || !(customArs >= 0) || customArs === 0 || customArs >= base.ars) {
    return '';
  }

  const discount = ((base.ars - customArs) / base.ars) * 100;
  return Number(discount.toFixed(2));
}

function buildDrafts(users, pricingDraft) {
  return Object.fromEntries(
    users.map((user) => [
      user._id,
      {
        plan: user.subscription?.plan || 'basic',
        status: user.subscription?.status || 'trial',
        billingCycle: user.subscription?.billingCycle || 'monthly',
        renewalMode: user.subscription?.renewalMode || 'manual',
        expiresAt: formatDateInputValue(user.subscription?.expiresAt),
        customPriceArs: user.subscription?.customPriceArs ?? '',
        customPriceUsdReference: user.subscription?.customPriceUsdReference ?? '',
        internalNotes: user.subscription?.internalNotes ?? '',
        discountPercent: calculateDiscountPercent({
          plan: user.subscription?.plan || 'basic',
          subscription: user.subscription,
          pricingDraft,
        }),
      },
    ]),
  );
}

export default function SubscriptionAdmin() {
  const [secret, setSecret] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [expandedShopId, setExpandedShopId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [pricingDraft, setPricingDraft] = useState({
    basicPriceArs: 25000,
    basicPriceUsdReference: 25,
    proPriceArs: 35000,
    proPriceUsdReference: 35,
    additionalBusinessPriceArs: 10000,
    additionalBusinessPriceUsdReference: 10,
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedDiscountFilter, setSelectedDiscountFilter] = useState('all');
  const [selectedRenewalFilter, setSelectedRenewalFilter] = useState('all');
  const [selectedDueFilter, setSelectedDueFilter] = useState('all');
  const [selectedReferralFilter, setSelectedReferralFilter] = useState('all');
  const [coupons, setCoupons] = useState([]);
  const [savingCouponId, setSavingCouponId] = useState(null);
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState(null);
  const [couponEditDraft, setCouponEditDraft] = useState(null);
  const [couponDraft, setCouponDraft] = useState({
    code: '',
    plan: '',
    couponCategory: 'standard',
    referralOwnerName: '',
    discountType: 'percentage',
    discountPercent: '',
    discountAmountUsdReference: '',
    benefitDurationType: 'forever',
    benefitDurationValue: '',
    maxRedemptions: '',
    expiresAt: '',
    internalNote: '',
    isActive: true,
  });

  const hasUsers = shops.length > 0 || users.length > 0;

  const getPlanAmount = useCallback(
    (plan, userSubscription = {}) => {
      if (plan === 'basic') {
        if (
          String(userSubscription?.couponDiscountType || '') === 'fixed_usd_reference' &&
          Number(userSubscription?.couponDiscountAmountUsdReference || 0) > 0 &&
          Number(pricingDraft.basicPriceUsdReference || 0) > 0
        ) {
          const arsPerUsd =
            Number(pricingDraft.basicPriceArs || 0) / Number(pricingDraft.basicPriceUsdReference || 0);
          const discountArs = arsPerUsd * Number(userSubscription.couponDiscountAmountUsdReference || 0);
          return Math.max(
            0,
            Number((Number(pricingDraft.basicPriceArs || 0) - discountArs).toFixed(2)),
          );
        }
        if (Number(userSubscription?.couponDiscountPercent || 0) > 0) {
          return Number(
            (
              Number(pricingDraft.basicPriceArs || 0) *
              (1 - Number(userSubscription.couponDiscountPercent) / 100)
            ).toFixed(2),
          );
        }
        return Number(
          userSubscription?.customPriceArs != null && userSubscription?.customPriceArs !== ''
            ? userSubscription.customPriceArs
            : pricingDraft.basicPriceArs || 0,
        );
      }
      if (plan === 'pro') {
        if (
          String(userSubscription?.couponDiscountType || '') === 'fixed_usd_reference' &&
          Number(userSubscription?.couponDiscountAmountUsdReference || 0) > 0 &&
          Number(pricingDraft.proPriceUsdReference || 0) > 0
        ) {
          const arsPerUsd =
            Number(pricingDraft.proPriceArs || 0) / Number(pricingDraft.proPriceUsdReference || 0);
          const discountArs = arsPerUsd * Number(userSubscription.couponDiscountAmountUsdReference || 0);
          return Math.max(
            0,
            Number((Number(pricingDraft.proPriceArs || 0) - discountArs).toFixed(2)),
          );
        }
        if (Number(userSubscription?.couponDiscountPercent || 0) > 0) {
          return Number(
            (
              Number(pricingDraft.proPriceArs || 0) *
              (1 - Number(userSubscription.couponDiscountPercent) / 100)
            ).toFixed(2),
          );
        }
        return Number(
          userSubscription?.customPriceArs != null && userSubscription?.customPriceArs !== ''
            ? userSubscription.customPriceArs
            : pricingDraft.proPriceArs || 0,
        );
      }
      return 0;
    },
    [
      pricingDraft.basicPriceArs,
      pricingDraft.basicPriceUsdReference,
      pricingDraft.proPriceArs,
      pricingDraft.proPriceUsdReference,
    ],
  );

  const loadUsers = useCallback(async () => {
    if (!secret.trim()) {
      setError('Ingresá el secret de administración para cargar las cuentas.');
      setSuccess('');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const [couponsResponse, subscriptionsResponse, pricingResponse] = await Promise.all([
        fetchSubscriptionCoupons({
          secret: secret.trim(),
        }),
        fetchSubscriptions({
          secret: secret.trim(),
          search: search.trim(),
        }),
        fetchPlanPricing({
          secret: secret.trim(),
        }),
      ]);
      const nextCoupons = couponsResponse.coupons || [];
      const nextShops = subscriptionsResponse.shops || [];
      const nextUsers = nextShops.length
        ? nextShops.map((shop) => shop.owner).filter(Boolean)
        : subscriptionsResponse.users || [];
      const nextPricingDraft = {
        basicPriceArs: Number(pricingResponse.pricing?.basic?.ars || 25000),
        basicPriceUsdReference: Number(pricingResponse.pricing?.basic?.usdReference || 25),
        proPriceArs: Number(pricingResponse.pricing?.pro?.ars || 35000),
        proPriceUsdReference: Number(pricingResponse.pricing?.pro?.usdReference || 35),
        additionalBusinessPriceArs: Number(
          pricingResponse.pricing?.additionalBusiness?.ars || 10000,
        ),
        additionalBusinessPriceUsdReference: Number(
          pricingResponse.pricing?.additionalBusiness?.usdReference || 10,
        ),
      };
      setCoupons(nextCoupons);
      setShops(nextShops);
      setUsers(nextUsers);
      setPricingDraft(nextPricingDraft);
      setDrafts(buildDrafts(nextUsers, nextPricingDraft));
      setHasLoadedOnce(true);
    } catch (err) {
      setError(err.message || 'No pudimos cargar las cuentas.');
      setUsers([]);
      setShops([]);
      setHasLoadedOnce(false);
    } finally {
      setLoading(false);
    }
  }, [search, secret]);

  const handleDraftChange = (userId, field, value) => {
    setDrafts((current) => ({
      ...current,
        [userId]: {
          ...current[userId],
          [field]: value,
      },
    }));
  };

  const handleDiscountPercentChange = (userId, value) => {
    setDrafts((current) => {
      const currentDraft = current[userId] || {};
      const plan = currentDraft.plan || 'basic';
      const base = getBasePlanValues(plan, pricingDraft);
      const normalized = value == null || String(value).trim() === '' ? '' : Number(value);

      if (normalized === '') {
        return {
          ...current,
          [userId]: {
            ...currentDraft,
            discountPercent: '',
            customPriceArs: '',
            customPriceUsdReference: '',
          },
        };
      }

      if (!Number.isFinite(normalized) || normalized < 0) {
        return {
          ...current,
          [userId]: {
            ...currentDraft,
            discountPercent: value,
          },
        };
      }

      const multiplier = Math.max(0, 1 - normalized / 100);
      const discountedArs = base.ars > 0 ? Number((base.ars * multiplier).toFixed(2)) : '';
      const discountedUsd =
        base.usdReference > 0 ? Number((base.usdReference * multiplier).toFixed(2)) : '';

      return {
        ...current,
        [userId]: {
          ...currentDraft,
          discountPercent: normalized,
          customPriceArs: discountedArs,
          customPriceUsdReference: discountedUsd,
        },
      };
    });
  };

  const handleResetCustomPricing = (userId) => {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        customPriceArs: '',
        customPriceUsdReference: '',
        discountPercent: '',
      },
    }));
  };

  const handlePricingDraftChange = (field, value) => {
    setPricingDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSavePricing = async () => {
    if (!secret.trim()) {
      setError('Ingresá el secret de administración para guardar precios.');
      setSuccess('');
      return;
    }

    setSavingPricing(true);
    setError('');
    setSuccess('');

    try {
      const response = await updatePlanPricing({
        secret: secret.trim(),
        payload: {
          basicPriceArs: Number(pricingDraft.basicPriceArs),
          basicPriceUsdReference: Number(pricingDraft.basicPriceUsdReference),
          proPriceArs: Number(pricingDraft.proPriceArs),
          proPriceUsdReference: Number(pricingDraft.proPriceUsdReference),
          additionalBusinessPriceArs: Number(pricingDraft.additionalBusinessPriceArs),
          additionalBusinessPriceUsdReference: Number(
            pricingDraft.additionalBusinessPriceUsdReference,
          ),
        },
      });

      setPricingDraft({
        basicPriceArs: Number(response.pricing?.basic?.ars || 25000),
        basicPriceUsdReference: Number(response.pricing?.basic?.usdReference || 25),
        proPriceArs: Number(response.pricing?.pro?.ars || 35000),
        proPriceUsdReference: Number(response.pricing?.pro?.usdReference || 35),
        additionalBusinessPriceArs: Number(
          response.pricing?.additionalBusiness?.ars || 10000,
        ),
        additionalBusinessPriceUsdReference: Number(
          response.pricing?.additionalBusiness?.usdReference || 10,
        ),
      });
      setSuccess('Precios guardados correctamente.');
    } catch (err) {
      setError(err.message || 'No pudimos guardar los precios.');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleCouponDraftChange = (field, value) => {
    setCouponDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCouponEditDraftChange = (field, value) => {
    setCouponEditDraft((current) => ({
      ...(current || {}),
      [field]: value,
    }));
  };

  const handleCreateCoupon = async () => {
    if (!secret.trim()) {
      setError('Ingresá el secret de administración para guardar cupones.');
      setSuccess('');
      return;
    }

    setCreatingCoupon(true);
    setError('');
    setSuccess('');

    try {
      const response = await createSubscriptionCoupon({
        secret: secret.trim(),
        payload: {
          code: couponDraft.code,
          plan: couponDraft.plan || null,
          couponCategory: couponDraft.couponCategory,
          referralOwnerName: couponDraft.referralOwnerName,
          discountType: couponDraft.discountType,
          discountPercent:
            couponDraft.discountType === 'percentage'
              ? couponDraft.discountPercent
              : null,
          discountAmountUsdReference:
            couponDraft.discountType === 'fixed_usd_reference'
              ? couponDraft.discountAmountUsdReference
              : null,
          benefitDurationType: couponDraft.benefitDurationType,
          benefitDurationValue: couponDraft.benefitDurationValue,
          maxRedemptions: couponDraft.maxRedemptions,
          expiresAt: couponDraft.expiresAt || null,
          internalNote: couponDraft.internalNote,
          isActive: couponDraft.isActive,
        },
      });

      setCoupons((current) => [response.coupon, ...current]);
      setCouponDraft({
        code: '',
        plan: '',
        couponCategory: 'standard',
        referralOwnerName: '',
        discountType: 'percentage',
        discountPercent: '',
        discountAmountUsdReference: '',
        benefitDurationType: 'forever',
        benefitDurationValue: '',
        maxRedemptions: '',
        expiresAt: '',
        internalNote: '',
        isActive: true,
      });
      setSuccess('Cupón creado correctamente.');
    } catch (err) {
      setError(err.message || 'No pudimos crear el cupón.');
    } finally {
      setCreatingCoupon(false);
    }
  };

  const handleSaveCoupon = async (couponId, payload) => {
    if (!secret.trim()) return;

    setSavingCouponId(couponId);
    setError('');
    setSuccess('');

    try {
      const response = await updateSubscriptionCoupon({
        couponId,
        secret: secret.trim(),
        payload,
      });

      setCoupons((current) =>
        current.map((coupon) => (coupon._id === couponId ? response.coupon : coupon)),
      );
      setSuccess('Cupón actualizado correctamente.');
      return response;
    } catch (err) {
      setError(err.message || 'No pudimos actualizar el cupón.');
    } finally {
      setSavingCouponId(null);
    }
  };

  const handleDeleteCoupon = async (coupon) => {
    if (!coupon?._id) return;

    const confirmed = window.confirm(
      `Vas a borrar el cupón ${coupon.code}. Esto lo va a dejar inactivo y vencido para que no se pueda volver a usar.`,
    );

    if (!confirmed) return;

    if (!secret.trim()) {
      setError('Ingresá el secret de administración para borrar cupones.');
      setSuccess('');
      return;
    }

    setSavingCouponId(coupon._id);
    setError('');
    setSuccess('');

    try {
      await deleteSubscriptionCoupon({
        couponId: coupon._id,
        secret: secret.trim(),
      });
      setCoupons((current) => current.filter((item) => item._id !== coupon._id));
      setSuccess('Cupón borrado correctamente.');
      if (editingCouponId === coupon._id) {
        setEditingCouponId(null);
        setCouponEditDraft(null);
      }
    } catch (err) {
      setError(err.message || 'No pudimos borrar el cupón.');
    } finally {
      setSavingCouponId(null);
    }
  };

  const handleStartEditCoupon = (coupon) => {
    setEditingCouponId(coupon._id);
    setCouponEditDraft(buildCouponEditDraft(coupon));
    setError('');
    setSuccess('');
  };

  const handleCancelEditCoupon = () => {
    setEditingCouponId(null);
    setCouponEditDraft(null);
  };

  const handleSubmitEditCoupon = async (coupon) => {
    if (!coupon?._id || !couponEditDraft) return;

    const response = await handleSaveCoupon(coupon._id, {
      expiresAt: couponEditDraft.expiresAt || null,
      maxRedemptions: couponEditDraft.maxRedemptions || null,
      isActive: Boolean(couponEditDraft.isActive),
      internalNote: couponEditDraft.internalNote || '',
    });

    if (response?.coupon) {
      setEditingCouponId(null);
      setCouponEditDraft(null);
    }
  };

  const handleSave = async (userId) => {
    const draft = drafts[userId];
    if (!draft || !secret.trim()) return;

    setSavingUserId(userId);
    setError('');
    setSuccess('');

    try {
      const response = await updateSubscription({
        userId,
        secret: secret.trim(),
        payload: draft,
      });

      setUsers((current) =>
        current.map((user) =>
          user._id === userId
            ? {
                ...user,
                subscription: {
                  ...user.subscription,
                  ...response.user.subscription,
                },
              }
            : user,
        ),
      );
      setShops((current) =>
        current.map((shop) =>
          shop.owner?._id === userId
            ? {
                ...shop,
                owner: {
                  ...shop.owner,
                  subscription: {
                    ...shop.owner.subscription,
                    ...response.user.subscription,
                  },
                },
              }
            : shop,
        ),
      );
      setDrafts((current) => ({
        ...current,
        [userId]: {
          plan: response.user.subscription?.plan || 'basic',
          status: response.user.subscription?.status || 'trial',
          billingCycle: response.user.subscription?.billingCycle || 'monthly',
          renewalMode: response.user.subscription?.renewalMode || 'manual',
          expiresAt: formatDateInputValue(response.user.subscription?.expiresAt),
          customPriceArs: response.user.subscription?.customPriceArs ?? '',
          customPriceUsdReference: response.user.subscription?.customPriceUsdReference ?? '',
          internalNotes: response.user.subscription?.internalNotes ?? '',
          discountPercent: calculateDiscountPercent({
            plan: response.user.subscription?.plan || 'basic',
            subscription: response.user.subscription,
            pricingDraft,
          }),
        },
      }));
      setSuccess('Cambios guardados correctamente.');
    } catch (err) {
      setError(err.message || 'No pudimos guardar la suscripción.');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleCopyRenewalLink = async (user) => {
    const draft = drafts[user._id] || {};
    const renewalUrl = buildRenewalUrl({
      email: user.email,
      plan: draft.plan || user.subscription?.plan || 'basic',
      renewalMode: draft.renewalMode || user.subscription?.renewalMode || 'manual',
    });

    try {
      await navigator.clipboard.writeText(renewalUrl);
      setSuccess('Link de renovación copiado.');
      setError('');
    } catch (_error) {
      window.prompt('Copiá este link de renovación:', renewalUrl);
    }
  };

  const handleDeleteUser = async (user, contextLabel) => {
    if (!user?._id) return;

    const label = contextLabel || user.fullName || user.email || 'esta cuenta';
    const confirmed = window.confirm(
      `Vas a ELIMINAR DE LA BASE ${label} y todos sus datos (turnos, profesionales, caja, productos, locales). Esto NO se puede deshacer.`,
    );

    if (!confirmed) return;

    // Doble confirmación: escribir el nombre exacto del negocio.
    const expectedName = String(user.fullName || user.email || '').trim();
    if (expectedName) {
      const typed = window.prompt(
        `Para confirmar, escribí el nombre exacto del negocio:\n\n${expectedName}`,
      );
      if (typed == null) return;
      if (typed.trim() !== expectedName) {
        setError('El nombre no coincide. No se borró nada.');
        setSuccess('');
        return;
      }
    }

    if (!secret.trim()) {
      setError('Ingresá el secret de administración para borrar cuentas.');
      setSuccess('');
      return;
    }

    setSavingUserId(user._id);
    setError('');
    setSuccess('');

    try {
      const response = await deleteAdminUser({
        userId: user._id,
        secret: secret.trim(),
      });
      await loadUsers();
      setSuccess(response.message || 'Cuenta borrada correctamente.');
    } catch (err) {
      setError(err.message || 'No pudimos borrar la cuenta.');
    } finally {
      setSavingUserId(null);
    }
  };

  const yearOptions = useMemo(() => {
    const years = users
      .map((user) => new Date(user.createdAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => String(date.getFullYear()));

    return [...new Set(years)].sort((a, b) => Number(b) - Number(a));
  }, [users]);

  useEffect(() => {
    if (!yearOptions.length) {
      setSelectedYear('');
      setSelectedMonth('all');
      return;
    }

    setSelectedYear((current) => (yearOptions.includes(current) ? current : yearOptions[0]));
  }, [yearOptions]);

  const monthOptions = useMemo(() => {
    if (!selectedYear) return [];

    const counts = new Map();

    users.forEach((user) => {
      const date = new Date(user.createdAt);
      if (Number.isNaN(date.getTime())) return;
      if (String(date.getFullYear()) !== selectedYear) return;

      const monthIndex = date.getMonth();
      counts.set(monthIndex, (counts.get(monthIndex) || 0) + 1);
    });

    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([monthIndex, count]) => ({
        value: String(monthIndex),
        label: MONTH_LABELS[monthIndex],
        count,
      }));
  }, [selectedYear, users]);

  useEffect(() => {
    if (selectedMonth === 'all') return;
    if (!monthOptions.some((option) => option.value === selectedMonth)) {
      setSelectedMonth('all');
    }
  }, [monthOptions, selectedMonth]);

  const visibleUsers = useMemo(() => {
    return users.filter((user) => {
      const date = new Date(user.createdAt);
      if (Number.isNaN(date.getTime())) return false;

      const yearMatches = !selectedYear || String(date.getFullYear()) === selectedYear;
      const monthMatches =
        selectedMonth === 'all' || String(date.getMonth()) === String(selectedMonth);
      const subscriptionStatus = String(user.subscription?.status || 'trial');
      const statusMatches =
        selectedStatusFilter === 'all'
          ? true
          : selectedStatusFilter === 'active'
            ? subscriptionStatus === 'active'
            : subscriptionStatus === 'past_due' || subscriptionStatus === 'cancelled';
      const hasDiscount = hasSubscriptionDiscount(user.subscription);
      const discountMatches =
        selectedDiscountFilter === 'all'
          ? true
          : selectedDiscountFilter === 'discounted'
            ? hasDiscount
            : !hasDiscount;
      const hasReferral = Boolean(String(user.subscription?.referralCode || '').trim());
      const referralMatches =
        selectedReferralFilter === 'all'
          ? true
          : selectedReferralFilter === 'referred'
            ? hasReferral
            : !hasReferral;
      const renewalMode = String(user.subscription?.renewalMode || 'manual');
      const renewalMatches =
        selectedRenewalFilter === 'all' ? true : renewalMode === selectedRenewalFilter;
      const dueMatches =
        selectedDueFilter === 'all'
          ? true
          : selectedDueFilter === '7'
            ? isDueWithinDays(user.subscription, 7)
            : selectedDueFilter === '30'
              ? isDueWithinDays(user.subscription, 30)
              : isOverdue(user.subscription);

      return (
        yearMatches &&
        monthMatches &&
        statusMatches &&
        discountMatches &&
        referralMatches &&
        renewalMatches &&
        dueMatches
      );
    });
  }, [
    selectedDiscountFilter,
    selectedDueFilter,
    selectedMonth,
    selectedReferralFilter,
    selectedRenewalFilter,
    selectedStatusFilter,
    selectedYear,
    users,
  ]);

  const visibleShops = useMemo(() => {
    if (!shops.length) {
      return visibleUsers.map((user) => ({
        owner: user,
        staffUsers: [],
        barbers: [],
      }));
    }

    const visibleOwnerIds = new Set(visibleUsers.map((user) => user._id));
    return shops.filter((shop) => visibleOwnerIds.has(shop.owner?._id));
  }, [shops, visibleUsers]);

  const adminStats = useMemo(() => {
    const grouped = new Map();
    const summaryData = {
      total: visibleUsers.length,
      active: 0,
      trial: 0,
      pastDue: 0,
      activeBasic: 0,
      activePro: 0,
      activeCustom: 0,
      estimatedMrr: 0,
      dueSoon7: 0,
    };
    const revenueData = {
      activeRevenue: 0,
      activeBasicRevenue: 0,
      activeProRevenue: 0,
      pendingRevenue: 0,
      totalProjectedRevenue: 0,
    };

    visibleUsers.forEach((user) => {
      const status = String(user.subscription?.status || 'trial');
      const plan = String(user.subscription?.plan || 'basic');
      const planAmount = getPlanAmount(plan, user.subscription);

      if (status === 'active') {
        summaryData.active += 1;
        summaryData.estimatedMrr += planAmount;
        if (plan === 'basic') {
          summaryData.activeBasic += 1;
          revenueData.activeBasicRevenue += planAmount;
        } else if (plan === 'pro') {
          summaryData.activePro += 1;
          revenueData.activeProRevenue += planAmount;
        } else if (plan === 'custom') {
          summaryData.activeCustom += 1;
        }
      } else if (status === 'trial') {
        summaryData.trial += 1;
      } else if (status === 'past_due') {
        summaryData.pastDue += 1;
        revenueData.pendingRevenue += planAmount;
      }

      if (isDueWithinDays(user.subscription, 7)) {
        summaryData.dueSoon7 += 1;
      }

      if (
        (status === 'active' || status === 'past_due') &&
        (plan === 'basic' || plan === 'pro')
      ) {
        revenueData.totalProjectedRevenue += planAmount;
      }

      const referralCode = String(user.subscription?.referralCode || '').trim();
      if (!referralCode) return;

      const referralOwnerName =
        String(user.subscription?.referralOwnerName || '').trim() || 'Referido sin nombre';
      const key = `${referralOwnerName}::${referralCode}`;
      const current = grouped.get(key) || {
        referralOwnerName,
        referralCode,
        total: 0,
        active: 0,
        pending: 0,
        revenue: 0,
      };

      current.total += 1;
      if (status === 'active') {
        current.active += 1;
        current.revenue += planAmount;
      } else if (status === 'past_due') {
        current.pending += 1;
      }

      grouped.set(key, current);
    });

    revenueData.activeRevenue = revenueData.activeBasicRevenue + revenueData.activeProRevenue;

    return {
      summary: summaryData,
      revenueSummary: revenueData,
      referralSummary: [...grouped.values()].sort((a, b) => {
        if (b.active !== a.active) return b.active - a.active;
        if (b.total !== a.total) return b.total - a.total;
        return a.referralOwnerName.localeCompare(b.referralOwnerName, 'es');
      }),
    };
  }, [getPlanAmount, visibleUsers]);
  const { summary, revenueSummary, referralSummary } = adminStats;

  // Valor cuadrable: precio de lista del plan × cuentas activas que pagan.
  // Coincide con los precios configurados (sin descuentos ni adicionales).
  const planRevenue = useMemo(() => {
    const basicCount = summary.activeBasic;
    const proCount = summary.activePro;
    const basicPrice = Number(pricingDraft.basicPriceArs || 0);
    const proPrice = Number(pricingDraft.proPriceArs || 0);
    const basicBase = basicCount * basicPrice;
    const proBase = proCount * proPrice;
    return {
      basicCount,
      proCount,
      payingCount: basicCount + proCount,
      basicPrice,
      proPrice,
      basicBase,
      proBase,
      baseTotal: basicBase + proBase,
    };
  }, [
    summary.activeBasic,
    summary.activePro,
    pricingDraft.basicPriceArs,
    pricingDraft.proPriceArs,
  ]);

  return (
    <main className={styles.screen}>
      <div className={styles.heroGlow} aria-hidden="true" />

      <section className={styles.header}>
        <p className={styles.eyebrow}>ADMIN SUSCRIPCIONES</p>
        <h1 className={styles.title}>Control de planes y estado comercial</h1>
        <p className={styles.subtitle}>
          Panel interno para ver cuentas, buscar negocios y cambiar plan o estado sin entrar a la base.
        </p>
        <div className={styles.adminNav}>
          <a className={styles.adminNavLinkActive} href="/admin">
            Suscripciones
          </a>
          <a className={styles.adminNavLink} href="/admin/subscription-coupons">
            Cuentas con cupón activo
          </a>
        </div>
      </section>

      <section className={styles.toolbar}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Secret admin</span>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Pegá tu secret del backend"
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Buscar</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, mail o slug"
            className={styles.input}
          />
        </label>

        <button className={styles.loadButton} onClick={loadUsers} disabled={loading}>
          {loading ? 'Cargando...' : 'Cargar cuentas'}
        </button>
      </section>

      {error || success ? (
        <div
          className={`${styles.feedbackToast} ${error ? styles.feedbackToastError : styles.feedbackToastSuccess}`}
          role="status"
          aria-live="polite"
        >
          <strong>{error ? 'No se pudo completar' : 'Listo'}</strong>
          <span>{error || success}</span>
        </div>
      ) : null}

      {hasLoadedOnce ? (
        <>
          <section className={styles.pricingSection}>
            <div className={styles.sectionHeadingRow}>
              <div>
                <p className={styles.sectionEyebrow}>PRECIOS</p>
                <h2 className={styles.sectionTitle}>Referencia comercial actual</h2>
                <p className={styles.sectionMeta}>
                  El valor en ARS es el precio que ve el cliente en la web. La referencia USD queda
                  como apoyo comercial interno y visible como referencia.
                </p>
              </div>
            </div>

            <div className={styles.pricingGrid}>
              {PLAN_PRICE_META.map((plan) => (
                <article key={plan.key} className={`${styles.priceCard} ${plan.accentClassName}`}>
                  <span className={styles.priceBadge}>{plan.label}</span>
                  {plan.key === 'custom' ? (
                    <>
                      <strong className={styles.priceValue}>A medida</strong>
                      <span className={styles.priceBilling}>consultar por WhatsApp</span>
                    </>
                  ) : (
                    <>
                      <label className={styles.priceField}>
                        <span>Precio principal ARS</span>
                        <input
                          type="number"
                          value={
                            plan.key === 'basic'
                              ? pricingDraft.basicPriceArs
                              : pricingDraft.proPriceArs
                          }
                          onChange={(e) =>
                            handlePricingDraftChange(
                              plan.key === 'basic' ? 'basicPriceArs' : 'proPriceArs',
                              e.target.value,
                            )
                          }
                          className={styles.priceInput}
                        />
                      </label>
                      <label className={styles.priceField}>
                        <span>Referencia USD</span>
                        <input
                          type="number"
                          value={
                            plan.key === 'basic'
                              ? pricingDraft.basicPriceUsdReference
                              : pricingDraft.proPriceUsdReference
                          }
                          onChange={(e) =>
                            handlePricingDraftChange(
                              plan.key === 'basic'
                                ? 'basicPriceUsdReference'
                                : 'proPriceUsdReference',
                              e.target.value,
                            )
                          }
                          className={styles.priceInput}
                        />
                      </label>
                    </>
                  )}
                  <p className={styles.priceDescription}>{plan.description}</p>
                </article>
              ))}

              <article className={styles.priceCard}>
                <span className={styles.priceBadge}>Local adicional</span>
                <label className={styles.priceField}>
                  <span>Precio principal ARS</span>
                  <input
                    type="number"
                    value={pricingDraft.additionalBusinessPriceArs}
                    onChange={(e) =>
                      handlePricingDraftChange(
                        'additionalBusinessPriceArs',
                        e.target.value,
                      )
                    }
                    className={styles.priceInput}
                  />
                </label>
                <label className={styles.priceField}>
                  <span>Referencia USD</span>
                  <input
                    type="number"
                    value={pricingDraft.additionalBusinessPriceUsdReference}
                    onChange={(e) =>
                      handlePricingDraftChange(
                        'additionalBusinessPriceUsdReference',
                        e.target.value,
                      )
                    }
                    className={styles.priceInput}
                  />
                </label>
                <p className={styles.priceDescription}>
                  Precio por cada local extra que el dueño suma a su plan. Se cobra
                  en el pago según la referencia USD que cargues acá.
                </p>
              </article>
            </div>
            <div className={styles.pricingActions}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSavePricing}
                disabled={savingPricing}
              >
                {savingPricing ? 'Guardando precios...' : 'Guardar precios'}
              </button>
            </div>
          </section>

          <section className={styles.pricingSection}>
            <div className={styles.sectionHeadingRow}>
              <div>
                <p className={styles.sectionEyebrow}>CUPONES</p>
                <h2 className={styles.sectionTitle}>Descuentos automáticos por código</h2>
                <p className={styles.sectionMeta}>
                  Creás el cupón una vez y el cliente lo aplica solo desde la web de planes.
                </p>
              </div>
            </div>

            <div className={styles.couponCreateGrid}>
              <label className={styles.priceField}>
                <span>Código</span>
                <input
                  type="text"
                  value={couponDraft.code}
                  onChange={(e) => handleCouponDraftChange('code', e.target.value.toUpperCase())}
                  className={styles.priceInput}
                  placeholder="PROMO5"
                />
              </label>
              <label className={styles.priceField}>
                <span>Plan</span>
                <select
                  value={couponDraft.plan}
                  onChange={(e) => handleCouponDraftChange('plan', e.target.value)}
                  className={styles.priceInput}
                >
                  <option value="">Todos</option>
                  <option value="basic">Básico</option>
                  <option value="pro">Pro</option>
                </select>
              </label>
              <label className={styles.priceField}>
                <span>Tipo de código</span>
                <select
                  value={couponDraft.couponCategory}
                  onChange={(e) => handleCouponDraftChange('couponCategory', e.target.value)}
                  className={styles.priceInput}
                >
                  <option value="standard">Cupón normal</option>
                  <option value="referral">Código de referido</option>
                </select>
              </label>
              {couponDraft.couponCategory === 'referral' ? (
                <label className={styles.priceField}>
                  <span>Referente</span>
                  <input
                    type="text"
                    value={couponDraft.referralOwnerName}
                    onChange={(e) => handleCouponDraftChange('referralOwnerName', e.target.value)}
                    className={styles.priceInput}
                    placeholder="Maira"
                  />
                  <small className={styles.fieldHint}>
                    Después el panel agrupa cuántas cuentas activó este código para esa persona.
                  </small>
                </label>
              ) : null}
              <label className={styles.priceField}>
                <span>Tipo de descuento</span>
                <select
                  value={couponDraft.discountType}
                  onChange={(e) => handleCouponDraftChange('discountType', e.target.value)}
                  className={styles.priceInput}
                >
                  <option value="percentage">Porcentaje</option>
                  <option value="fixed_usd_reference">Monto fijo USD</option>
                </select>
                <small className={styles.fieldHint}>
                  Elegí porcentaje o monto fijo de referencia en USD para que el descuento siga al precio actual del plan.
                </small>
              </label>
              {couponDraft.discountType === 'percentage' ? (
                <label className={styles.priceField}>
                  <span>Descuento %</span>
                  <input
                    type="number"
                    value={couponDraft.discountPercent}
                    onChange={(e) => handleCouponDraftChange('discountPercent', e.target.value)}
                    className={styles.priceInput}
                    placeholder="5"
                  />
                  <small className={styles.fieldHint}>
                    Si deja el plan en ARS 0, se activa directo sin checkout y el próximo cobro vuelve al flujo normal.
                  </small>
                </label>
              ) : (
                <label className={styles.priceField}>
                  <span>Monto fijo USD ref.</span>
                  <input
                    type="number"
                    value={couponDraft.discountAmountUsdReference}
                    onChange={(e) => handleCouponDraftChange('discountAmountUsdReference', e.target.value)}
                    className={styles.priceInput}
                    placeholder="5"
                  />
                  <small className={styles.fieldHint}>
                    Ejemplo: USD 5 OFF. El sistema calcula el equivalente en ARS según el precio actual del plan.
                  </small>
                </label>
              )}
              <label className={styles.priceField}>
                <span>El descuento dura</span>
                <select
                  value={couponDraft.benefitDurationType}
                  onChange={(e) => handleCouponDraftChange('benefitDurationType', e.target.value)}
                  className={styles.priceInput}
                >
                  <option value="forever">Permanente</option>
                  <option value="one_time">Solo primer pago</option>
                  <option value="days">Durante X dias</option>
                  <option value="months">Durante X meses</option>
                </select>
              </label>
              {couponDraft.benefitDurationType === 'days' || couponDraft.benefitDurationType === 'months' ? (
                <label className={styles.priceField}>
                  <span>
                    {couponDraft.benefitDurationType === 'days' ? 'Cuántos dias' : 'Cuántos meses'}
                  </span>
                  <input
                    type="number"
                    value={couponDraft.benefitDurationValue}
                    onChange={(e) => handleCouponDraftChange('benefitDurationValue', e.target.value)}
                    className={styles.priceInput}
                    placeholder={couponDraft.benefitDurationType === 'days' ? '14' : '12'}
                  />
                </label>
              ) : null}
              <label className={styles.priceField}>
                <span>Máx. usos</span>
                <input
                  type="number"
                  value={couponDraft.maxRedemptions}
                  onChange={(e) => handleCouponDraftChange('maxRedemptions', e.target.value)}
                  className={styles.priceInput}
                  placeholder="Opcional"
                />
              </label>
              <label className={styles.priceField}>
                <span>Válido hasta</span>
                <input
                  type="date"
                  value={couponDraft.expiresAt}
                  onChange={(e) => handleCouponDraftChange('expiresAt', e.target.value)}
                  className={styles.priceInput}
                />
              </label>
              <label className={styles.priceField}>
                <span>Activo</span>
                <select
                  value={couponDraft.isActive ? 'true' : 'false'}
                  onChange={(e) => handleCouponDraftChange('isActive', e.target.value === 'true')}
                  className={styles.priceInput}
                >
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className={`${styles.priceField} ${styles.couponNoteField}`}>
                <span>Nota interna</span>
                <input
                  type="text"
                  value={couponDraft.internalNote}
                  onChange={(e) => handleCouponDraftChange('internalNote', e.target.value)}
                  className={styles.priceInput}
                  placeholder="Promo lanzamiento, cliente referido, etc."
                />
              </label>
            </div>

            <div className={styles.pricingActions}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleCreateCoupon}
                disabled={creatingCoupon}
              >
                {creatingCoupon ? 'Creando cupón...' : 'Crear cupón'}
              </button>
            </div>

            <div className={styles.couponList}>
              {coupons.map((coupon) => {
                const durationBadge = getCouponDurationBadge(coupon);
                const expired = isCouponExpired(coupon);
                const isEditingCoupon = editingCouponId === coupon._id;

                return (
                <article key={coupon._id} className={styles.couponCard}>
                  <div className={styles.couponCardTop}>
                      <div>
                      <div className={styles.couponHeaderRow}>
                        <strong className={styles.couponCode}>{coupon.code}</strong>
                        {coupon.couponCategory === 'referral' ? (
                          <span className={styles.referralBadge}>Referido</span>
                        ) : null}
                        <span className={`${styles.couponDurationBadge} ${durationBadge.className}`}>
                          {durationBadge.label}
                        </span>
                      </div>
                      <p className={styles.couponMeta}>
                        {coupon.plan ? `Plan ${coupon.plan}` : 'Todos los planes'} · {getCouponDiscountLabel(coupon)}
                      </p>
                      {coupon.couponCategory === 'referral' ? (
                        <p className={styles.couponMeta}>
                          Referente: {coupon.referralOwnerName || 'Sin nombre cargado'}
                        </p>
                      ) : null}
                    </div>
                    <div className={styles.couponActions}>
                      <button
                        type="button"
                        className={styles.secondaryInlineButton}
                        onClick={() =>
                          isEditingCoupon
                            ? handleCancelEditCoupon()
                            : handleStartEditCoupon(coupon)
                        }
                        disabled={savingCouponId === coupon._id}
                      >
                        {isEditingCoupon ? 'Cancelar' : 'Editar'}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryInlineButton}
                        onClick={() =>
                          handleSaveCoupon(coupon._id, {
                            isActive: !coupon.isActive,
                          })
                        }
                        disabled={savingCouponId === coupon._id}
                      >
                        {coupon.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteInlineButton}
                        onClick={() => handleDeleteCoupon(coupon)}
                        disabled={savingCouponId === coupon._id}
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                  <p className={styles.couponMeta}>
                    Usos: {coupon.redemptionCount}
                    {coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''} · Duración:{' '}
                    {coupon.benefitDurationType === 'forever'
                      ? 'permanente'
                      : coupon.benefitDurationType === 'one_time'
                        ? 'solo primer pago'
                        : coupon.benefitDurationType === 'days'
                          ? `durante ${coupon.benefitDurationValue || 0} dias`
                        : `durante ${coupon.benefitDurationValue || 0} meses`} · Válido hasta:{' '}
                    {formatDate(coupon.expiresAt)} · {expired ? 'Vencido' : coupon.isActive ? 'Activo' : 'Inactivo'}
                  </p>
                  {isEditingCoupon ? (
                    <div className={styles.couponEditGrid}>
                      <label className={styles.priceField}>
                        <span>Válido hasta</span>
                        <input
                          type="date"
                          value={couponEditDraft?.expiresAt || ''}
                          onChange={(e) => handleCouponEditDraftChange('expiresAt', e.target.value)}
                          className={styles.priceInput}
                        />
                      </label>
                      <label className={styles.priceField}>
                        <span>Máx. usos</span>
                        <input
                          type="number"
                          value={couponEditDraft?.maxRedemptions || ''}
                          onChange={(e) =>
                            handleCouponEditDraftChange('maxRedemptions', e.target.value)
                          }
                          className={styles.priceInput}
                          placeholder="Opcional"
                        />
                      </label>
                      <label className={styles.priceField}>
                        <span>Activo</span>
                        <select
                          value={couponEditDraft?.isActive ? 'true' : 'false'}
                          onChange={(e) =>
                            handleCouponEditDraftChange('isActive', e.target.value === 'true')
                          }
                          className={styles.priceInput}
                        >
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                      <label className={`${styles.priceField} ${styles.couponNoteField}`}>
                        <span>Nota interna</span>
                        <input
                          type="text"
                          value={couponEditDraft?.internalNote || ''}
                          onChange={(e) =>
                            handleCouponEditDraftChange('internalNote', e.target.value)
                          }
                          className={styles.priceInput}
                          placeholder="Motivo, extensión, corrección, etc."
                        />
                      </label>
                      <div className={styles.couponEditActions}>
                        <button
                          type="button"
                          className={styles.primaryInlineButton}
                          onClick={() => handleSubmitEditCoupon(coupon)}
                          disabled={savingCouponId === coupon._id}
                        >
                          Guardar cambios
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {coupon.internalNote ? (
                    <p className={styles.couponMeta}>{coupon.internalNote}</p>
                  ) : null}
                </article>
                );
              })}
            </div>
          </section>

          {!hasUsers ? (
            <section className={styles.emptyState}>
              <p>
                La clave administrativa es correcta, pero la base <strong>shiftHub</strong> todavía
                no tiene cuentas cargadas.
              </p>
            </section>
          ) : null}

          <section className={styles.metricsSection}>
            <div className={styles.sectionHeadingRow}>
              <div>
                <p className={styles.sectionEyebrow}>REFERIDOS</p>
                <h2 className={styles.sectionTitle}>Rendimiento por código</h2>
                <p className={styles.sectionMeta}>
                  Te muestra cuántas cuentas reales activó cada referente y cuánto sigue facturando hoy.
                </p>
              </div>
            </div>

            {referralSummary.length ? (
              <div className={styles.referralGrid}>
                {referralSummary.map((item) => (
                  <article
                    key={`${item.referralOwnerName}-${item.referralCode}`}
                    className={styles.referralCard}
                  >
                    <div className={styles.referralCardTop}>
                      <div>
                        <strong className={styles.referralOwner}>{item.referralOwnerName}</strong>
                        <p className={styles.referralCodeText}>Código: {item.referralCode}</p>
                      </div>
                      <span className={styles.referralBadge}>Referido</span>
                    </div>
                    <p className={styles.referralMeta}>
                      Total: {item.total} · Activos: {item.active} · Pendientes: {item.pending}
                    </p>
                    <p className={styles.referralMeta}>
                      Facturación activa: ARS {item.revenue.toLocaleString('es-AR')}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                Todavía no hay cuentas activas atribuidas a códigos de referido con los filtros actuales.
              </div>
            )}
          </section>

          <section className={styles.metricsSection}>
            <div className={styles.sectionHeadingRow}>
              <div>
                <p className={styles.sectionEyebrow}>MONITOREO</p>
                <h2 className={styles.sectionTitle}>Estado comercial rápido</h2>
                <p className={styles.sectionMeta}>
                  {selectedYear
                    ? selectedMonth === 'all'
                      ? `Viendo altas de ${selectedYear}`
                      : `Viendo altas de ${MONTH_LABELS[Number(selectedMonth)]} ${selectedYear}`
                    : 'Cargá cuentas para usar los filtros'}
                </p>
              </div>
            </div>

            <div className={styles.summaryGrid}>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Cuentas</span>
                <strong className={styles.summaryValue}>{summary.total}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Activas</span>
                <strong className={styles.summaryValue}>{summary.active}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Prueba</span>
                <strong className={styles.summaryValue}>{summary.trial}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Pendientes</span>
                <strong className={styles.summaryValue}>{summary.pastDue}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Activas Básico</span>
                <strong className={styles.summaryValue}>{summary.activeBasic}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Activas Pro</span>
                <strong className={styles.summaryValue}>{summary.activePro}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Activas Personalizable</span>
                <strong className={styles.summaryValue}>{summary.activeCustom}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>MRR estimado</span>
                <strong className={styles.summaryValue}>
                  ARS {summary.estimatedMrr.toLocaleString('es-AR')}
                </strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Vencen en 7 días</span>
                <strong className={styles.summaryValue}>{summary.dueSoon7}</strong>
              </article>
            </div>
          </section>

          <section className={styles.metricsSection}>
            <div className={styles.sectionHeadingRow}>
              <div>
                <p className={styles.sectionEyebrow}>MONITOREO PLATA</p>
                <h2 className={styles.sectionTitle}>Resumen comercial del período</h2>
                <p className={styles.sectionMeta}>
                  Los valores usan los precios actuales configurados en ARS y respetan los filtros aplicados.
                </p>
              </div>
            </div>

            <div className={styles.summaryGrid}>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total proyectado</span>
                <strong className={styles.summaryValue}>
                  ARS {revenueSummary.totalProjectedRevenue.toLocaleString('es-AR')}
                </strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Activos cobrando</span>
                <strong className={styles.summaryValue}>
                  ARS {revenueSummary.activeRevenue.toLocaleString('es-AR')}
                </strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Pendiente por cobrar</span>
                <strong className={styles.summaryValue}>
                  ARS {revenueSummary.pendingRevenue.toLocaleString('es-AR')}
                </strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Básico activo</span>
                <strong className={styles.summaryValue}>
                  ARS {revenueSummary.activeBasicRevenue.toLocaleString('es-AR')}
                </strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Pro activo</span>
                <strong className={styles.summaryValue}>
                  ARS {revenueSummary.activeProRevenue.toLocaleString('es-AR')}
                </strong>
              </article>
            </div>

            <div className={styles.reconcileCard}>
              <div className={styles.reconcileHead}>
                <span className={styles.summaryLabel}>
                  Valor cuadrable (precio de lista × activos)
                </span>
                <strong className={styles.reconcileTotal}>
                  ARS {planRevenue.baseTotal.toLocaleString('es-AR')}
                </strong>
              </div>
              <p className={styles.reconcileHint}>
                Coincide con los precios configurados, sin descuentos ni
                adicionales. Sirve para chequear que la recaudación cuadre.
              </p>
              <div className={styles.reconcileRows}>
                <div className={styles.reconcileRow}>
                  <span>
                    Básico · {planRevenue.basicCount} ×{' '}
                    ARS {planRevenue.basicPrice.toLocaleString('es-AR')}
                  </span>
                  <strong>ARS {planRevenue.basicBase.toLocaleString('es-AR')}</strong>
                </div>
                <div className={styles.reconcileRow}>
                  <span>
                    Pro · {planRevenue.proCount} ×{' '}
                    ARS {planRevenue.proPrice.toLocaleString('es-AR')}
                  </span>
                  <strong>ARS {planRevenue.proBase.toLocaleString('es-AR')}</strong>
                </div>
                <div className={`${styles.reconcileRow} ${styles.reconcileRowTotal}`}>
                  <span>{planRevenue.payingCount} cuentas pagando</span>
                  <strong>ARS {planRevenue.baseTotal.toLocaleString('es-AR')}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.filterShell}>
            <aside className={styles.yearSidebar}>
              <div className={styles.filterHeader}>
                <p className={styles.sectionEyebrow}>AÑOS</p>
                <h2 className={styles.sectionTitle}>Altas por cohorte</h2>
              </div>

              <div className={styles.yearList}>
                <button
                  type="button"
                  className={`${styles.yearButton} ${!selectedYear ? styles.yearButtonActive : ''}`}
                  onClick={() => {
                    setSelectedYear('');
                    setSelectedMonth('all');
                  }}
                >
                  Todos los años
                </button>
                {yearOptions.map((year) => (
                  <button
                    key={year}
                    type="button"
                    className={`${styles.yearButton} ${selectedYear === year ? styles.yearButtonActive : ''}`}
                    onClick={() => {
                      setSelectedYear(year);
                      setSelectedMonth('all');
                    }}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </aside>

            <div className={styles.filteredContent}>
              <div className={styles.monthToolbar}>
                <button
                  type="button"
                  className={`${styles.monthChip} ${selectedMonth === 'all' ? styles.monthChipActive : ''}`}
                  onClick={() => setSelectedMonth('all')}
                >
                  Todos ({visibleUsers.length})
                </button>

                {monthOptions.map((month) => (
                  <button
                    key={month.value}
                    type="button"
                    className={`${styles.monthChip} ${selectedMonth === month.value ? styles.monthChipActive : ''}`}
                    onClick={() => setSelectedMonth(month.value)}
                  >
                    {month.label} ({month.count})
                  </button>
                ))}
              </div>

              <div className={styles.statusToolbar}>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedStatusFilter === 'all' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedStatusFilter('all')}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedStatusFilter === 'active' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedStatusFilter('active')}
                >
                  Activos
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedStatusFilter === 'inactive' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedStatusFilter('inactive')}
                >
                  Inactivos
                </button>
              </div>

              <div className={styles.statusToolbar}>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedRenewalFilter === 'all' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedRenewalFilter('all')}
                >
                  Todos los modos
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedRenewalFilter === 'manual' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedRenewalFilter('manual')}
                >
                  Manual
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedRenewalFilter === 'automatic' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedRenewalFilter('automatic')}
                >
                  Automática
                </button>
              </div>

              <div className={styles.statusToolbar}>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedDueFilter === 'all' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedDueFilter('all')}
                >
                  Todos los vencimientos
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedDueFilter === '7' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedDueFilter('7')}
                >
                  Vence en 7 días
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedDueFilter === '30' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedDueFilter('30')}
                >
                  Vence en 30 días
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedDueFilter === 'overdue' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedDueFilter('overdue')}
                >
                  Vencido
                </button>
              </div>

              <div className={styles.statusToolbar}>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedDiscountFilter === 'all' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedDiscountFilter('all')}
                >
                  Todos los precios
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedDiscountFilter === 'discounted' ? styles.discountChipActive : ''}`}
                  onClick={() => setSelectedDiscountFilter('discounted')}
                >
                  Con descuento
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedDiscountFilter === 'standard' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedDiscountFilter('standard')}
                >
                  Precio normal
                </button>
              </div>

              <div className={styles.statusToolbar}>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedReferralFilter === 'all' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedReferralFilter('all')}
                >
                  Todos los referidos
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedReferralFilter === 'referred' ? styles.discountChipActive : ''}`}
                  onClick={() => setSelectedReferralFilter('referred')}
                >
                  Con referido
                </button>
                <button
                  type="button"
                  className={`${styles.statusChip} ${selectedReferralFilter === 'none' ? styles.statusChipActive : ''}`}
                  onClick={() => setSelectedReferralFilter('none')}
                >
                  Sin referido
                </button>
              </div>

              <section className={styles.list}>
                {visibleShops.map((shop) => {
                  const user = shop.owner;
                  if (!user?._id) return null;
                  const draft = drafts[user._id] || {};
                  const hasDiscount = hasSubscriptionDiscount(user.subscription);
                  const staffUsers = shop.staffUsers || [];
                  const barbers = shop.barbers || [];
                  const linkedStaffUserIds = new Set(
                    barbers.map((barber) => barber.accessUser?._id).filter(Boolean),
                  );
                  const unlinkedStaffUsers = staffUsers.filter(
                    (staffUser) => !linkedStaffUserIds.has(staffUser._id),
                  );
                  const expanded = expandedShopId === user._id;
                  const planStatusMeta = resolvePlanStatusMeta(user.subscription);
                  const activeCouponDurationBadge = isSubscriptionCouponStillValid(user.subscription)
                    ? getCouponDurationBadge({
                        benefitDurationType: user.subscription?.couponBenefitDurationType,
                        benefitDurationValue: user.subscription?.couponBenefitDurationValue,
                      })
                    : null;
                  return (
                    <article key={user._id} className={styles.card}>
                      <div className={styles.cardTop}>
                        <div>
                          <span className={styles.groupEyebrow}>Barbería admin</span>
                          <h2 className={styles.cardTitle}>{user.fullName}</h2>
                          <p className={styles.cardMeta}>
                            {user.email} · /{user.shopSlug}
                          </p>
                          <p className={styles.cardMeta}>
                            {barbers.length} barberos · {staffUsers.length} cuentas de empleado
                          </p>
                          {hasDiscount ? (
                            <span className={styles.discountBadge}>Plan diferenciado activo</span>
                          ) : null}
                          {isSubscriptionCouponStillValid(user.subscription) ? (
                            <span className={styles.accountCouponWrap}>
                              <span className={styles.discountBadge}>Cupón: {user.subscription.couponCode}</span>
                              {activeCouponDurationBadge ? (
                                <span
                                  className={`${styles.couponDurationBadge} ${activeCouponDurationBadge.className}`}
                                >
                                  {activeCouponDurationBadge.label}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          {user.subscription?.referralCode ? (
                            <span className={styles.accountCouponWrap}>
                              <span className={styles.referralBadge}>
                                Referido: {user.subscription.referralOwnerName || user.subscription.referralCode}
                              </span>
                              <span className={styles.cardMeta}>
                                Código {user.subscription.referralCode}
                              </span>
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.cardDates}>
                          <span>Alta: {formatDate(user.createdAt)}</span>
                          <span className={`${styles.planStatusBadge} ${styles[planStatusMeta.className]}`}>
                            {planStatusMeta.label}
                          </span>
                          <span>{planStatusMeta.dueLabel}</span>
                          <span>Último pago: {formatDate(user.subscription?.lastPaymentAt)}</span>
                          <button
                            type="button"
                            className={styles.groupToggleButton}
                            onClick={() =>
                              setExpandedShopId((current) => (current === user._id ? null : user._id))
                            }
                          >
                            <span>{expanded ? 'Contraer' : 'Expandir'}</span>
                            <span aria-hidden="true">{expanded ? '↑' : '↓'}</span>
                          </button>
                        </div>
                      </div>

                      {expanded ? (
                        <>
                          <div className={styles.staffPanel}>
                            <div className={styles.staffPanelHeader}>
                              <div>
                                <h3>Equipo de /{user.shopSlug || 'sin-slug'}</h3>
                                <p>
                                  Cuenta admin, perfiles de barbero y accesos de empleados separados por barbería.
                                </p>
                              </div>
                              <button
                                type="button"
                                className={styles.deleteInlineButton}
                                onClick={() => handleDeleteUser(user, `la cuenta admin ${user.email}`)}
                                disabled={savingUserId === user._id}
                              >
                                Borrar cuenta admin
                              </button>
                            </div>

                            <div className={styles.staffGrid}>
                              <article className={styles.staffCard}>
                                <span className={styles.staffBadge}>Admin</span>
                                <strong>{user.fullName || 'Sin nombre'}</strong>
                                <p>{user.email}</p>
                                <small>Alta: {formatDate(user.createdAt)}</small>
                              </article>

                              {barbers.map((barber) => (
                                <article key={barber._id} className={styles.staffCard}>
                                  <span className={styles.staffBadge}>Barbero</span>
                                  <strong>{barber.fullName || 'Sin nombre'}</strong>
                                  <p>{barber.email || barber.phone || 'Sin contacto cargado'}</p>
                                  <small>
                                    Perfil: {barber.isActive ? 'activo' : 'inactivo'} · Acceso:{' '}
                                    {barber.accessUser?.email || 'sin cuenta'}
                                  </small>
                                  {barber.accessUser ? (
                                    <button
                                      type="button"
                                      className={styles.deleteInlineButton}
                                      onClick={() =>
                                        handleDeleteUser(
                                          barber.accessUser,
                                          `la cuenta de empleado ${barber.accessUser.email}`,
                                        )
                                      }
                                      disabled={savingUserId === barber.accessUser._id}
                                    >
                                      Borrar cuenta empleado
                                    </button>
                                  ) : null}
                                </article>
                              ))}

                              {unlinkedStaffUsers.map((staffUser) => (
                                <article key={staffUser._id} className={styles.staffCard}>
                                  <span className={styles.staffBadge}>Empleado</span>
                                  <strong>{staffUser.fullName || 'Sin nombre'}</strong>
                                  <p>{staffUser.email}</p>
                                  <small>
                                    Cuenta {staffUser.isActive ? 'activa' : 'inactiva'} · sin perfil de barbero vinculado
                                  </small>
                                  <button
                                    type="button"
                                    className={styles.deleteInlineButton}
                                    onClick={() =>
                                      handleDeleteUser(staffUser, `la cuenta de empleado ${staffUser.email}`)
                                    }
                                    disabled={savingUserId === staffUser._id}
                                  >
                                    Borrar cuenta empleado
                                  </button>
                                </article>
                              ))}

                              {!barbers.length && !staffUsers.length ? (
                                <article className={styles.staffCard}>
                                  <strong>Sin empleados cargados</strong>
                                  <p>Esta barbería todavía no tiene barberos ni accesos asociados.</p>
                                </article>
                              ) : null}
                            </div>
                          </div>

                          <div className={styles.controls}>
                        <label className={styles.selectField}>
                          <span>Plan</span>
                          <select
                            value={draft.plan || 'basic'}
                            onChange={(e) => handleDraftChange(user._id, 'plan', e.target.value)}
                          >
                            {PLAN_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={styles.selectField}>
                          <span>Estado</span>
                          <select
                            value={draft.status || 'trial'}
                            onChange={(e) => handleDraftChange(user._id, 'status', e.target.value)}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={styles.selectField}>
                          <span>Ciclo</span>
                          <select
                            value={draft.billingCycle || 'monthly'}
                            onChange={(e) =>
                              handleDraftChange(user._id, 'billingCycle', e.target.value)
                            }
                          >
                            {BILLING_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={styles.selectField}>
                          <span>Renovación</span>
                          <select
                            value={draft.renewalMode || 'manual'}
                            onChange={(e) =>
                              handleDraftChange(user._id, 'renewalMode', e.target.value)
                            }
                          >
                            {RENEWAL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={styles.selectField}>
                          <span>Vence el</span>
                          <input
                            type="date"
                            value={draft.expiresAt ?? ''}
                            onChange={(e) =>
                              handleDraftChange(user._id, 'expiresAt', e.target.value)
                            }
                          />
                          <small className={styles.fieldHint}>
                            Podés ajustarlo manualmente para pruebas o acuerdos especiales.
                          </small>
                        </label>

                        <label className={styles.selectField}>
                          <span>Precio especial ARS</span>
                          <input
                            type="number"
                            value={draft.customPriceArs ?? ''}
                            onChange={(e) =>
                              handleDraftChange(user._id, 'customPriceArs', e.target.value)
                            }
                            placeholder="Automático por plan"
                          />
                          <small className={styles.fieldHint}>
                            Si lo dejás vacío, usa el precio general del plan.
                          </small>
                        </label>

                        <label className={styles.selectField}>
                          <span>Descuento %</span>
                          <input
                            type="number"
                            value={draft.discountPercent ?? ''}
                            onChange={(e) =>
                              handleDiscountPercentChange(user._id, e.target.value)
                            }
                            placeholder="Ej. 5"
                          />
                          <small className={styles.fieldHint}>
                            Calcula automáticamente el precio especial final para esta cuenta.
                          </small>
                        </label>

                        <label className={styles.selectField}>
                          <span>Ref. USD especial</span>
                          <input
                            type="number"
                            value={draft.customPriceUsdReference ?? ''}
                            onChange={(e) =>
                              handleDraftChange(user._id, 'customPriceUsdReference', e.target.value)
                            }
                            placeholder="Automático por plan"
                          />
                          <small className={styles.fieldHint}>
                            Solo referencia. El cobro real sigue el valor principal configurado.
                          </small>
                        </label>

                        <label className={`${styles.selectField} ${styles.notesField}`}>
                          <span>Notas internas</span>
                          <textarea
                            value={draft.internalNotes ?? ''}
                            onChange={(e) =>
                              handleDraftChange(user._id, 'internalNotes', e.target.value)
                            }
                            placeholder="Ej. cliente con precio acordado o seguimiento comercial"
                            className={styles.textarea}
                            rows={4}
                          />
                        </label>
                          </div>

                          <div className={styles.cardActions}>
                        <div className={styles.currentStateWrap}>
                          <span className={`${styles.currentState} ${hasDiscount ? styles.currentStateDiscount : ''}`}>
                            Actual: {user.subscription?.plan || 'basic'} · {user.subscription?.status || 'trial'} ·{' '}
                            ARS {getPlanAmount(user.subscription?.plan, user.subscription).toLocaleString('es-AR')}
                          </span>
                          <span className={styles.currentMeta}>
                            Renovación: {resolveRenewalModeLabel(user.subscription?.renewalMode)} · Próximo cobro:{' '}
                            {formatDate(resolveNextDueDate(user.subscription))}
                          </span>
                          {isSubscriptionCouponStillValid(user.subscription) ? (
                            <span className={styles.currentMeta}>
                              Beneficio activo: cupón {user.subscription.couponCode} ·{' '}
                              {getSubscriptionDiscountLabel(user.subscription)}
                            </span>
                          ) : null}
                          {user.subscription?.referralCode ? (
                            <span className={styles.currentMeta}>
                              Alta atribuida a {user.subscription.referralOwnerName || 'referido'} · código{' '}
                              {user.subscription.referralCode}
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.inlineActions}>
                          <button
                            type="button"
                            className={styles.secondaryInlineButton}
                            onClick={() => handleCopyRenewalLink(user)}
                          >
                            Copiar link de renovación
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryInlineButton}
                            onClick={() => handleResetCustomPricing(user._id)}
                          >
                            Aplicar precio normal
                          </button>
                          <button
                            type="button"
                            className={styles.deleteInlineButton}
                            onClick={() => handleDeleteUser(user, `la cuenta admin ${user.email}`)}
                            disabled={savingUserId === user._id}
                          >
                            Borrar cuenta admin
                          </button>
                          <button
                            className={styles.saveButton}
                            onClick={() => handleSave(user._id)}
                            disabled={savingUserId === user._id}
                          >
                            {savingUserId === user._id ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                        </div>
                          </div>
                        </>
                      ) : null}
                    </article>
                  );
                })}
              </section>
            </div>
          </section>
        </>
      ) : (
        <section className={styles.emptyState}>
          <p>
            Cargá el secret y tocá <strong>Cargar cuentas</strong> para ver el panel.
          </p>
        </section>
      )}
    </main>
  );
}
