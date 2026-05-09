import mongoose from "mongoose";
import { AppointmentModel } from "../models/Appointment.js";
import { SubscriptionCouponModel } from "../models/SubscriptionCoupon.js";
import { ServiceModel } from "../models/Services.js";
import { UserModel } from "../models/User.js";
import admin from "../firebase.js";
import { BarberModel } from "../models/Barber.js";
import { sendAppMail } from "../services/mailer.js";
import {
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
  createMercadoPagoSystemPreapproval,
  createMercadoPagoSystemPreference,
} from "../services/mercadoPago.js";
import {
  getOrCreatePlanPricing,
  serializePlanPricing,
} from "../services/planPricingService.js";
import {
  normalizeCouponCode,
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

function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

async function findActiveShop(shopSlug) {
  const normalized = normalizeSlug(shopSlug);
  if (!normalized) return null;
  return UserModel.findOne({ shopSlug: normalized, isActive: true }).lean();
}

// ← Convierte siempre a ObjectId para que Mongoose matchee correctamente
function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

function sanitizeBarber(barber) {
  if (!barber) return null;
  return {
    _id: barber._id.toString(),
    fullName: barber.fullName,
    photoUrl: barber.photoUrl || null,
    shift: barber.shift,
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
  return {
    _id: shop._id.toString(),
    name: shop.fullName,
    slug: shop.shopSlug,
    businessType: normalizeBusinessType(shop.businessType),
    businessTypeLabel: getBusinessTypeLabel(shop.businessType),
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
      mercadoPagoReady: paymentSettings.mercadoPagoConnectionStatus === "connected",
      mercadoPagoConnectionStatus:
        paymentSettings.mercadoPagoConnectionStatus || "disconnected",
    },
    shopClosedDays: normalizeShopClosedDays(shop.shopClosedDays),
  };
}

function sanitizeService(service) {
  if (!service) return null;
  return {
    _id: service._id.toString(),
    name: service.name,
    durationMinutes: service.durationMinutes ?? 30,
    price: service.price ?? 0,
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

async function resolveAppointmentServices({
  ownerId,
  service,
  servicePrice,
  durationMinutes,
  serviceItems,
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

    return {
      serviceLabel: normalizedItems.map((item) => item.name).join(" + "),
      items: normalizedItems,
      totalDuration,
      totalPrice,
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

export async function publicGetPlanPricing(req, res, next) {
  try {
    const pricingDoc = await getOrCreatePlanPricing();
    return res.json({ pricing: serializePlanPricing(pricingDoc) });
  } catch (err) {
    return next(err);
  }
}

export async function publicCreateSubscriptionCheckout(req, res, next) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const plan = normalizePublicPlan(req.body?.plan);
    const couponCode = String(req.body?.couponCode || "").trim();

    if (!email || !plan) {
      return res.status(400).json({
        error: "Necesitamos el email de la cuenta y un plan válido para generar el pago.",
      });
    }

    const userDoc = await UserModel.findOne({ email, isActive: true });
    if (!userDoc) {
      return res.status(404).json({
        error: "No encontramos una cuenta activa con ese email.",
      });
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
    const amount = Number(resolvedPricing.effectiveArs || 0);

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
    const amount = Number(resolvedPricing.effectiveArs || 0);

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
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      shop: sanitizeShop(shop),
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
      .sort({ name: 1 })
      .lean();
    return res.json({
      shop: sanitizeShop(shop),
      services: services.map(sanitizeService),
    });
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
    }).lean();
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
      shop: sanitizeShop(shop),
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
    } = req.body;

    if (!barberId)
      return res.status(400).json({ error: "Debes seleccionar un barbero." });

    const ownerId = toObjectId(shop._id);
    const barber = await BarberModel.findOne({
      _id: barberId,
      owner: ownerId,
      isActive: true,
    }).lean();
    if (!barber)
      return res.status(404).json({ error: "Barbero no encontrado" });
    const appointmentDate = new Date(startTime);
    const resolvedServices = await resolveAppointmentServices({
      ownerId,
      service,
      servicePrice,
      durationMinutes,
      serviceItems,
    });
    const normalizedDuration = Number(resolvedServices.totalDuration) || 30;
    const serviceLabel = resolvedServices.serviceLabel;
    const resolvedServicePrice = Number(resolvedServices.totalPrice || 0);

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
      const targetTokens = Array.from(
        new Set([ownerToken, barberToken].filter(Boolean)),
      );

      if (targetTokens.length) {
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
          android: { priority: "high" },
        };
        const responses = await Promise.all(
          targetTokens.map((token) => admin.messaging().send({ ...payload, token })),
        );
        console.log("Push público OK:", responses);
      }
    } catch (pushErr) {
      console.error("⚠️ Error enviando push:", pushErr.message);
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
