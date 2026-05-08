export function normalizeCouponCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

export function applyPercentDiscount(amount, percent) {
  const safeAmount = Number(amount || 0);
  const safePercent = Number(percent || 0);
  if (!(safeAmount > 0) || !(safePercent > 0)) return 0;
  const multiplier = Math.max(0, 1 - safePercent / 100);
  return Number((safeAmount * multiplier).toFixed(2));
}

export function applyFixedDiscountByUsdReference({
  amountArs,
  baseUsdReference,
  discountAmountUsdReference,
}) {
  const safeAmountArs = Number(amountArs || 0);
  const safeBaseUsdReference = Number(baseUsdReference || 0);
  const safeDiscountUsdReference = Number(discountAmountUsdReference || 0);

  if (!(safeAmountArs > 0) || !(safeBaseUsdReference > 0) || !(safeDiscountUsdReference > 0)) {
    return safeAmountArs;
  }

  const arsPerUsd = safeAmountArs / safeBaseUsdReference;
  const discountArs = Number((arsPerUsd * safeDiscountUsdReference).toFixed(2));
  return Math.max(0, Number((safeAmountArs - discountArs).toFixed(2)));
}

export function resolvePlanPricingForSubscription({
  plan,
  pricing,
  subscription = {},
  couponDiscountType = "percentage",
  couponDiscountPercent = 0,
  couponDiscountAmountUsdReference = 0,
}) {
  const baseArs = Number(pricing?.[plan]?.ars || 0);
  const baseUsdReference = Number(pricing?.[plan]?.usdReference || 0);

  const customPriceArs = Number(subscription?.customPriceArs ?? 0);
  const customPriceUsdReference = Number(subscription?.customPriceUsdReference ?? 0);
  const accountCouponValidUntil = subscription?.couponValidUntil
    ? new Date(subscription.couponValidUntil)
    : null;
  const accountCouponStillValid =
    !accountCouponValidUntil || Number.isNaN(accountCouponValidUntil.getTime())
      ? true
      : accountCouponValidUntil.getTime() >= Date.now();
  const accountCouponType = accountCouponStillValid
    ? String(subscription?.couponDiscountType || "percentage").trim() || "percentage"
    : "percentage";
  const accountCouponPercent = accountCouponStillValid
    ? Number(subscription?.couponDiscountPercent ?? 0)
    : 0;
  const accountCouponAmountUsdReference = accountCouponStillValid
    ? Number(subscription?.couponDiscountAmountUsdReference ?? 0)
    : 0;
  const effectiveCouponType =
    String(couponDiscountType || accountCouponType || "percentage").trim() || "percentage";
  const effectiveCouponPercent = Number(couponDiscountPercent || accountCouponPercent || 0);
  const effectiveCouponAmountUsdReference = Number(
    couponDiscountAmountUsdReference || accountCouponAmountUsdReference || 0,
  );

  if (customPriceArs > 0) {
    return {
      baseArs,
      baseUsdReference,
      effectiveArs: customPriceArs,
      effectiveUsdReference:
        customPriceUsdReference > 0 ? customPriceUsdReference : baseUsdReference,
      discountApplied: customPriceArs < baseArs,
      couponDiscountType: null,
      couponDiscountPercent: 0,
      couponDiscountAmountUsdReference: 0,
      source: "custom_price",
    };
  }

  if (effectiveCouponType === "fixed_usd_reference" && effectiveCouponAmountUsdReference > 0) {
    const effectiveArs = applyFixedDiscountByUsdReference({
      amountArs: baseArs,
      baseUsdReference,
      discountAmountUsdReference: effectiveCouponAmountUsdReference,
    });
    return {
      baseArs,
      baseUsdReference,
      effectiveArs,
      effectiveUsdReference: Math.max(
        0,
        Number((baseUsdReference - effectiveCouponAmountUsdReference).toFixed(2)),
      ),
      discountApplied: effectiveArs < baseArs,
      couponDiscountType: effectiveCouponType,
      couponDiscountPercent: 0,
      couponDiscountAmountUsdReference: effectiveCouponAmountUsdReference,
      source: "coupon",
    };
  }

  if (effectiveCouponPercent > 0) {
    return {
      baseArs,
      baseUsdReference,
      effectiveArs: applyPercentDiscount(baseArs, effectiveCouponPercent),
      effectiveUsdReference: applyPercentDiscount(
        baseUsdReference,
        effectiveCouponPercent,
      ),
      discountApplied: true,
      couponDiscountType: "percentage",
      couponDiscountPercent: effectiveCouponPercent,
      couponDiscountAmountUsdReference: 0,
      source: "coupon",
    };
  }

  return {
    baseArs,
    baseUsdReference,
    effectiveArs: baseArs,
    effectiveUsdReference: baseUsdReference,
    discountApplied: false,
    couponDiscountType: null,
    couponDiscountPercent: 0,
    couponDiscountAmountUsdReference: 0,
    source: "plan",
  };
}
