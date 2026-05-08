import crypto from "crypto";
import { AppointmentModel } from "../models/Appointment.js";
import { BarberModel } from "../models/Barber.js";
import { SubscriptionCouponModel } from "../models/SubscriptionCoupon.js";
import { UserModel } from "../models/User.js";
import { sendAppMail } from "../services/mailer.js";
import {
  buildMercadoPagoBookingReturnUrls,
  buildMercadoPagoWebhookUrl,
  createMercadoPagoPreference,
  getMercadoPagoConfig,
  getMercadoPagoPayment,
  getMercadoPagoSystemPreapproval,
  getMercadoPagoSystemPayment,
  refreshMercadoPagoAccessToken,
} from "../services/mercadoPago.js";
import {
  getOrCreatePlanPricing,
  serializePlanPricing,
} from "../services/planPricingService.js";
import { resolvePlanPricingForSubscription } from "../services/subscriptionPricingService.js";
import { notifySubscriptionActivated } from "../services/subscriptionLifecycleService.js";

function normalizePaymentStatus(value) {
  if (value === "approved" || value === "authorized") return "approved";
  if (value === "pending" || value === "in_process") return "pending";
  if (value === "cancelled" || value === "rejected" || value === "charged_back") {
    return "rejected";
  }
  if (value === "refunded") return "refunded";
  return "unknown";
}

function calculateAdvanceAmount({ amountTotal, settings }) {
  const total = Number(amountTotal || 0);
  if (!Number.isFinite(total) || total <= 0) return 0;

  if (settings?.advanceMode === "full") {
    return total;
  }

  if (settings?.advanceType === "fixed") {
    return Math.min(total, Math.max(0, Number(settings?.advanceValue || 0)));
  }

  const percent = Math.max(0, Number(settings?.advanceValue || 0));
  return Math.min(total, Math.round((total * percent) / 100));
}

function buildWebhookManifest({ paymentId, xRequestId, ts }) {
  return `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
}

function buildSubscriptionPaymentReturnHtml({ result }) {
  const config = {
    success: {
      accent: "#34C759",
      title: "Pago recibido",
      message: "Tu pago fue aprobado. En unos segundos tu plan debería quedar activo.",
      helper: "Abrí la app e iniciá sesión con tu cuenta para empezar a usar el panel.",
    },
    pending: {
      accent: "#F5C451",
      title: "Pago pendiente",
      message: "Mercado Pago todavía está procesando el cobro. Volvé a revisar en unos minutos.",
      helper: "Después podés volver a la app e iniciar sesión para revisar el estado de tu plan.",
    },
    failure: {
      accent: "#FF5A5F",
      title: "Pago no completado",
      message: "El cobro no se pudo completar. Podés volver a intentar desde la web de planes.",
      helper: "Si ya tenés cuenta, abrí la app e iniciá sesión para ver el estado comercial.",
    },
  }[result] || {
    accent: "#8E8E98",
    title: "Estado del pago",
    message: "Podés volver a la app y revisar el estado de tu plan.",
    helper: "Entrá con tu cuenta desde la app para empezar a usar el panel cuando esté activa.",
  };

  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${config.title}</title>
    </head>
    <body style="margin:0;background:#0D0D11;color:#fff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
      <div style="max-width:460px;width:100%;background:#17171C;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:28px;text-align:center;">
        <div style="width:64px;height:64px;border-radius:20px;margin:0 auto 18px;background:${config.accent};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;">
          ${result === "success" ? "✓" : result === "pending" ? "…" : "!"}
        </div>
        <h1 style="margin:0 0 12px;font-size:24px;">${config.title}</h1>
        <p style="margin:0 0 18px;color:#B7BECC;line-height:1.5;">${config.message}</p>
        <p style="margin:0 0 18px;color:#7C8596;font-size:13px;line-height:1.5;">${config.helper}</p>
        <a href="https://barberappbycodex.com/planes" style="display:inline-block;background:${config.accent};color:#111;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800;">
          Volver al sitio de planes
        </a>
      </div>
    </body>
  </html>`;
}

function buildPaymentApprovedMailHtml({
  customerName,
  shopName,
  barberName,
  barberPhone,
  service,
  appointmentDate,
}) {
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
  const cancelPhone = String(barberPhone || "").replace(/\s+/g, "");

  return `
    <div style="background-color: #121212; color: #ffffff; padding: 30px; font-family: sans-serif; border-radius: 15px; max-width: 500px; margin: auto; border: 1px solid #B89016;">
      <div style="text-align: center; margin-bottom: 25px;">
        <h2 style="color: #B89016; margin: 0; font-size: 24px; letter-spacing: 1px;">¡PAGO APROBADO!</h2>
        <p style="color: #888; font-size: 14px; margin-top: 10px;">Hola <strong>${customerName}</strong>, tu turno quedó confirmado en <b>${shopName}</b>:</p>
      </div>

      <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
        <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Barbero:</strong>
        <span style="color: #FF1493; font-weight: bold;">${barberName}${barberPhone ? ` · ${barberPhone}` : ""}</span>
      </p>
      <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
        <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Servicio:</strong>
        <span style="color: #FF1493; font-weight: bold;">${service}</span>
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
        ${cancelPhone ? `
        <a href="https://wa.me/${cancelPhone}?text=Hola!%20Soy%20${encodeURIComponent(customerName)},%20te%20escribo%20por%20mi%20turno%20del%20dia%20${encodeURIComponent(dateLabel)}%20a%20las%20${encodeURIComponent(timeLabel)}%20para%20cancelarlo"
          style="background-color: #FF1493; color: white; padding: 12px 18px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; font-size: 14px; border: 1px solid #ff4d4d; margin-bottom: 8px;">
          CANCELAR TURNO
        </a>
        ` : ""}
      </div>

      <div style="text-align: center; margin-top: 12px;">
        <p style="font-size: 9px; color: #444; letter-spacing: 3px; margin: 0; text-transform: uppercase;">
          POWERED BY CODEX® SYSTEM
        </p>
      </div>
    </div>
  `;
}

async function sendMercadoPagoApprovedMail({ appointment, userDoc }) {
  if (!appointment?.customerEmail) return;

  const barber = await BarberModel.findById(appointment.barber)
    .select({ fullName: 1, phone: 1 })
    .lean();

  const mailHtml = buildPaymentApprovedMailHtml({
    customerName: appointment.customerName,
    shopName: userDoc?.fullName || "Tu Barbería",
    barberName: barber?.fullName || "Barbero",
    barberPhone: barber?.phone || "",
    service: appointment.service,
    appointmentDate: new Date(appointment.startTime),
  });

  await sendAppMail({
    to: appointment.customerEmail,
    subject: `✅ Pago aprobado: ${appointment.service}`,
    html: mailHtml,
  });
}

function isMercadoPagoWebhookValid(req) {
  const { webhookSecret } = getMercadoPagoConfig();
  if (!webhookSecret) return true;

  const xSignature = String(req.headers["x-signature"] || "").trim();
  const xRequestId = String(req.headers["x-request-id"] || "").trim();
  const paymentId =
    String(req.body?.data?.id || req.query?.["data.id"] || req.body?.id || "").trim();

  if (!xSignature || !xRequestId || !paymentId) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [key, value] = part.split("=").map((item) => item.trim());
      return [key, value];
    }),
  );

  if (!parts.ts || !parts.v1) return false;

  const manifest = buildWebhookManifest({
    paymentId,
    xRequestId,
    ts: parts.ts,
  });
  const digest = crypto
    .createHmac("sha256", webhookSecret)
    .update(manifest)
    .digest("hex");

  return digest === parts.v1;
}

function normalizeSubscriptionReference(value) {
  const [prefix, userId, plan] = String(value || "").split(":");
  if (prefix !== "subscription" || !userId || !plan) {
    return null;
  }
  return { userId, plan };
}

function resolvePreapprovalStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "authorized") return "authorized";
  if (normalized === "pending") return "pending";
  if (normalized === "paused") return "paused";
  if (normalized === "cancelled") return "cancelled";
  return "unknown";
}

export function calculateSubscriptionExpiry({ billingCycle, paidAt }) {
  if (!billingCycle || billingCycle === "custom") return null;
  const base = new Date(paidAt);
  if (billingCycle === "yearly") {
    base.setFullYear(base.getFullYear() + 1);
    return base;
  }
  base.setMonth(base.getMonth() + 1);
  return base;
}

function calculateCouponBenefitValidUntil({
  benefitDurationType,
  benefitDurationValue,
  appliedAt,
}) {
  const safeAppliedAt = new Date(appliedAt);
  if (Number.isNaN(safeAppliedAt.getTime())) return null;

  if (benefitDurationType === "one_time") {
    return safeAppliedAt;
  }

  if (benefitDurationType === "days" && benefitDurationValue > 0) {
    const validUntil = new Date(safeAppliedAt);
    validUntil.setDate(validUntil.getDate() + benefitDurationValue);
    return validUntil;
  }

  if (benefitDurationType === "months" && benefitDurationValue > 0) {
    const validUntil = new Date(safeAppliedAt);
    validUntil.setMonth(validUntil.getMonth() + benefitDurationValue);
    return validUntil;
  }

  return null;
}

async function appointmentHasConfirmedOverlap(appointment) {
  const startTime = new Date(appointment.startTime);
  const durationMinutes = Number(appointment.durationMinutes || 30);
  const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

  const overlappingCandidates = await AppointmentModel.find({
    owner: appointment.owner,
    barber: appointment.barber,
    _id: { $ne: appointment._id },
    status: { $in: ["pending", "completed"] },
    startTime: { $lt: endTime },
  })
    .select({ startTime: 1, durationMinutes: 1 })
    .lean();

  return overlappingCandidates.some((existing) => {
    const existingStart = new Date(existing.startTime);
    const existingEnd = new Date(
      existingStart.getTime() + Number(existing.durationMinutes || 30) * 60000,
    );
    return existingEnd > startTime;
  });
}

export async function applyPendingCouponToSubscription({ userDoc, plan, pricing }) {
  const pendingCouponCode = String(userDoc.subscription?.pendingCouponCode || "").trim();
  const pendingCouponDiscountType =
    String(userDoc.subscription?.pendingCouponDiscountType || "").trim() || "percentage";
  const pendingCouponDiscountPercent = Number(
    userDoc.subscription?.pendingCouponDiscountPercent || 0,
  );
  const pendingCouponDiscountAmountUsdReference = Number(
    userDoc.subscription?.pendingCouponDiscountAmountUsdReference || 0,
  );
  const pendingBenefitDurationType =
    String(userDoc.subscription?.pendingCouponBenefitDurationType || "").trim() || "forever";
  const pendingBenefitDurationValue = Number(
    userDoc.subscription?.pendingCouponBenefitDurationValue || 0,
  );

  const hasDiscountValue =
    (pendingCouponDiscountType === "percentage" && pendingCouponDiscountPercent > 0) ||
    (pendingCouponDiscountType === "fixed_usd_reference" &&
      pendingCouponDiscountAmountUsdReference > 0);

  if (!pendingCouponCode || !hasDiscountValue) {
    userDoc.subscription = {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      pendingCouponCode: null,
      pendingCouponDiscountType: null,
      pendingCouponDiscountPercent: null,
      pendingCouponDiscountAmountUsdReference: null,
      pendingCouponBenefitDurationType: null,
      pendingCouponBenefitDurationValue: null,
    };
    return;
  }

  const couponDoc = await SubscriptionCouponModel.findOne({
    code: pendingCouponCode,
    isActive: true,
  });

  const resolvedPricing = resolvePlanPricingForSubscription({
    plan,
    pricing,
    subscription: {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      customPriceArs: null,
      customPriceUsdReference: null,
    },
    couponDiscountType: pendingCouponDiscountType,
    couponDiscountPercent: pendingCouponDiscountPercent,
    couponDiscountAmountUsdReference: pendingCouponDiscountAmountUsdReference,
  });

  const couponAppliedAt = new Date();
  const couponValidUntil = calculateCouponBenefitValidUntil({
    benefitDurationType: pendingBenefitDurationType,
    benefitDurationValue: pendingBenefitDurationValue,
    appliedAt: couponAppliedAt,
  });

  userDoc.subscription = {
    ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
    couponCode: pendingCouponCode,
    couponDiscountType: pendingCouponDiscountType,
    couponDiscountPercent: pendingCouponDiscountPercent,
    couponDiscountAmountUsdReference:
      pendingCouponDiscountType === "fixed_usd_reference"
        ? pendingCouponDiscountAmountUsdReference
        : null,
    couponBenefitDurationType: pendingBenefitDurationType,
    couponBenefitDurationValue:
      ["days", "months"].includes(pendingBenefitDurationType) &&
      pendingBenefitDurationValue > 0
        ? pendingBenefitDurationValue
        : null,
    couponAppliedAt,
    couponValidUntil,
    pendingCouponCode: null,
    pendingCouponDiscountType: null,
    pendingCouponDiscountPercent: null,
    pendingCouponDiscountAmountUsdReference: null,
    pendingCouponBenefitDurationType: null,
    pendingCouponBenefitDurationValue: null,
    customPriceArs: null,
    customPriceUsdReference: null,
  };

  if (
    couponDoc?.couponCategory === "referral" &&
    !String(userDoc.subscription?.referralCode || "").trim()
  ) {
    userDoc.subscription.referralCode = couponDoc.code;
    userDoc.subscription.referralOwnerName = String(couponDoc.referralOwnerName || "").trim() || null;
    userDoc.subscription.referralAttributedAt = couponAppliedAt;
  }

  if (couponDoc) {
    couponDoc.redemptionCount = Number(couponDoc.redemptionCount || 0) + 1;
    await couponDoc.save();
  }

  return resolvedPricing;
}

function clearSubscriptionCouponBenefit(userDoc) {
  userDoc.subscription = {
    ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
    couponCode: null,
    couponDiscountType: null,
    couponDiscountPercent: null,
    couponDiscountAmountUsdReference: null,
    couponBenefitDurationType: null,
    couponBenefitDurationValue: null,
    couponAppliedAt: null,
    couponValidUntil: null,
  };
}

function shouldClearExistingCouponOnApprovedPayment({ userDoc, paidAt }) {
  const subscription = userDoc?.subscription ?? {};
  const hasPendingCoupon = Boolean(
    String(subscription?.pendingCouponCode || "").trim(),
  );
  const currentCouponCode = String(subscription?.couponCode || "").trim();
  const benefitType = String(subscription?.couponBenefitDurationType || "").trim();

  if (hasPendingCoupon || !currentCouponCode || !benefitType) {
    return false;
  }

  if (benefitType === "one_time") {
    return Boolean(subscription?.lastPaymentAt);
  }

  if (benefitType === "months") {
    const validUntil = subscription?.couponValidUntil
      ? new Date(subscription.couponValidUntil)
      : null;
    if (!validUntil || Number.isNaN(validUntil.getTime())) {
      return false;
    }
    return validUntil.getTime() < paidAt.getTime();
  }

  if (benefitType === "days") {
    const validUntil = subscription?.couponValidUntil
      ? new Date(subscription.couponValidUntil)
      : null;
    if (!validUntil || Number.isNaN(validUntil.getTime())) {
      return false;
    }
    return validUntil.getTime() < paidAt.getTime();
  }

  return false;
}

async function syncAutomaticSubscriptionFromPreapproval(preapproval) {
  const parsedReference = normalizeSubscriptionReference(preapproval?.external_reference);
  const userId = parsedReference?.userId || "";
  const plan = parsedReference?.plan || "";

  if (!userId || !plan) {
    return false;
  }

  const userDoc = await UserModel.findById(userId);
  if (!userDoc || userDoc.isActive === false) {
    return false;
  }

  const normalizedStatus = resolvePreapprovalStatus(preapproval?.status);
  const nextBillingAt = preapproval?.auto_recurring?.next_payment_date
    ? new Date(preapproval.auto_recurring.next_payment_date)
    : null;
  const previousPreapprovalStatus = resolvePreapprovalStatus(
    userDoc.subscription?.mercadoPagoPreapprovalStatus,
  );

  if (normalizedStatus === "authorized") {
    const startedAt = preapproval?.date_created ? new Date(preapproval.date_created) : new Date();
    const pricingDoc = await getOrCreatePlanPricing();
    const pricing = serializePlanPricing(pricingDoc);
    const resolvedCouponPricing = await applyPendingCouponToSubscription({
      userDoc,
      plan,
      pricing,
    });
    userDoc.subscription = {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      plan,
      status: "active",
      billingCycle: "monthly",
      renewalMode: "automatic",
      startedAt: userDoc.subscription?.startedAt || startedAt,
      expiresAt: nextBillingAt,
      nextBillingAt,
      pendingPlan: null,
      mercadoPagoPreapprovalId:
        String(preapproval.id || userDoc.subscription?.mercadoPagoPreapprovalId || "") || null,
      mercadoPagoPreapprovalStatus: normalizedStatus,
      renewalReminder7dAt: null,
      renewalReminder3dAt: null,
      renewalReminder1dAt: null,
      pastDueAt: null,
      pastDueReminderSentAt: null,
      graceUntil: null,
      cancelledAt: null,
    };
    await userDoc.save();

    if (previousPreapprovalStatus !== "authorized") {
      try {
        const pricingDoc = await getOrCreatePlanPricing();
        const pricing = serializePlanPricing(pricingDoc);
      const amountArs =
          Number(userDoc.subscription?.customPriceArs || 0) > 0
            ? Number(userDoc.subscription.customPriceArs)
            : resolvedCouponPricing?.effectiveArs || Number(pricing[plan]?.ars || 0);
        await notifySubscriptionActivated({
          userDoc,
          plan,
          amountArs,
          expiresAt: nextBillingAt,
          renewalMode: "automatic",
        });
      } catch (error) {
        console.error(
          "Error notificando activación automática del plan:",
          error?.message || error,
        );
      }
    }

    return true;
  }

  userDoc.subscription = {
    ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
    renewalMode: "automatic",
    mercadoPagoPreapprovalId:
      String(preapproval.id || userDoc.subscription?.mercadoPagoPreapprovalId || "") || null,
    mercadoPagoPreapprovalStatus: normalizedStatus,
    nextBillingAt,
    status:
      normalizedStatus === "cancelled"
        ? "cancelled"
        : normalizedStatus === "paused"
          ? "past_due"
          : userDoc.subscription?.status || "trial",
    cancelledAt:
      normalizedStatus === "cancelled"
        ? new Date()
        : userDoc.subscription?.cancelledAt || null,
  };
  await userDoc.save();
  return true;
}

async function ensureMercadoPagoAccessToken(userDoc) {
  const auth = userDoc?.mercadoPagoAuth;
  if (!auth?.accessToken) {
    const error = new Error("La barbería no tiene Mercado Pago conectado.");
    error.statusCode = 400;
    throw error;
  }

  if (!auth.expiresAt || new Date(auth.expiresAt).getTime() > Date.now() + 60_000) {
    return auth.accessToken;
  }

  if (!auth.refreshToken) {
    const error = new Error("La conexión con Mercado Pago venció. Volvé a conectarla.");
    error.statusCode = 400;
    throw error;
  }

  const refreshed = await refreshMercadoPagoAccessToken({
    refreshToken: auth.refreshToken,
  });

  userDoc.mercadoPagoAuth = {
    ...(userDoc.mercadoPagoAuth?.toObject?.() ?? userDoc.mercadoPagoAuth ?? {}),
    accessToken: refreshed.access_token || null,
    refreshToken: refreshed.refresh_token || auth.refreshToken,
    publicKey: refreshed.public_key || auth.publicKey || null,
    scope: refreshed.scope || auth.scope || null,
    userId: refreshed.user_id ? String(refreshed.user_id) : auth.userId || null,
    expiresAt: refreshed.expires_in
      ? new Date(Date.now() + Number(refreshed.expires_in) * 1000)
      : auth.expiresAt || null,
    lastRefreshAt: new Date(),
    linkedAt: auth.linkedAt || new Date(),
  };

  userDoc.paymentSettings = {
    ...(userDoc.paymentSettings?.toObject?.() ?? userDoc.paymentSettings ?? {}),
    mercadoPagoConnectionStatus: "connected",
    mercadoPagoSellerId:
      refreshed.user_id ? String(refreshed.user_id) : userDoc.paymentSettings?.mercadoPagoSellerId || null,
    mercadoPagoPublicKey:
      refreshed.public_key || userDoc.paymentSettings?.mercadoPagoPublicKey || null,
  };

  await userDoc.save();

  return userDoc.mercadoPagoAuth.accessToken;
}

export async function createAppointmentMercadoPagoPreference({
  appointmentId,
  ownerId,
}) {
  const appointment = await AppointmentModel.findById(appointmentId);
  if (!appointment) {
    const error = new Error("No encontramos el turno a cobrar.");
    error.statusCode = 404;
    throw error;
  }

  const userDoc = await UserModel.findById(ownerId).select("+mercadoPagoAuth");
  if (!userDoc || userDoc.isActive === false) {
    const error = new Error("No encontramos la barbería.");
    error.statusCode = 404;
    throw error;
  }

  const accessToken = await ensureMercadoPagoAccessToken(userDoc);
  const settings = userDoc.paymentSettings || {};
  const amountToCharge = calculateAdvanceAmount({
    amountTotal: appointment.amountTotal || appointment.servicePrice || 0,
    settings,
  });

  if (!Number.isFinite(amountToCharge) || amountToCharge <= 0) {
    const error = new Error("No pudimos calcular el monto a cobrar con Mercado Pago.");
    error.statusCode = 400;
    throw error;
  }

  const externalReference = appointment._id.toString();
  const backUrls = buildMercadoPagoBookingReturnUrls(userDoc.shopSlug);
  const preference = await createMercadoPagoPreference({
    accessToken,
    payload: {
      items: [
        {
          id: appointment._id.toString(),
          title: `${appointment.service} - ${userDoc.fullName}`,
          description:
            settings.advanceMode === "full"
              ? "Pago total del turno"
              : "Seña online del turno",
          quantity: 1,
          currency_id: "ARS",
          unit_price: Number(amountToCharge),
        },
      ],
      payer: appointment.customerEmail
        ? {
            email: appointment.customerEmail,
            name: appointment.customerName,
          }
        : undefined,
      external_reference: externalReference,
      notification_url: `${buildMercadoPagoWebhookUrl()}?appointmentId=${appointment._id.toString()}`,
      back_urls: backUrls,
      auto_return: "approved",
      metadata: {
        appointment_id: appointment._id.toString(),
        owner_id: userDoc._id.toString(),
        shop_slug: userDoc.shopSlug,
      },
    },
  });

  appointment.mercadoPagoPreferenceId = preference.id || null;
  appointment.mercadoPagoExternalReference = externalReference;
  await appointment.save();

  return {
    preferenceId: preference.id || null,
    checkoutUrl: preference.init_point || null,
    sandboxCheckoutUrl: preference.sandbox_init_point || null,
    amountToCharge,
  };
}

export async function handleMercadoPagoWebhook(req, res, next) {
  try {
    if (!isMercadoPagoWebhookValid(req)) {
      return res.status(401).json({ error: "Webhook de Mercado Pago inválido." });
    }

    const type = String(req.body?.type || req.query?.type || "").trim();
    const paymentId = String(
      req.body?.data?.id || req.query?.["data.id"] || req.body?.id || "",
    ).trim();

    if (type && type !== "payment") {
      return res.status(200).json({ received: true, ignored: true });
    }

    if (!paymentId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const appointmentId = String(req.query?.appointmentId || req.body?.appointmentId || "").trim();
    const targetAppointment = appointmentId
      ? await AppointmentModel.findById(appointmentId)
      : await AppointmentModel.findOne({
          $or: [{ mercadoPagoPaymentId: paymentId }],
        });

    if (!targetAppointment) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const userDoc = await UserModel.findById(targetAppointment.owner).select("+mercadoPagoAuth");
    if (!userDoc || userDoc.isActive === false) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const accessToken = await ensureMercadoPagoAccessToken(userDoc);
    const payment = await getMercadoPagoPayment({ accessToken, paymentId });
    const normalizedPaymentStatus = normalizePaymentStatus(payment.status);
    const previousPaymentStatus = String(targetAppointment.paymentStatus || "").trim();
    const shouldSendApprovedMail =
      normalizedPaymentStatus === "approved" &&
      targetAppointment.customerEmail &&
      previousPaymentStatus !== "paid" &&
      previousPaymentStatus !== "partial";

    targetAppointment.mercadoPagoPaymentId = String(payment.id || paymentId);
    targetAppointment.mercadoPagoMerchantOrderId = payment.order?.id
      ? String(payment.order.id)
      : payment.order?.type || targetAppointment.mercadoPagoMerchantOrderId;

    if (normalizedPaymentStatus === "approved") {
      const hasOverlap = await appointmentHasConfirmedOverlap(targetAppointment);
      if (hasOverlap) {
        targetAppointment.status = "cancelled";
        await targetAppointment.save();
        return res.status(200).json({
          received: true,
          updated: false,
          reason: "appointment_conflict_after_payment",
        });
      }

      const paidAmount = Math.max(0, Number(payment.transaction_amount || 0));
      const totalAmount = Math.max(
        0,
        Number(targetAppointment.amountTotal || targetAppointment.servicePrice || 0),
      );

      targetAppointment.paymentMethodCollected = "transfer";
      targetAppointment.amountPaid = Math.min(totalAmount, paidAmount);
      targetAppointment.amountPending = Math.max(
        0,
        totalAmount - targetAppointment.amountPaid,
      );
      targetAppointment.paymentStatus =
        targetAppointment.amountPending > 0 ? "partial" : "paid";
      targetAppointment.status = "pending";
      targetAppointment.paymentDeadlineAt = null;
    } else if (normalizedPaymentStatus === "refunded") {
      targetAppointment.paymentStatus = "refunded";
      targetAppointment.amountPaid = 0;
      targetAppointment.amountPending = Math.max(
        0,
        Number(targetAppointment.amountTotal || targetAppointment.servicePrice || 0),
      );
      targetAppointment.paymentMethodCollected = null;
      if (targetAppointment.status === "awaiting_payment") {
        targetAppointment.status = "cancelled";
      }
      targetAppointment.paymentDeadlineAt = null;
    } else if (normalizedPaymentStatus === "rejected") {
      targetAppointment.paymentStatus = "unpaid";
      targetAppointment.amountPaid = 0;
      targetAppointment.amountPending = Math.max(
        0,
        Number(targetAppointment.amountTotal || targetAppointment.servicePrice || 0),
      );
      targetAppointment.paymentMethodCollected = null;
      if (targetAppointment.status === "awaiting_payment") {
        targetAppointment.status = "cancelled";
      }
      targetAppointment.paymentDeadlineAt = null;
    }

    await targetAppointment.save();

    if (shouldSendApprovedMail) {
      try {
        await sendMercadoPagoApprovedMail({
          appointment: targetAppointment,
          userDoc,
        });
      } catch (mailErr) {
        console.error(
          "Error enviando email de confirmacion tras pago aprobado:",
          mailErr?.message || mailErr,
        );
      }
    }

    return res.status(200).json({ received: true, updated: true });
  } catch (err) {
    return next(err);
  }
}

export async function handleSubscriptionMercadoPagoWebhook(req, res, next) {
  try {
    if (!isMercadoPagoWebhookValid(req)) {
      return res.status(401).json({ error: "Webhook de Mercado Pago inválido." });
    }

    const type = String(req.body?.type || req.query?.type || "").trim();
    const paymentId = String(
      req.body?.data?.id || req.query?.["data.id"] || req.body?.id || "",
    ).trim();

    if (type && type !== "payment" && !type.toLowerCase().includes("preapproval")) {
      return res.status(200).json({ received: true, ignored: true });
    }

    if (type.toLowerCase().includes("preapproval")) {
      if (!paymentId) {
        return res.status(200).json({ received: true, ignored: true });
      }
      const preapproval = await getMercadoPagoSystemPreapproval({ preapprovalId: paymentId });
      await syncAutomaticSubscriptionFromPreapproval(preapproval);
      return res.status(200).json({ received: true, kind: "preapproval" });
    }

    if (!paymentId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const payment = await getMercadoPagoSystemPayment({ paymentId });
    const normalizedStatus = normalizePaymentStatus(payment.status);
    const metadataUserId =
      String(payment.metadata?.user_id || req.query?.userId || req.body?.userId || "").trim();
    const metadataPlan = String(payment.metadata?.plan || "").trim();
    const parsedReference = normalizeSubscriptionReference(payment.external_reference);

    const userId = metadataUserId || parsedReference?.userId || "";
    const plan = metadataPlan || parsedReference?.plan || "";

    if (!userId || !plan) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(200).json({ received: true, ignored: true });
    }

    if (normalizedStatus === "approved") {
      const billingCycle =
        String(payment.metadata?.billing_cycle || userDoc.subscription?.billingCycle || "monthly").trim() ||
        "monthly";
      const paidAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
      const previousPaymentId = String(userDoc.subscription?.mercadoPagoPaymentId || "").trim();
      const currentPaymentId = String(payment.id || paymentId).trim();
      const pricingDoc = await getOrCreatePlanPricing();
      const pricing = serializePlanPricing(pricingDoc);

      if (shouldClearExistingCouponOnApprovedPayment({ userDoc, paidAt })) {
        clearSubscriptionCouponBenefit(userDoc);
      }

      const resolvedCouponPricing = await applyPendingCouponToSubscription({
        userDoc,
        plan,
        pricing,
      });
      const paidAmount = Math.max(
        0,
        Number(payment.transaction_amount || resolvedCouponPricing?.effectiveArs || 0),
      );

      userDoc.subscription = {
        ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
        plan,
        status: "active",
        billingCycle,
        renewalMode: userDoc.subscription?.renewalMode || "manual",
        startedAt: paidAt,
        expiresAt: calculateSubscriptionExpiry({ billingCycle, paidAt }),
        nextBillingAt:
          userDoc.subscription?.renewalMode === "automatic"
            ? userDoc.subscription?.nextBillingAt || null
            : calculateSubscriptionExpiry({ billingCycle, paidAt }),
        pendingPlan: null,
        mercadoPagoPaymentId: currentPaymentId,
        mercadoPagoPreferenceId:
          payment.order?.id ? String(payment.order.id) : userDoc.subscription?.mercadoPagoPreferenceId || null,
        lastPaymentAt: paidAt,
        renewalReminder7dAt: null,
        renewalReminder3dAt: null,
        renewalReminder1dAt: null,
        pastDueAt: null,
        pastDueReminderSentAt: null,
        graceUntil: null,
        cancelledAt: null,
      };
      await userDoc.save();

      if (currentPaymentId && currentPaymentId !== previousPaymentId) {
        try {
          await notifySubscriptionActivated({
            userDoc,
            plan,
            amountArs: paidAmount,
            expiresAt: userDoc.subscription?.expiresAt,
            renewalMode: userDoc.subscription?.renewalMode || "manual",
          });
        } catch (error) {
          console.error(
            "Error notificando activación manual del plan:",
            error?.message || error,
          );
        }
      }
    } else if (normalizedStatus === "rejected") {
      userDoc.subscription = {
        ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
        status: userDoc.subscription?.status === "active" ? "active" : "past_due",
        pendingPlan: null,
        mercadoPagoPaymentId: String(payment.id || paymentId),
      };
      await userDoc.save();
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    return next(err);
  }
}

export async function handleSubscriptionPaymentReturnPage(req, res, next) {
  try {
    const result = String(req.query?.result || "").trim() || "unknown";
    const preapprovalId = String(
      req.query?.preapproval_id || req.query?.preapproval || req.query?.subscription_id || req.query?.id || "",
    ).trim();
    if (preapprovalId) {
      try {
        const preapproval = await getMercadoPagoSystemPreapproval({ preapprovalId });
        await syncAutomaticSubscriptionFromPreapproval(preapproval);
      } catch (_error) {}
    }
    return res.status(200).send(buildSubscriptionPaymentReturnHtml({ result }));
  } catch (err) {
    return next(err);
  }
}
