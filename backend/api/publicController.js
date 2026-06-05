import mongoose from "mongoose";
import { AppointmentModel } from "../models/Appointment.js";
import { SubscriptionCouponModel } from "../models/SubscriptionCoupon.js";
import { ServiceModel } from "../models/Services.js";
import { UserModel } from "../models/User.js";
import admin from "../firebase.js";
import { BarberModel } from "../models/Barber.js";
import { sendAppMail } from "../services/mailer.js";
import {
  activateSubscriptionFromApprovedPayment,
  applyPendingCouponToSubscription,
  calculateSubscriptionExpiry,
  createAppointmentMercadoPagoPreference,
} from "./paymentController.js";
import {
  getTimeZoneDayRange,
  getTimeZoneLabel,
  getTimeZoneWeekday,
} from "../utils/timezone.js";
import { resolveBarberScheduleForWeekday } from "../utils/barberSchedule.js";
import {
  normalizeBarberClosedDays,
  resolveBarberClosureForDate,
  serializeBarberClosure,
} from "../utils/barberClosures.js";
import {
  doesTimeBlockOverlapRange,
  resolveBarberTimeBlocksForDate,
  serializeBarberTimeBlocks,
} from "../utils/barberTimeBlocks.js";
import {
  normalizeShopClosedDays,
  resolveShopClosureForDate,
  serializeShopClosure,
} from "../utils/shopClosures.js";
import {
  buildMercadoPagoSubscriptionReturnUrls,
  buildMercadoPagoSubscriptionWebhookUrl,
  createMercadoPagoSystemPayment,
  createMercadoPagoSystemPreapproval,
  createMercadoPagoSystemPreference,
} from "../services/mercadoPago.js";
import {
  buildAstroPaySubscriptionReturnUrls,
  buildAstroPaySubscriptionWebhookUrl,
  createAstroPayCheckout,
} from "../services/astroPay.js";
import {
  getOrCreatePlanPricing,
  serializePlanPricing,
} from "../services/planPricingService.js";
import {
  normalizeCouponCode,
  resolveAdditionalBusinessesArs,
  resolvePlanPricingForSubscription,
} from "../services/subscriptionPricingService.js";
import { notifySubscriptionActivated } from "../services/subscriptionLifecycleService.js";
import {
  getBusinessTypeLabel,
  normalizeBusinessType,
} from "../utils/businessTypes.js";
import { getAppointmentOccupiedEnd } from "../utils/appointmentTiming.js";
import {
  resolveAssignedBarberPushTarget,
  resolveOwnerPushTarget,
} from "../utils/pushRecipients.js";

function buildDayRange(dateParam) {
  return getTimeZoneDayRange(dateParam);
}

function logPushError(label, error) {
  console.error(label, {
    code: error?.code,
    message: error?.message,
    errorInfo: error?.errorInfo,
  });
}

function isInvalidPushTokenError(error) {
  const code = String(error?.code || error?.errorInfo?.code || "");
  return [
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
    "messaging/invalid-argument",
  ].includes(code);
}

function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeSubscriptionPaymentProvider(value) {
  const normalized = String(value || "mercadopago").trim().toLowerCase();
  return normalized === "mercadopago" ? "mercadopago" : null;
}

function normalizeSubscriptionProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function isStoreSubscriptionProvider(provider) {
  return provider === "apple" || provider === "google";
}

function ensureWebSubscriptionCheckoutAllowed(userDoc) {
  const currentProvider = normalizeSubscriptionProvider(userDoc?.subscription?.provider);
  if (!isStoreSubscriptionProvider(currentProvider)) return null;

  return {
    status: 409,
    body: {
      error: "Esta cuenta ya tiene una suscripción asociada a la tienda donde fue activada.",
      code: "SUBSCRIPTION_CHANNEL_LOCKED",
      provider: currentProvider,
    },
  };
}

const LIGHT_SHOP_SELECT = {
  fullName: 1,
  shopSlug: 1,
  businessType: 1,
  publicProfile: 1,
  paymentSettings: 1,
  shopClosedDays: 1,
  "themeConfig.mode": 1,
  "themeConfig.webPreset": 1,
  "themeConfig.primary": 1,
  "themeConfig.secondary": 1,
  "themeConfig.card": 1,
  "themeConfig.gradientColors": 1,
};

const FULL_SHOP_SELECT = {
  ...LIGHT_SHOP_SELECT,
  "themeConfig.logoDataUrl": 1,
  "themeConfig.bannerDataUrl": 1,
  "themeConfig.mobileBannerDataUrl": 1,
};

async function findActiveShop(shopSlug, { includeMedia = false } = {}) {
  const normalized = normalizeSlug(shopSlug);
  if (!normalized) return null;
  return UserModel.findOne({ shopSlug: normalized, isActive: true })
    .select(includeMedia ? FULL_SHOP_SELECT : LIGHT_SHOP_SELECT)
    .lean();
}

// ← Convierte siempre a ObjectId para que Mongoose matchee correctamente
function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

function getEntityId(value) {
  if (!value) return "";
  if (typeof value === "object") {
    return String(value._id || value.id || value.serviceId || "");
  }
  return String(value);
}

function parseTimeToMinutes(value) {
  const [hour, minute] = String(value || "")
    .trim()
    .split(":")
    .map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function parseScheduleRangeToMinutes(value) {
  const parts = String(value || "").split("-");
  if (parts.length < 2) return null;
  const start = parseTimeToMinutes(parts[0]);
  const end = parseTimeToMinutes(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

function doesRangeFitSchedule(resolvedSchedule, startMinutes, endMinutes) {
  const ranges = Array.isArray(resolvedSchedule?.scheduleRanges)
    ? resolvedSchedule.scheduleRanges
    : [];

  if (ranges.length) {
    return ranges.some((range) => {
      const start = parseTimeToMinutes(range?.start);
      const end = parseTimeToMinutes(range?.end);
      return start != null && end != null && startMinutes >= start && endMinutes <= end;
    });
  }

  const parsedRange = parseScheduleRangeToMinutes(resolvedSchedule?.scheduleRange);
  if (!parsedRange) return false;
  return startMinutes >= parsedRange.start && endMinutes <= parsedRange.end;
}

function sanitizeBarber(barber) {
  if (!barber) return null;
  return {
    _id: barber._id.toString(),
    fullName: barber.fullName,
    photoUrl: barber.photoUrl || null,
    serviceIds: (barber.serviceIds || []).map(getEntityId).filter(Boolean),
    shift: barber.shift,
    bookingSlotIntervalMinutes:
      Number(barber.bookingSlotIntervalMinutes) === 30 ? 30 : 15,
    scheduleRange: barber.scheduleRange || null,
    scheduleRanges: barber.scheduleRanges || [],
    dayScheduleOverrides: (barber.dayScheduleOverrides || []).map((item) => ({
      day: Number(item?.day),
      validFrom: item?.validFrom || null,
      useBase: Boolean(item?.useBase),
      scheduleRange: item?.scheduleRange || null,
      scheduleRanges: item?.scheduleRanges || [],
    })),
    barberClosedDays: normalizeBarberClosedDays(barber.barberClosedDays),
    bookingBufferMinutes: Number(barber.bookingBufferMinutes || 0),
    barberTimeBlocks: serializeBarberTimeBlocks(barber.barberTimeBlocks),
    workDays: barber.workDays || [],
  };
}

function barberSupportsServiceIds(barber, serviceIds = []) {
  const assignedIds = (barber?.serviceIds || []).map(getEntityId).filter(Boolean);
  if (!assignedIds.length) return true;
  const assignedSet = new Set(assignedIds);
  return serviceIds.every((id) => assignedSet.has(getEntityId(id)));
}

function sanitizeAppointment(app) {
  return {
    _id: app._id.toString(),
    startTime: app.startTime,
    durationMinutes: app.durationMinutes ?? 30,
    bufferAfterMinutesApplied: app.bufferAfterMinutesApplied ?? 0,
    status: app.status,
  };
}

function sanitizeShop(shop) {
  if (!shop) return null;
  const paymentSettings = shop.paymentSettings || {};
  const themeConfig = shop.themeConfig || {};
  const publicProfile = shop.publicProfile || {};
  return {
    _id: shop._id.toString(),
    name: shop.fullName,
    slug: shop.shopSlug,
    businessType: normalizeBusinessType(shop.businessType),
    businessTypeLabel: getBusinessTypeLabel(shop.businessType),
    publicProfile: {
      subtitle: publicProfile.subtitle || null,
      address: publicProfile.address || null,
      phone: publicProfile.phone || null,
      googleMapsUrl: publicProfile.googleMapsUrl || null,
      googleReviewsUrl: publicProfile.googleReviewsUrl || null,
      instagramUrl: publicProfile.instagramUrl || null,
      linktreeUrl: publicProfile.linktreeUrl || null,
      googlePlaceId: publicProfile.googlePlaceId || null,
      googleRating: Number(publicProfile.googleRating || 0) > 0
        ? Number(publicProfile.googleRating)
        : null,
      googleReviewCount: Number(publicProfile.googleReviewCount || 0) > 0
        ? Number(publicProfile.googleReviewCount)
        : null,
    },
    themeConfig: {
      mode: themeConfig.mode || null,
      webPreset: themeConfig.webPreset || null,
      primary: themeConfig.primary || null,
      secondary: themeConfig.secondary || null,
      card: themeConfig.card || null,
      gradientColors:
        Array.isArray(themeConfig.gradientColors) &&
        themeConfig.gradientColors.length === 4
          ? themeConfig.gradientColors
          : null,
      logoDataUrl: themeConfig.logoDataUrl || null,
      bannerDataUrl: themeConfig.bannerDataUrl || null,
      mobileBannerDataUrl: themeConfig.mobileBannerDataUrl || null,
    },
    paymentSettings: {
      cashEnabled: paymentSettings.cashEnabled !== false,
      advancePaymentEnabled: Boolean(paymentSettings.advancePaymentEnabled),
      advanceMode: paymentSettings.advanceMode || "deposit",
      advanceType: paymentSettings.advanceType || "percent",
      advanceValue: Number(paymentSettings.advanceValue || 0),
      bookingSlotIntervalMinutes: [15, 30].includes(
        Number(paymentSettings.bookingSlotIntervalMinutes),
      )
        ? Number(paymentSettings.bookingSlotIntervalMinutes)
        : 15,
      mercadoPagoReady: paymentSettings.mercadoPagoConnectionStatus === "connected",
      mercadoPagoConnectionStatus:
        paymentSettings.mercadoPagoConnectionStatus || "disconnected",
      bookingCouponsEnabled:
        Array.isArray(paymentSettings.bookingCoupons) &&
        paymentSettings.bookingCoupons.some(
          (coupon) => coupon && coupon.isActive !== false && coupon.code,
        ),
    },
    shopClosedDays: normalizeShopClosedDays(shop.shopClosedDays),
  };
}

function sanitizeShopSummary(shop) {
  if (!shop) return null;
  return {
    _id: shop._id.toString(),
    name: shop.fullName,
    slug: shop.shopSlug,
    businessType: normalizeBusinessType(shop.businessType),
    businessTypeLabel: getBusinessTypeLabel(shop.businessType),
  };
}

function sanitizeShopMedia(shop) {
  const themeConfig = shop?.themeConfig || {};
  return {
    themeConfig: {
      logoDataUrl: themeConfig.logoDataUrl || null,
      bannerDataUrl: themeConfig.bannerDataUrl || null,
      mobileBannerDataUrl: themeConfig.mobileBannerDataUrl || null,
    },
  };
}

function sanitizeService(service) {
  if (!service) return null;
  return {
    _id: service._id.toString(),
    name: service.name,
    durationMinutes: service.durationMinutes ?? 30,
    price: service.price ?? 0,
    sortOrder: service.sortOrder ?? 0,
  };
}

function normalizePaymentMethod(value) {
  return value === "transfer" ? "transfer" : "cash";
}

function normalizePublicPlan(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["basic", "pro"].includes(normalized) ? normalized : null;
}

async function findValidSubscriptionCoupon({ couponCode, plan }) {
  const normalizedCode = normalizeCouponCode(couponCode);
  if (!normalizedCode) return null;

  const coupon = await SubscriptionCouponModel.findOne({
    code: normalizedCode,
    isActive: true,
  }).lean();

  if (!coupon) {
    const error = new Error("El cupón ingresado no existe o no está activo.");
    error.statusCode = 404;
    throw error;
  }

  if (coupon.plan && coupon.plan !== plan) {
    const error = new Error("Ese cupón no aplica al plan seleccionado.");
    error.statusCode = 400;
    throw error;
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    const error = new Error("Ese cupón ya venció.");
    error.statusCode = 400;
    throw error;
  }

  if (
    Number.isFinite(Number(coupon.maxRedemptions)) &&
    Number(coupon.maxRedemptions) > 0 &&
    Number(coupon.redemptionCount || 0) >= Number(coupon.maxRedemptions)
  ) {
    const error = new Error("Ese cupón ya alcanzó el máximo de usos.");
    error.statusCode = 400;
    throw error;
  }

  return coupon;
}

async function activateFreeSubscriptionCoupon({
  userDoc,
  plan,
  coupon,
  pricing,
  provider = "mercadopago",
}) {
  const activatedAt = new Date();

  userDoc.subscription = {
    ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
    pendingPlan: plan,
    billingCycle: "monthly",
    renewalMode: "manual",
    pendingCouponCode: coupon ? coupon.code : null,
    pendingCouponDiscountType: coupon ? coupon.discountType || "percentage" : null,
    pendingCouponDiscountPercent: coupon ? Number(coupon.discountPercent || 0) : null,
    pendingCouponDiscountAmountUsdReference: coupon ? Number(coupon.discountAmountUsdReference || 0) : null,
    pendingCouponBenefitDurationType: coupon ? coupon.benefitDurationType || "forever" : null,
    pendingCouponBenefitDurationValue: coupon ? coupon.benefitDurationValue ?? null : null,
  };

  const resolvedCouponPricing = await applyPendingCouponToSubscription({
    userDoc,
    plan,
    pricing,
  });

  const expiresAt = calculateSubscriptionExpiry({
    billingCycle: "monthly",
    paidAt: activatedAt,
  });

  userDoc.subscription = {
    ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
    plan,
    status: "active",
    billingCycle: "monthly",
    renewalMode: "manual",
    provider,
    startedAt: activatedAt,
    expiresAt,
    nextBillingAt: expiresAt,
    pendingPlan: null,
    mercadoPagoPreferenceId: null,
    mercadoPagoPreapprovalId: null,
    mercadoPagoPreapprovalStatus: null,
    mercadoPagoPaymentId: null,
    lastPaymentAt: activatedAt,
    renewalReminder7dAt: null,
    renewalReminder3dAt: null,
    renewalReminder1dAt: null,
    pastDueAt: null,
    pastDueReminderSentAt: null,
    graceUntil: null,
    cancelledAt: null,
  };

  await userDoc.save();

  try {
    await notifySubscriptionActivated({
      userDoc,
      plan,
      amountArs: 0,
      expiresAt,
      renewalMode: "manual",
      activationReason: "free_coupon",
    });
  } catch (error) {
    console.error(
      "Error notificando activación gratis por cupón:",
      error?.message || error,
    );
  }

  return {
    activatedAt,
    expiresAt,
    resolvedCouponPricing,
  };
}

function validatePublicPaymentSelection(shop, paymentMethod) {
  const settings = shop?.paymentSettings || {};
  const normalized = normalizePaymentMethod(paymentMethod);
  const cashEnabled = settings.cashEnabled !== false;
  const advanceEnabled =
    Boolean(settings.advancePaymentEnabled) &&
    settings.mercadoPagoConnectionStatus === "connected";

  if (normalized === "cash" && !cashEnabled) {
    throw new Error("Esta barbería no está tomando pagos en el local en este momento.");
  }

  if (normalized === "transfer" && !advanceEnabled) {
    throw new Error("El pago adelantado no está habilitado para esta barbería.");
  }

  return normalized;
}

async function resolveServicePrice({ ownerId, serviceName, providedPrice }) {
  const parsedPrice = Number(providedPrice);
  if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
    return parsedPrice;
  }

  const serviceDoc = await ServiceModel.findOne({
    owner: ownerId,
    name: serviceName,
  })
    .select({ price: 1 })
    .lean();

  return Number(serviceDoc?.price || 0);
}

// ====== CUPONES DE RESERVA (descuento al cliente) ======

function normalizeBookingCouponCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

function findActiveBookingCoupon(shop, couponCode) {
  const code = normalizeBookingCouponCode(couponCode);
  if (!code) return null;
  const coupons = Array.isArray(shop?.paymentSettings?.bookingCoupons)
    ? shop.paymentSettings.bookingCoupons
    : [];
  return (
    coupons.find(
      (coupon) =>
        coupon?.isActive !== false &&
        normalizeBookingCouponCode(coupon?.code) === code,
    ) || null
  );
}

function calculateCouponDiscountForService(coupon, serviceDoc) {
  if (!coupon || !serviceDoc) return 0;
  const serviceId = String(serviceDoc._id);
  const allowedServices = Array.isArray(coupon.serviceIds)
    ? coupon.serviceIds.map(String).filter(Boolean)
    : [];
  if (allowedServices.length && !allowedServices.includes(serviceId)) {
    return 0;
  }

  const price = Math.max(0, Number(serviceDoc.price || 0));
  const discountValue = Math.max(0, Number(coupon.discountValue || 0));
  if (!price || !discountValue) return 0;

  const rawDiscount =
    coupon.discountType === "fixed"
      ? discountValue
      : price * (Math.min(discountValue, 100) / 100);
  return Math.min(price, Math.round(rawDiscount));
}

function buildCouponQuote(coupon, services) {
  if (!coupon || !Array.isArray(services) || !services.length) return null;
  const serviceDiscounts = services.map((service) => {
    const originalPrice = Math.max(0, Number(service.price || 0));
    const discountAmount = calculateCouponDiscountForService(coupon, service);
    return {
      serviceId: String(service._id),
      name: service.name,
      originalPrice,
      discountAmount,
      finalPrice: Math.max(0, originalPrice - discountAmount),
    };
  });
  const totalOriginal = serviceDiscounts.reduce(
    (sum, item) => sum + item.originalPrice,
    0,
  );
  const totalDiscount = serviceDiscounts.reduce(
    (sum, item) => sum + item.discountAmount,
    0,
  );

  if (totalDiscount <= 0) return null;

  return {
    code: normalizeBookingCouponCode(coupon.code),
    name: coupon.name || normalizeBookingCouponCode(coupon.code),
    discountType: coupon.discountType === "fixed" ? "fixed" : "percent",
    discountValue: Number(coupon.discountValue || 0),
    totalOriginal,
    totalDiscount,
    totalFinal: Math.max(0, totalOriginal - totalDiscount),
    serviceDiscounts,
  };
}

async function resolveAppointmentServices({
  ownerId,
  service,
  servicePrice,
  durationMinutes,
  serviceItems,
  couponCode,
  shop,
}) {
  if (Array.isArray(serviceItems) && serviceItems.length > 0) {
    const rawIds = serviceItems
      .map((item) => String(item?.serviceId || "").trim())
      .filter(Boolean);

    if (!rawIds.length) {
      throw new Error("Debes seleccionar al menos un servicio.");
    }

    const uniqueIds = [...new Set(rawIds)];
    const invalidId = uniqueIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidId) {
      throw new Error("Uno de los servicios elegidos no es válido.");
    }

    const docs = await ServiceModel.find({
      owner: ownerId,
      _id: { $in: uniqueIds.map((id) => toObjectId(id)) },
      isActive: true,
    })
      .select({ name: 1, durationMinutes: 1, price: 1 })
      .lean();

    const docMap = new Map(docs.map((doc) => [String(doc._id), doc]));

    const normalizedItems = rawIds.map((id) => {
      const doc = docMap.get(id);
      if (!doc) {
        throw new Error("Uno de los servicios elegidos ya no está disponible.");
      }

      return {
        serviceId: toObjectId(id),
        name: String(doc.name || "").trim(),
        durationMinutes: Number(doc.durationMinutes || 30),
        price: Number(doc.price || 0),
      };
    });

    const totalDuration = normalizedItems.reduce(
      (sum, item) => sum + Number(item.durationMinutes || 0),
      0,
    );
    const totalPrice = normalizedItems.reduce(
      (sum, item) => sum + Number(item.price || 0),
      0,
    );

    if (!Number.isFinite(totalDuration) || totalDuration < 10 || totalDuration > 480) {
      throw new Error("La combinación de servicios supera la duración permitida.");
    }

    // Cupón de descuento del cliente (opcional).
    let couponQuote = null;
    let finalTotalPrice = totalPrice;
    if (couponCode && shop) {
      const coupon = findActiveBookingCoupon(shop, couponCode);
      if (coupon) {
        const orderedServices = normalizedItems.map((item) => ({
          _id: item.serviceId,
          name: item.name,
          price: item.price,
        }));
        couponQuote = buildCouponQuote(coupon, orderedServices);
        if (couponQuote) {
          finalTotalPrice = couponQuote.totalFinal;
        }
      }
    }

    return {
      serviceLabel: normalizedItems.map((item) => item.name).join(" + "),
      items: normalizedItems,
      totalDuration,
      totalPrice: finalTotalPrice,
      totalOriginalPrice: totalPrice,
      couponQuote,
    };
  }

  const resolvedServicePrice = await resolveServicePrice({
    ownerId,
    serviceName: service,
    providedPrice: servicePrice,
  });

  return {
    serviceLabel: String(service || "").trim(),
    items: [],
    totalDuration: Number(durationMinutes) || 30,
    totalPrice: resolvedServicePrice,
    totalOriginalPrice: resolvedServicePrice,
    couponQuote: null,
  };
}

export async function publicGetShop(req, res, next) {
  try {
    const shop = await findActiveShop(req.params.shopSlug);
    if (!shop) return res.status(404).json({ error: "Barbería no encontrada" });
    const ownerId = toObjectId(shop._id);
    const totalBarbers = await BarberModel.countDocuments({
      owner: ownerId,
      isActive: true,
    });
    return res.json({
      shop: sanitizeShop(shop),
      stats: { barbers: totalBarbers },
    });
  } catch (err) {
    return next(err);
  }
}

export async function publicGetShopMedia(req, res, next) {
  try {
    const shop = await findActiveShop(req.params.shopSlug, { includeMedia: true });
    if (!shop) return res.status(404).json({ error: "Barbería no encontrada" });
    return res.json(sanitizeShopMedia(shop));
  } catch (err) {
    return next(err);
  }
}

export async function publicGetPlanPricing(req, res, next) {
  try {
    const pricingDoc = await getOrCreatePlanPricing();
    return res.json({ pricing: serializePlanPricing(pricingDoc) });
  } catch (err) {
    return next(err);
  }
}

// Cantidad de locales adicionales pedida desde el front (autoservicio).
// Devuelve null si no vino (para caer al valor guardado en la cuenta).
function parseRequestedAdditionalBusinesses(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.trunc(Number(value)));
}

// Nombres de los locales adicionales elegidos en el checkout.
function parseBusinessNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((n) => String(n || "").trim())
    .filter((n) => n.length > 0)
    .slice(0, 20);
}

export async function publicCreateSubscriptionCheckout(req, res, next) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const plan = normalizePublicPlan(req.body?.plan);
    const couponCode = String(req.body?.couponCode || "").trim();
    const paymentProvider = normalizeSubscriptionPaymentProvider(req.body?.provider);
    const requestedExtra = parseRequestedAdditionalBusinesses(req.body?.additionalBusinesses);
    const businessNames = parseBusinessNames(req.body?.businessNames);

    if (!email || !plan) {
      return res.status(400).json({
        error: "Necesitamos el email de la cuenta y un plan válido para generar el pago.",
      });
    }

    if (!paymentProvider) {
      return res.status(400).json({
        error: "Por ahora el pago web disponible es Mercado Pago. Seleccioná Mercado Pago para continuar.",
      });
    }

    const userDoc = await UserModel.findOne({ email, isActive: true });
    if (!userDoc) {
      return res.status(404).json({
        error: "No encontramos una cuenta activa con ese email.",
      });
    }

    const channelConflict = ensureWebSubscriptionCheckoutAllowed(userDoc);
    if (channelConflict) {
      return res.status(channelConflict.status).json(channelConflict.body);
    }

    const pricingDoc = await getOrCreatePlanPricing();
    const pricing = serializePlanPricing(pricingDoc);
    const coupon = couponCode
      ? await findValidSubscriptionCoupon({ couponCode, plan })
      : null;
    const resolvedPricing = resolvePlanPricingForSubscription({
      plan,
      pricing,
      subscription: userDoc.subscription,
      couponDiscountType: String(coupon?.discountType || "percentage").trim() || "percentage",
      couponDiscountPercent: Number(coupon?.discountPercent || 0),
      couponDiscountAmountUsdReference: Number(coupon?.discountAmountUsdReference || 0),
    });
    const effectiveExtra =
      requestedExtra ?? Number(userDoc.subscription?.additionalBusinesses || 0);
    const additionalBusinessesPricing = resolveAdditionalBusinessesArs({
      plan,
      pricing,
      subscription: { additionalBusinesses: effectiveExtra },
    });
    const amount = Number(
      (Number(resolvedPricing.effectiveArs || 0) +
        Number(additionalBusinessesPricing.ars || 0)).toFixed(2),
    );

    const canActivateForFree =
      Boolean(coupon) &&
      resolvedPricing.discountApplied &&
      !(amount > 0) &&
      Number(resolvedPricing.baseArs || 0) > 0;

    if (!(amount > 0) && canActivateForFree) {
      const activation = await activateFreeSubscriptionCoupon({
        userDoc,
        plan,
        coupon,
        pricing,
        provider: paymentProvider,
      });

      return res.json({
        activatedDirectly: true,
        activationReason: "free_coupon",
        amount: 0,
        currencyId: "ARS",
        discountApplied: true,
        baseAmount: resolvedPricing.baseArs,
        couponApplied: coupon.code,
        couponBenefitDurationType: coupon.benefitDurationType || "forever",
        couponBenefitDurationValue: coupon.benefitDurationValue ?? null,
        renewalMode: "manual",
        startedAt: activation.activatedAt,
        expiresAt: activation.expiresAt,
        message:
          "El cupón dejó el plan bonificado y activamos la cuenta sin pasar por Mercado Pago.",
      });
    }

    if (!(amount > 0)) {
      return res.status(400).json({
        error: "El plan no tiene un precio configurado.",
      });
    }

    const externalReference = `subscription:${userDoc._id.toString()}:${plan}:${Date.now()}`;
    if (paymentProvider === "astropay") {
      const returnUrls = buildAstroPaySubscriptionReturnUrls();
      const checkout = await createAstroPayCheckout({
        payload: {
          amount,
          currency: "ARS",
          reference: externalReference,
          description: `Suscripción ShiftHub ${plan === "basic" ? "Básico" : "Pro"}`,
          customer: {
            email: userDoc.email,
            name: userDoc.fullName,
          },
          callbackUrl: `${buildAstroPaySubscriptionWebhookUrl()}?userId=${userDoc._id.toString()}`,
          notificationUrl: `${buildAstroPaySubscriptionWebhookUrl()}?userId=${userDoc._id.toString()}`,
          successUrl: returnUrls.success,
          pendingUrl: returnUrls.pending,
          failureUrl: returnUrls.failure,
          metadata: {
            user_id: userDoc._id.toString(),
            plan,
            billing_cycle: "monthly",
            subscription_type: "shifthub_plan",
          },
        },
      });

      if (!checkout.checkoutUrl) {
        return res.status(502).json({
          error: "AstroPay no devolvió un link de pago para este checkout.",
          details: checkout.raw,
        });
      }

      userDoc.subscription = {
        ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
        pendingPlan: plan,
        billingCycle: userDoc.subscription?.billingCycle || "monthly",
        provider: "astropay",
        additionalBusinesses: effectiveExtra,
        pendingBusinessNames: businessNames,
        astroPayCheckoutId: checkout.checkoutId ? String(checkout.checkoutId) : null,
        pendingCouponCode: coupon ? coupon.code : null,
        pendingCouponDiscountType: coupon ? coupon.discountType || "percentage" : null,
        pendingCouponDiscountPercent: coupon ? Number(coupon.discountPercent || 0) : null,
        pendingCouponDiscountAmountUsdReference: coupon ? Number(coupon.discountAmountUsdReference || 0) : null,
        pendingCouponBenefitDurationType: coupon ? coupon.benefitDurationType || "forever" : null,
        pendingCouponBenefitDurationValue: coupon ? coupon.benefitDurationValue ?? null : null,
      };
      await userDoc.save();

      return res.json({
        provider: "astropay",
        checkoutUrl: checkout.checkoutUrl,
        checkoutId: checkout.checkoutId,
        amount,
        currencyId: "ARS",
        discountApplied: resolvedPricing.discountApplied,
        baseAmount: resolvedPricing.baseArs,
        couponApplied: coupon ? coupon.code : null,
        couponDiscountType: coupon ? coupon.discountType || "percentage" : null,
        couponDiscountAmountUsdReference: coupon ? Number(coupon.discountAmountUsdReference || 0) : null,
        couponBenefitDurationType: coupon ? coupon.benefitDurationType || "forever" : null,
        couponBenefitDurationValue: coupon ? coupon.benefitDurationValue ?? null : null,
      });
    }

    const preference = await createMercadoPagoSystemPreference({
      payload: {
        items: [
          {
            id: `${plan}-monthly`,
            title: `Suscripción BarberApp ${plan === "basic" ? "Básico" : "Pro"}`,
            description: `Plan mensual BarberApp ${plan === "basic" ? "Básico" : "Pro"}`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: amount,
          },
        ],
        payer: {
          email: userDoc.email,
          name: userDoc.fullName,
        },
        external_reference: externalReference,
        notification_url: `${buildMercadoPagoSubscriptionWebhookUrl()}?userId=${userDoc._id.toString()}`,
        back_urls: buildMercadoPagoSubscriptionReturnUrls(),
        auto_return: "approved",
        metadata: {
          user_id: userDoc._id.toString(),
          plan,
          billing_cycle: "monthly",
          subscription_type: "barberapp_plan",
        },
      },
    });

    userDoc.subscription = {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      pendingPlan: plan,
      billingCycle: userDoc.subscription?.billingCycle || "monthly",
      provider: "mercadopago",
      additionalBusinesses: effectiveExtra,
      pendingBusinessNames: businessNames,
      mercadoPagoPreferenceId: preference.id || null,
      pendingCouponCode: coupon ? coupon.code : null,
      pendingCouponDiscountType: coupon ? coupon.discountType || "percentage" : null,
      pendingCouponDiscountPercent: coupon ? Number(coupon.discountPercent || 0) : null,
      pendingCouponDiscountAmountUsdReference: coupon ? Number(coupon.discountAmountUsdReference || 0) : null,
      pendingCouponBenefitDurationType: coupon ? coupon.benefitDurationType || "forever" : null,
      pendingCouponBenefitDurationValue: coupon ? coupon.benefitDurationValue ?? null : null,
    };
    await userDoc.save();

    return res.json({
      checkoutUrl: preference.init_point || null,
      sandboxCheckoutUrl: preference.sandbox_init_point || null,
      preferenceId: preference.id || null,
      amount,
      currencyId: "ARS",
      discountApplied: resolvedPricing.discountApplied,
      baseAmount: resolvedPricing.baseArs,
      couponApplied: coupon ? coupon.code : null,
      couponDiscountType: coupon ? coupon.discountType || "percentage" : null,
      couponDiscountAmountUsdReference: coupon ? Number(coupon.discountAmountUsdReference || 0) : null,
      couponBenefitDurationType: coupon ? coupon.benefitDurationType || "forever" : null,
      couponBenefitDurationValue: coupon ? coupon.benefitDurationValue ?? null : null,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Cotización del total real del plan SIN crear pago. Sirve para mostrar en la
 * web el monto que se va a cobrar (incluido el recargo por locales/negocios
 * adicionales y el cupón, si corresponde). El cobro real SIEMPRE recalcula el
 * monto en el server; este endpoint es solo informativo.
 */
export async function publicGetSubscriptionQuote(req, res, next) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const plan = normalizePublicPlan(req.body?.plan);
    const couponCode = String(req.body?.couponCode || "").trim();
    const overrideExtra = parseRequestedAdditionalBusinesses(req.body?.additionalBusinesses);

    if (!plan) {
      return res.status(400).json({ error: "Plan inválido para cotizar." });
    }

    const pricingDoc = await getOrCreatePlanPricing();
    const pricing = serializePlanPricing(pricingDoc);
    const baseArs = Number(pricing?.[plan]?.ars || 0);

    // Si no hay cuenta todavía, igual cotizamos el recargo con la cantidad
    // pedida en el front para mostrar el total correcto en el checkout.
    const fallbackAddon = resolveAdditionalBusinessesArs({
      plan,
      pricing,
      subscription: { additionalBusinesses: overrideExtra ?? 0 },
    });
    const fallback = {
      amount: Number((baseArs + Number(fallbackAddon.ars || 0)).toFixed(2)),
      planAmount: baseArs,
      baseAmount: baseArs,
      additionalBusinessesCount: fallbackAddon.count,
      additionalBusinessesArs: fallbackAddon.ars,
      additionalBusinessesUsdReference: fallbackAddon.usdReference,
      couponApplied: null,
      discountApplied: false,
    };

    if (!email) {
      return res.json(fallback);
    }

    const userDoc = await UserModel.findOne({ email, isActive: true });
    if (!userDoc) {
      return res.json(fallback);
    }

    let coupon = null;
    if (couponCode) {
      try {
        coupon = await findValidSubscriptionCoupon({ couponCode, plan });
      } catch (_couponError) {
        coupon = null;
      }
    }

    const resolvedPricing = resolvePlanPricingForSubscription({
      plan,
      pricing,
      subscription: userDoc.subscription,
      couponDiscountType: String(coupon?.discountType || "percentage").trim() || "percentage",
      couponDiscountPercent: Number(coupon?.discountPercent || 0),
      couponDiscountAmountUsdReference: Number(coupon?.discountAmountUsdReference || 0),
    });
    const addon = resolveAdditionalBusinessesArs({
      plan,
      pricing,
      subscription: {
        additionalBusinesses:
          overrideExtra ?? Number(userDoc.subscription?.additionalBusinesses || 0),
      },
    });
    const planAmount = Number(resolvedPricing.effectiveArs || 0);
    const amount = Number((planAmount + Number(addon.ars || 0)).toFixed(2));

    return res.json({
      amount,
      planAmount,
      baseAmount: Number(resolvedPricing.baseArs || baseArs),
      additionalBusinessesCount: addon.count,
      additionalBusinessesArs: addon.ars,
      additionalBusinessesUsdReference: addon.usdReference,
      couponApplied: coupon ? coupon.code : null,
      discountApplied: Boolean(resolvedPricing.discountApplied),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Cobro de plan con TARJETA embebida (Mercado Pago Bricks): el cliente carga
 * la tarjeta en la propia página, sin redirigir a Mercado Pago ni necesitar
 * cuenta de MP. Es ADICIONAL al checkout por redirect (Checkout Pro), que
 * sigue disponible como fallback.
 *
 * El monto se RECALCULA siempre en el server (nunca se confía en el front) y,
 * si MP aprueba el pago en el acto, se hace ACTIVACIÓN SINCRÓNICA reutilizando
 * activateSubscriptionFromApprovedPayment. El webhook queda de respaldo
 * (idempotente por paymentId).
 */
export async function publicCreateSubscriptionPayment(req, res, next) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const plan = normalizePublicPlan(req.body?.plan);
    const couponCode = String(req.body?.couponCode || "").trim();
    const payment =
      req.body?.payment && typeof req.body.payment === "object" ? req.body.payment : {};

    const token = String(payment.token || "").trim();
    const paymentMethodId = String(payment.payment_method_id || "").trim();
    const installments = Math.max(1, Math.trunc(Number(payment.installments) || 1));
    const issuerId =
      payment.issuer_id != null && String(payment.issuer_id).trim() !== ""
        ? String(payment.issuer_id).trim()
        : null;
    const payerIdentification =
      payment.payer && typeof payment.payer === "object"
        ? payment.payer.identification
        : null;
    const requestedExtra = parseRequestedAdditionalBusinesses(req.body?.additionalBusinesses);
    const businessNames = parseBusinessNames(req.body?.businessNames);

    if (!email || !plan) {
      return res.status(400).json({
        error: "Necesitamos el email de la cuenta y un plan válido para generar el pago.",
      });
    }

    if (!token || !paymentMethodId) {
      return res.status(400).json({
        error: "No recibimos los datos de la tarjeta. Volvé a intentar el pago.",
      });
    }

    const userDoc = await UserModel.findOne({ email, isActive: true });
    if (!userDoc) {
      return res.status(404).json({
        error: "No encontramos una cuenta activa con ese email.",
      });
    }

    const channelConflict = ensureWebSubscriptionCheckoutAllowed(userDoc);
    if (channelConflict) {
      return res.status(channelConflict.status).json(channelConflict.body);
    }

    const pricingDoc = await getOrCreatePlanPricing();
    const pricing = serializePlanPricing(pricingDoc);
    const coupon = couponCode
      ? await findValidSubscriptionCoupon({ couponCode, plan })
      : null;
    const resolvedPricing = resolvePlanPricingForSubscription({
      plan,
      pricing,
      subscription: userDoc.subscription,
      couponDiscountType: String(coupon?.discountType || "percentage").trim() || "percentage",
      couponDiscountPercent: Number(coupon?.discountPercent || 0),
      couponDiscountAmountUsdReference: Number(coupon?.discountAmountUsdReference || 0),
    });
    const effectiveExtra =
      requestedExtra ?? Number(userDoc.subscription?.additionalBusinesses || 0);
    const additionalBusinessesPricing = resolveAdditionalBusinessesArs({
      plan,
      pricing,
      subscription: { additionalBusinesses: effectiveExtra },
    });
    const amount = Number(
      (Number(resolvedPricing.effectiveArs || 0) +
        Number(additionalBusinessesPricing.ars || 0)).toFixed(2),
    );

    const canActivateForFree =
      Boolean(coupon) &&
      resolvedPricing.discountApplied &&
      !(amount > 0) &&
      Number(resolvedPricing.baseArs || 0) > 0;

    if (!(amount > 0) && canActivateForFree) {
      const activation = await activateFreeSubscriptionCoupon({
        userDoc,
        plan,
        coupon,
        pricing,
        provider: "mercadopago",
      });

      return res.json({
        activatedDirectly: true,
        activationReason: "free_coupon",
        amount: 0,
        currencyId: "ARS",
        discountApplied: true,
        baseAmount: resolvedPricing.baseArs,
        couponApplied: coupon.code,
        couponBenefitDurationType: coupon.benefitDurationType || "forever",
        couponBenefitDurationValue: coupon.benefitDurationValue ?? null,
        renewalMode: "manual",
        startedAt: activation.activatedAt,
        expiresAt: activation.expiresAt,
        message:
          "El cupón dejó el plan bonificado y activamos la cuenta sin pasar por Mercado Pago.",
      });
    }

    if (!(amount > 0)) {
      return res.status(400).json({
        error: "El plan no tiene un precio configurado.",
      });
    }

    const externalReference = `subscription:${userDoc._id.toString()}:${plan}:${Date.now()}`;

    userDoc.subscription = {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      pendingPlan: plan,
      billingCycle: userDoc.subscription?.billingCycle || "monthly",
      provider: "mercadopago",
      additionalBusinesses: effectiveExtra,
      pendingBusinessNames: businessNames,
      pendingCouponCode: coupon ? coupon.code : null,
      pendingCouponDiscountType: coupon ? coupon.discountType || "percentage" : null,
      pendingCouponDiscountPercent: coupon ? Number(coupon.discountPercent || 0) : null,
      pendingCouponDiscountAmountUsdReference: coupon
        ? Number(coupon.discountAmountUsdReference || 0)
        : null,
      pendingCouponBenefitDurationType: coupon ? coupon.benefitDurationType || "forever" : null,
      pendingCouponBenefitDurationValue: coupon ? coupon.benefitDurationValue ?? null : null,
    };
    await userDoc.save();

    const paymentPayload = {
      transaction_amount: amount,
      token,
      description: `Plan mensual ShiftHub ${plan === "basic" ? "Básico" : "Pro"}`,
      installments,
      payment_method_id: paymentMethodId,
      external_reference: externalReference,
      notification_url: `${buildMercadoPagoSubscriptionWebhookUrl()}?userId=${userDoc._id.toString()}`,
      metadata: {
        user_id: userDoc._id.toString(),
        plan,
        billing_cycle: "monthly",
        subscription_type: "barberapp_plan",
      },
      payer: {
        email: userDoc.email,
      },
    };

    if (issuerId) {
      paymentPayload.issuer_id = issuerId;
    }

    if (
      payerIdentification &&
      typeof payerIdentification === "object" &&
      payerIdentification.type &&
      payerIdentification.number
    ) {
      paymentPayload.payer.identification = {
        type: String(payerIdentification.type).trim(),
        number: String(payerIdentification.number).trim(),
      };
    }

    let mpPayment;
    try {
      mpPayment = await createMercadoPagoSystemPayment({
        payload: paymentPayload,
        idempotencyKey: externalReference,
      });
    } catch (mpError) {
      return res.status(402).json({
        status: "rejected",
        error: mpError?.message || "Mercado Pago no pudo procesar el pago.",
      });
    }

    const status = String(mpPayment?.status || "").trim();
    const currentPaymentId = mpPayment?.id ? String(mpPayment.id) : null;

    if (status === "approved") {
      // Activación sincrónica: activamos la cuenta en el acto, sin depender
      // del webhook. El webhook queda de respaldo (idempotente por paymentId).
      try {
        const { isNew, paidAmount } = await activateSubscriptionFromApprovedPayment({
          userDoc,
          plan,
          payment: mpPayment,
        });

        if (isNew) {
          try {
            await notifySubscriptionActivated({
              userDoc,
              plan,
              amountArs: paidAmount || amount,
              expiresAt: userDoc.subscription?.expiresAt,
              renewalMode: userDoc.subscription?.renewalMode || "manual",
            });
          } catch (notifyError) {
            console.error(
              "Error notificando activación sincrónica del plan:",
              notifyError?.message || notifyError,
            );
          }
        }
      } catch (activationError) {
        // No rompemos la respuesta del pago: el webhook reintenta la activación.
        console.error(
          "Error en activación sincrónica (el webhook lo reintentará):",
          activationError?.message || activationError,
        );
      }
    } else if (currentPaymentId) {
      // Pago en revisión o rechazado: solo registramos el id, sin activar.
      userDoc.subscription = {
        ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
        mercadoPagoPaymentId: currentPaymentId,
      };
      await userDoc.save();
    }

    return res.json({
      paymentId: currentPaymentId,
      status,
      statusDetail: mpPayment?.status_detail || null,
      amount,
      currencyId: "ARS",
      discountApplied: resolvedPricing.discountApplied,
      baseAmount: resolvedPricing.baseArs,
      couponApplied: coupon ? coupon.code : null,
    });
  } catch (err) {
    return next(err);
  }
}

export async function publicCreateRecurringSubscriptionCheckout(req, res, next) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const plan = normalizePublicPlan(req.body?.plan);
    const couponCode = String(req.body?.couponCode || "").trim();

    if (!email || !plan) {
      return res.status(400).json({
        error: "Necesitamos el email de la cuenta y un plan válido para activar la renovación automática.",
      });
    }

    const userDoc = await UserModel.findOne({ email, isActive: true });
    if (!userDoc) {
      return res.status(404).json({
        error: "No encontramos una cuenta activa con ese email.",
      });
    }

    const channelConflict = ensureWebSubscriptionCheckoutAllowed(userDoc);
    if (channelConflict) {
      return res.status(channelConflict.status).json(channelConflict.body);
    }

    const pricingDoc = await getOrCreatePlanPricing();
    const pricing = serializePlanPricing(pricingDoc);
    const coupon = couponCode
      ? await findValidSubscriptionCoupon({ couponCode, plan })
      : null;
    const resolvedPricing = resolvePlanPricingForSubscription({
      plan,
      pricing,
      subscription: userDoc.subscription,
      couponDiscountType: String(coupon?.discountType || "percentage").trim() || "percentage",
      couponDiscountPercent: Number(coupon?.discountPercent || 0),
      couponDiscountAmountUsdReference: Number(coupon?.discountAmountUsdReference || 0),
    });
    const additionalBusinessesPricing = resolveAdditionalBusinessesArs({
      plan,
      pricing,
      subscription: userDoc.subscription,
    });
    const amount = Number(
      (Number(resolvedPricing.effectiveArs || 0) +
        Number(additionalBusinessesPricing.ars || 0)).toFixed(2),
    );

    const canActivateForFree =
      Boolean(coupon) &&
      resolvedPricing.discountApplied &&
      !(amount > 0) &&
      Number(resolvedPricing.baseArs || 0) > 0;

    if (!(amount > 0) && canActivateForFree) {
      const activation = await activateFreeSubscriptionCoupon({
        userDoc,
        plan,
        coupon,
        pricing,
        provider: "mercadopago",
      });

      return res.json({
        activatedDirectly: true,
        activationReason: "free_coupon",
        amount: 0,
        currencyId: "ARS",
        discountApplied: true,
        baseAmount: resolvedPricing.baseArs,
        couponApplied: coupon.code,
        couponBenefitDurationType: coupon.benefitDurationType || "forever",
        couponBenefitDurationValue: coupon.benefitDurationValue ?? null,
        renewalMode: "manual",
        startedAt: activation.activatedAt,
        expiresAt: activation.expiresAt,
        message:
          "El cupón dejó el plan bonificado y activamos la cuenta sin pasar por Mercado Pago. La renovación automática no se configuró en este paso.",
      });
    }

    if (!(amount > 0)) {
      return res.status(400).json({
        error: "El plan no tiene un precio configurado.",
      });
    }

    const externalReference = `subscription:${userDoc._id.toString()}:${plan}:${Date.now()}`;
    const preapproval = await createMercadoPagoSystemPreapproval({
      payload: {
        reason: `Suscripción BarberApp ${plan === "basic" ? "Básico" : "Pro"}`,
        external_reference: externalReference,
        payer_email: userDoc.email,
        back_url: buildMercadoPagoSubscriptionReturnUrls().success,
        status: "pending",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: amount,
          currency_id: "ARS",
          start_date: new Date().toISOString(),
        },
        notification_url: `${buildMercadoPagoSubscriptionWebhookUrl()}?userId=${userDoc._id.toString()}`,
      },
    });

    userDoc.subscription = {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      pendingPlan: plan,
      billingCycle: "monthly",
      renewalMode: "automatic",
      mercadoPagoPreapprovalId: preapproval.id || null,
      mercadoPagoPreapprovalStatus: preapproval.status || "pending",
      mercadoPagoPreapprovalAmountArs: amount,
      pendingCouponCode: coupon ? coupon.code : null,
      pendingCouponDiscountType: coupon ? coupon.discountType || "percentage" : null,
      pendingCouponDiscountPercent: coupon ? Number(coupon.discountPercent || 0) : null,
      pendingCouponDiscountAmountUsdReference: coupon ? Number(coupon.discountAmountUsdReference || 0) : null,
      pendingCouponBenefitDurationType: coupon ? coupon.benefitDurationType || "forever" : null,
      pendingCouponBenefitDurationValue: coupon ? coupon.benefitDurationValue ?? null : null,
    };
    await userDoc.save();

    return res.json({
      checkoutUrl: preapproval.init_point || null,
      sandboxCheckoutUrl: preapproval.sandbox_init_point || null,
      preapprovalId: preapproval.id || null,
      amount,
      currencyId: "ARS",
      discountApplied: resolvedPricing.discountApplied,
      baseAmount: resolvedPricing.baseArs,
      couponApplied: coupon ? coupon.code : null,
      couponDiscountType: coupon ? coupon.discountType || "percentage" : null,
      couponDiscountAmountUsdReference: coupon ? Number(coupon.discountAmountUsdReference || 0) : null,
      couponBenefitDurationType: coupon ? coupon.benefitDurationType || "forever" : null,
      couponBenefitDurationValue: coupon ? coupon.benefitDurationValue ?? null : null,
      renewalMode: "automatic",
    });
  } catch (err) {
    return next(err);
  }
}

export async function publicListBarbers(req, res, next) {
  try {
    const shop = await findActiveShop(req.params.shopSlug);
    if (!shop) return res.status(404).json({ error: "Barbería no encontrada" });
    const ownerId = toObjectId(shop._id);

    const barbers = await BarberModel.find({ owner: ownerId, isActive: true })
      .select({
        fullName: 1,
        photoUrl: 1,
        serviceIds: 1,
        shift: 1,
        scheduleRange: 1,
        scheduleRanges: 1,
        dayScheduleOverrides: 1,
        barberClosedDays: 1,
        bookingBufferMinutes: 1,
        bookingSlotIntervalMinutes: 1,
        barberTimeBlocks: 1,
        workDays: 1,
      })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      shop: sanitizeShopSummary(shop),
      barbers: barbers.map(sanitizeBarber),
    });
  } catch (err) {
    return next(err);
  }
}

export async function publicListServices(req, res, next) {
  try {
    const shop = await findActiveShop(req.params.shopSlug);
    if (!shop) return res.status(404).json({ error: "Barbería no encontrada" });
    const ownerId = toObjectId(shop._id);
    const services = await ServiceModel.find({ owner: ownerId, isActive: true })
      .select({ name: 1, durationMinutes: 1, price: 1, sortOrder: 1 })
      .sort({ sortOrder: 1, name: 1, _id: 1 })
      .lean();
    return res.json({
      shop: sanitizeShopSummary(shop),
      services: services.map(sanitizeService),
    });
  } catch (err) {
    return next(err);
  }
}

export async function publicValidateBookingCoupon(req, res, next) {
  try {
    const shop = await findActiveShop(req.params.shopSlug);
    if (!shop) return res.status(404).json({ error: "Negocio no encontrado" });

    const coupon = findActiveBookingCoupon(shop, req.body?.code);
    if (!coupon) {
      return res.status(404).json({ error: "Cupón inválido o vencido." });
    }

    const serviceIds = Array.isArray(req.body?.serviceIds)
      ? [
          ...new Set(
            req.body.serviceIds
              .map((id) => String(id || "").trim())
              .filter(Boolean),
          ),
        ]
      : [];
    if (!serviceIds.length) {
      return res
        .status(400)
        .json({ error: "Seleccioná un servicio para aplicar el cupón." });
    }

    const invalidId = serviceIds.find(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );
    if (invalidId) {
      return res.status(400).json({ error: "Servicio inválido." });
    }

    const ownerId = toObjectId(shop._id);
    const services = await ServiceModel.find({
      _id: { $in: serviceIds.map((id) => toObjectId(id)) },
      owner: ownerId,
      isActive: true,
    })
      .select({ _id: 1, name: 1, price: 1 })
      .lean();

    if (services.length !== serviceIds.length) {
      return res
        .status(400)
        .json({ error: "Algún servicio seleccionado ya no está disponible." });
    }

    const byId = new Map(services.map((service) => [String(service._id), service]));
    const orderedServices = serviceIds.map((id) => byId.get(id)).filter(Boolean);
    const quote = buildCouponQuote(coupon, orderedServices);
    if (!quote) {
      return res.status(400).json({
        error: "Este cupón no aplica a los servicios seleccionados.",
      });
    }

    return res.json({ coupon: quote });
  } catch (err) {
    return next(err);
  }
}

export async function publicBarberAppointments(req, res, next) {
  try {
    const { barberId, shopSlug } = req.params;
    const { date } = req.query;
    const effectiveDate =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : undefined;
    const { startOfDay, endOfDay } = buildDayRange(req.query.date);
    const shop = await findActiveShop(shopSlug);
    if (!shop) return res.status(404).json({ error: "Barbería no encontrada" });
    const ownerId = toObjectId(shop._id);
    const barber = await BarberModel.findOne({
      _id: barberId,
      owner: ownerId,
      isActive: true,
    })
      .select({
        fullName: 1,
        photoUrl: 1,
        serviceIds: 1,
        shift: 1,
        scheduleRange: 1,
        scheduleRanges: 1,
        dayScheduleOverrides: 1,
        barberClosedDays: 1,
        bookingBufferMinutes: 1,
        bookingSlotIntervalMinutes: 1,
        barberTimeBlocks: 1,
        workDays: 1,
      })
      .lean();
    if (!barber)
      return res.status(404).json({ error: "Barbero no encontrado" });
    const shopClosure = resolveShopClosureForDate(
      shop,
      effectiveDate || req.query.date || new Date(),
    );
    const barberClosure = resolveBarberClosureForDate(
      barber,
      effectiveDate || req.query.date || new Date(),
    );
    const appointments = await AppointmentModel.find({
      owner: ownerId,
      barber: barberId,
      status: { $in: ["pending", "completed"] },
      startTime: { $gte: startOfDay, $lte: endOfDay },
    })
      .select({ startTime: 1, durationMinutes: 1, bufferAfterMinutesApplied: 1, status: 1 })
      .sort({ startTime: 1 })
      .lean();
    const weekday = getTimeZoneWeekday(
      effectiveDate ? `${effectiveDate}T12:00:00` : new Date(),
    );
    const resolvedSchedule = resolveBarberScheduleForWeekday(
      barber,
      weekday,
      effectiveDate,
    );
    const barberTimeBlocks = resolveBarberTimeBlocksForDate(
      barber,
      effectiveDate || req.query.date || new Date(),
    );
    return res.json({
      shop: sanitizeShopSummary(shop),
      barber: sanitizeBarber(barber),
      resolvedSchedule: shopClosure || barberClosure
        ? { scheduleRange: null, scheduleRanges: [] }
        : resolvedSchedule,
      shopClosure: serializeShopClosure(shopClosure),
      barberClosure: serializeBarberClosure(barberClosure),
      barberTimeBlocks: serializeBarberTimeBlocks(barberTimeBlocks),
      appointments: appointments.map(sanitizeAppointment),
    });
  } catch (err) {
    return next(err);
  }
}

export async function publicCreateAppointment(req, res, next) {
  try {
    const { shopSlug } = req.params;
    const shop = await findActiveShop(shopSlug);
    if (!shop) return res.status(404).json({ error: "Barbería no encontrada" });

    // 1. AGREGAR 'email' AQUÍ (que viene del body)
    const {
      barberId,
      customerName,
      service,
      startTime,
      durationMinutes,
      serviceItems,
      notes,
      email,
      paymentMethod,
      servicePrice,
      couponCode,
    } = req.body;

    if (!barberId)
      return res.status(400).json({ error: "Debes seleccionar un barbero." });

    const ownerId = toObjectId(shop._id);
    const barber = await BarberModel.findOne({
      _id: barberId,
      owner: ownerId,
      isActive: true,
    })
      .select({
        fullName: 1,
        email: 1,
        phone: 1,
        serviceIds: 1,
        shift: 1,
        scheduleRange: 1,
        scheduleRanges: 1,
        dayScheduleOverrides: 1,
        barberClosedDays: 1,
        bookingBufferMinutes: 1,
        bookingSlotIntervalMinutes: 1,
        barberTimeBlocks: 1,
        workDays: 1,
      })
      .lean();
    if (!barber)
      return res.status(404).json({ error: "Barbero no encontrado" });
    const appointmentDate = new Date(startTime);
    const resolvedServices = await resolveAppointmentServices({
      ownerId,
      service,
      servicePrice,
      durationMinutes,
      serviceItems,
      couponCode,
      shop,
    });
    const normalizedDuration = Number(resolvedServices.totalDuration) || 30;
    const serviceLabel = resolvedServices.serviceLabel;
    const resolvedServicePrice = Number(resolvedServices.totalPrice || 0);
    const resolvedOriginalPrice = Number(
      resolvedServices.totalOriginalPrice ?? resolvedServices.totalPrice ?? 0,
    );
    const appliedCouponQuote = resolvedServices.couponQuote || null;
    const selectedServiceIds = resolvedServices.items
      .map((item) => String(item.serviceId || ""))
      .filter(Boolean);

    if (
      selectedServiceIds.length &&
      !barberSupportsServiceIds(barber, selectedServiceIds)
    ) {
      return res.status(400).json({
        error: "El profesional seleccionado no realiza uno de los servicios elegidos.",
      });
    }

    const shopClosure = resolveShopClosureForDate(shop, appointmentDate);
    if (shopClosure) {
      return res.status(400).json({
        error: shopClosure.message,
        closedDay: serializeShopClosure(shopClosure),
      });
    }
    const barberClosure = resolveBarberClosureForDate(barber, appointmentDate);
    if (barberClosure) {
      return res.status(400).json({
        error: barberClosure.message,
        closedDay: serializeBarberClosure(barberClosure),
      });
    }
    const barberWorkDays = (barber.workDays || []).map(Number);

    if (barberWorkDays.length > 0 && !barberWorkDays.includes(getTimeZoneWeekday(appointmentDate))) {
      return res.status(400).json({ error: "El barbero no trabaja este día." });
    }

    // --- VALIDACIÓN DE SOLAPAMIENTO (mismo criterio que la app) ---
    const bufferAfterMinutes = Math.max(
      0,
      Number(barber?.bookingBufferMinutes || 0),
    );
    const endTime = new Date(appointmentDate.getTime() + normalizedDuration * 60000);
    const occupiedEndTime = getAppointmentOccupiedEnd(
      appointmentDate,
      normalizedDuration,
      bufferAfterMinutes,
    );
    const barberTimeBlocks = resolveBarberTimeBlocksForDate(barber, appointmentDate);
    const startTimeLabel = getTimeZoneLabel(appointmentDate).time;
    const [startHour, startMinute] = startTimeLabel.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const occupiedEndMinutes =
      startMinutes + Number(normalizedDuration || 0) + bufferAfterMinutes;
    const resolvedSchedule = resolveBarberScheduleForWeekday(
      barber,
      getTimeZoneWeekday(appointmentDate),
      getTimeZoneLabel(appointmentDate).date,
    );

    if (!doesRangeFitSchedule(resolvedSchedule, startMinutes, occupiedEndMinutes)) {
      return res.status(400).json({
        error: "El horario seleccionado queda fuera del horario laboral del profesional.",
      });
    }

    const overlappingBlock = barberTimeBlocks.find((block) =>
      doesTimeBlockOverlapRange(block, startMinutes, occupiedEndMinutes),
    );
    if (overlappingBlock) {
      return res.status(400).json({
        error: overlappingBlock.message,
        blockedTime: overlappingBlock,
      });
    }

    const overlappingCandidates = await AppointmentModel.find({
      owner: ownerId,
      barber: barberId,
      status: { $in: ["pending", "completed"] },
      startTime: { $lt: occupiedEndTime },
    })
      .select({ startTime: 1, durationMinutes: 1, bufferAfterMinutesApplied: 1 })
      .lean();

    const overlaps = overlappingCandidates.some((existing) => {
      const existingStart = new Date(existing.startTime);
      const existingEnd = getAppointmentOccupiedEnd(
        existingStart,
        existing.durationMinutes || 30,
        existing.bufferAfterMinutesApplied || 0,
      );
      return existingEnd > appointmentDate;
    });
    if (overlaps) {
      return res.status(409).json({ error: "El horario ya está ocupado" });
    }

    let normalizedPaymentMethod;
    try {
      normalizedPaymentMethod = validatePublicPaymentSelection(shop, paymentMethod);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }
    // Guardamos en la base de datos
    const appointment = await AppointmentModel.create({
      owner: ownerId,
      barber: barberId,
      customerName: customerName.trim(),
      customerEmail: email ? String(email).trim().toLowerCase() : null,
      service: serviceLabel,
      serviceItems: resolvedServices.items,
      startTime: appointmentDate,
      durationMinutes: normalizedDuration,
      bufferAfterMinutesApplied: bufferAfterMinutes,
      servicePrice: resolvedServicePrice,
      originalServicePrice: resolvedOriginalPrice,
      couponCode: appliedCouponQuote?.code || null,
      couponName: appliedCouponQuote?.name || null,
      couponDiscountAmount: appliedCouponQuote?.totalDiscount || 0,
      amountTotal: resolvedServicePrice,
      amountPaid: 0,
      amountPending: resolvedServicePrice,
      notes,
      paymentMethod: normalizedPaymentMethod,
      paymentMethodCollected: null,
      paymentStatus: "unpaid",
      paymentDeadlineAt:
        normalizedPaymentMethod === "transfer"
          ? new Date(Date.now() + 15 * 60 * 1000)
          : null,
      status: normalizedPaymentMethod === "transfer" ? "awaiting_payment" : "pending",
      // Si querés guardar el email en la DB, podés agregarlo al modelo y ponerlo acá
    });

    // --- LÓGICA DE NOTIFICACIÓN PUSH AL BARBERO (YA LA TENÍAS) ---
    try {
      const [ownerUser, ownerPushTarget, barberPushTarget] = await Promise.all([
        UserModel.findById(ownerId)
          .select({ notificationSettings: 1 })
          .lean(),
        resolveOwnerPushTarget({ ownerId }),
        resolveAssignedBarberPushTarget({
          ownerId,
          barberId,
        }),
      ]);
      const ownerToken =
        ownerUser?.notificationSettings?.adminInstantBookingEnabled !== false
          ? String(ownerPushTarget?.token || "").trim()
          : "";
      const barberToken =
        ownerUser?.notificationSettings?.barberInstantBookingEnabled !== false
          ? String(barberPushTarget?.token || "").trim()
          : "";
      const targetTokens = Array.from(new Set([ownerToken, barberToken].filter(Boolean)));

      if (targetTokens.length && admin.apps.length) {
        const timeLabel = appointmentDate.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "America/Argentina/Cordoba",
        });
        const dateLabel = appointmentDate.toLocaleDateString("es-AR", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          timeZone: "America/Argentina/Cordoba",
        });
        const payload = {
          notification: {
            title:
              normalizedPaymentMethod === "transfer"
                ? "💈Pago online iniciado"
                : "💈¡Nuevo Turno (Web)!",
            body:
              normalizedPaymentMethod === "transfer"
                ? `${customerName} inició ${serviceLabel} con ${barber.fullName} el ${dateLabel} a las ${timeLabel} desde la web. Esperando pago.`
                : `${customerName} reservó ${serviceLabel} con ${barber.fullName} el ${dateLabel} a las ${timeLabel} desde la web.`,
          },
          data: {
            type: "appointment_created",
            source: "web",
            appointmentId: appointment._id.toString(),
            barberId: String(barberId),
            ownerId: String(ownerId),
          },
          android: {
            priority: "high",
            notification: { sound: "default" },
          },
          apns: {
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert",
            },
            payload: {
              aps: {
                sound: "default",
                badge: 1,
                alert: {
                  title:
                    normalizedPaymentMethod === "transfer"
                      ? "Pago online iniciado"
                      : "Nuevo Turno (Web)",
                  body:
                    normalizedPaymentMethod === "transfer"
                      ? `${customerName} inició ${serviceLabel} con ${barber.fullName} el ${dateLabel} a las ${timeLabel} desde la web. Esperando pago.`
                      : `${customerName} reservó ${serviceLabel} con ${barber.fullName} el ${dateLabel} a las ${timeLabel} desde la web.`,
                },
              },
            },
          },
        };
        const responses = await Promise.allSettled(
          targetTokens.map((token) =>
            admin.messaging().send({ ...payload, token }).then((messageId) => ({
              token,
              messageId,
            })),
          ),
        );
        const sent = responses.filter((item) => item.status === "fulfilled").length;
        const failed = responses.filter((item) => item.status === "rejected");
        if (sent) {
          console.log("Push público OK:", { sent, total: targetTokens.length });
        }
        if (failed.length) {
          console.warn(
            "Push público con errores:",
            failed.map((item) => ({
              code: item.reason?.code || item.reason?.errorInfo?.code,
              message: item.reason?.message,
            })),
          );
          const invalidTokens = responses
            .map((item, index) => ({ item, token: targetTokens[index] }))
            .filter(({ item }) => item.status === "rejected" && isInvalidPushTokenError(item.reason))
            .map(({ token }) => token);
          if (invalidTokens.length) {
            await UserModel.updateMany(
              { pushToken: { $in: invalidTokens } },
              { $unset: { pushToken: "" } },
            );
          }
        }
      } else if (targetTokens.length && !admin.apps.length) {
        console.warn("Firebase no está inicializado; no se enviaron push de turno web.");
      } else {
        console.warn("No hay pushToken guardado para avisar el turno web.", {
          ownerId: String(ownerId),
          barberId: String(barberId),
        });
      }
    } catch (pushErr) {
      logPushError("⚠️ Error enviando push:", pushErr);
    }

    let mercadoPagoCheckout = null;
    if (normalizedPaymentMethod === "transfer") {
      try {
        mercadoPagoCheckout = await createAppointmentMercadoPagoPreference({
          appointmentId: appointment._id.toString(),
          ownerId,
        });
      } catch (mpError) {
        await AppointmentModel.findByIdAndDelete(appointment._id);
        return res.status(mpError?.statusCode || 400).json({
          error: mpError.message || "No pudimos iniciar el pago con Mercado Pago.",
        });
      }
    }

    if (email && normalizedPaymentMethod === "cash") {
      const shopName = shop.fullName || "Tu Barbería";
      const timeZone = "America/Argentina/Cordoba";
      const dateLabel = appointmentDate.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone,
      });
      const timeLabel = appointmentDate.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone,
      });


      const mailHtml = `
    <div style="background-color: #121212; color: #ffffff; padding: 30px; font-family: sans-serif; border-radius: 15px; max-width: 500px; margin: auto; border: 1px solid #B89016;">
      
      <div style="text-align: center; margin-bottom: 25px;">
         <h2 style="color: #B89016; margin: 0; font-size: 24px; letter-spacing: 1px;">¡RESERVA EXITOSA!</h2>
         <p style="color: #888; font-size: 14px; margin-top: 10px;">Hola <strong>${customerName}</strong>, confirmamos tu cita en <b>${shopName}</b>:</p>
      </div>

     
        <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
          <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Barbero:</strong> 
          <span style="color: #FF1493; font-weight: bold;">${barber.fullName}${barber.phone ? ` · ${barber.phone}` : ''}</span>
        </p>
        <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
          <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Servicio:</strong> 
          <span style="color: #FF1493; font-weight: bold;">${serviceLabel}</span>
        </p>
        <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
          <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Fecha:</strong> 
          <span style="color: #FF1493; font-weight: bold;">${dateLabel}</span>
        </p>
        <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
          <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Hora:</strong> 
          <span style="color: #FF1493; font-weight: bold;">${timeLabel}</span>
        </p>
    

      <div style="text-align: center; margin-top: 16px;">

        ${barber.phone ? `
        <a href="https://wa.me/${barber.phone.replace(/\s+/g, '')}?text=Hola!%20Soy%20${customerName},%20te%20escribo%20por%20mi%20turno%20del%20dia%20${dateLabel}%20a%20las%20${timeLabel}%20para%20CANCELARLO" 
           style="background-color: #FF1493; color: white; padding: 12px 18px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; font-size: 14px; border: 1px solid #ff4d4d; margin-bottom: 8px;">
           CONCELAR TURNO
        </a>
        ` : ''}
      </div>

      <div style="text-align: center; margin-top: 12px;">
        <p style="font-size: 9px; color: #444; letter-spacing: 3px; margin: 0; text-transform: uppercase;">
           POWERED BY CODEX® SYSTEM
        </p>
      </div>
    </div>
  `;

      try {
        await sendAppMail({
          to: email,
          subject: `✅ Turno Confirmado: ${serviceLabel}`,
          html: mailHtml,
        });
        console.log("✅ Email de confirmacion enviado a:", email);
      } catch (mailErr) {
        console.error("Error enviando email de confirmacion:", mailErr.message);
      }
    }

    return res.status(201).json({
      message:
        normalizedPaymentMethod === "transfer"
          ? "Reserva creada. Continuá con el pago para confirmar tu turno."
          : "¡Reserva exitosa!",
      appointment,
      payment: mercadoPagoCheckout
        ? {
            provider: "mercado_pago",
            requiresRedirect: true,
            checkoutUrl: mercadoPagoCheckout.checkoutUrl,
            sandboxCheckoutUrl: mercadoPagoCheckout.sandboxCheckoutUrl,
            preferenceId: mercadoPagoCheckout.preferenceId,
            amountToCharge: mercadoPagoCheckout.amountToCharge,
          }
        : null,
    });
  } catch (err) {
    console.error("❌ Error en publicCreateAppointment:", err);
    return res.status(400).json({ error: err.message });
  }
}
