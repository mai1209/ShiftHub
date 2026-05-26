import { UserModel } from "../models/User.js";
import { BarberModel } from "../models/Barber.js";
import { AppointmentModel } from "../models/Appointment.js";
import { ServiceModel } from "../models/Services.js";
import { ShopModel } from "../models/Shop.js";
import { SubscriptionCouponModel } from "../models/SubscriptionCoupon.js";
import { hashPassword, verifyPassword } from "../token/passwordManager.js";
import { signAccessToken, verifyAccessToken } from "../token/jwtManager.js";
import crypto from "crypto";
import {
  getMailerDebugInfo,
  sendAppMail,
  verifyMailerConnection,
} from "../services/mailer.js";
import {
  buildMercadoPagoOAuthUrl,
  buildMercadoPagoSubscriptionReturnUrls,
  buildMercadoPagoSubscriptionWebhookUrl,
  createMercadoPagoPkcePair,
  createMercadoPagoSystemPreference,
  exchangeMercadoPagoCode,
  getMercadoPagoConfig,
  updateMercadoPagoSystemPreapproval,
} from "../services/mercadoPago.js";
import {
  isSubscriptionLifecycleAuthorized,
  notifySubscriptionPriceChange,
  processSubscriptionLifecycle,
} from "../services/subscriptionLifecycleService.js";
import {
  getOrCreatePlanPricing,
  serializePlanPricing,
} from "../services/planPricingService.js";
import {
  normalizeCouponCode,
  resolvePlanPricingForSubscription,
} from "../services/subscriptionPricingService.js";
import { normalizeShopClosedDays } from "../utils/shopClosures.js";
import {
  normalizeAppRole,
  resolveEffectiveOwnerId,
  serializeAuthUser,
} from "../utils/userRoles.js";
import {
  getBusinessTypeLabel,
  isValidBusinessType,
  normalizeBusinessType,
} from "../utils/businessTypes.js";
import {
  buildFreeSubscriptionPatch,
  shouldNormalizeLegacyTrialToFree,
} from "../utils/subscriptionAccess.js";
import { isImageDataUrl, isPublicMediaUrl, persistThemeMediaUpdates } from "../utils/publicMedia.js";

const PASSWORD_RESET_EXPIRY_MS = 15 * 60 * 1000;
const SUBSCRIPTION_CURRENCY_ID = String(
  process.env.SUBSCRIPTIONS_CURRENCY_ID || "USD",
).trim().toUpperCase();
const SUPPORT_CONTACT_EMAIL = String(
  process.env.SUPPORT_CONTACT_EMAIL || "barberappbycodex@gmail.com",
).trim();
const SUBSCRIPTION_PLAN_CONFIG = {
  basic: {
    title: "Suscripcion Shift App Basico",
    description: "Plan mensual Shift App Basico",
    billingCycle: "monthly",
  },
  pro: {
    title: "Suscripcion Shift App Pro",
    description: "Plan mensual Shift App Pro",
    billingCycle: "monthly",
  },
};
const DEFAULT_STORE_SUBSCRIPTION_PRODUCTS = {
  basic: {
    apple: "shifthub_basic_monthly",
    google: "shifthub_basic_monthly",
  },
  pro: {
    apple: "shifthub_pro_monthly",
    google: "shifthub_pro_monthly",
  },
};

function sanitizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function getStoreSubscriptionProducts() {
  return {
    basic: {
      apple: String(
        process.env.APPLE_SUBSCRIPTION_BASIC_PRODUCT_ID ||
          DEFAULT_STORE_SUBSCRIPTION_PRODUCTS.basic.apple,
      ).trim(),
      google: String(
        process.env.GOOGLE_SUBSCRIPTION_BASIC_PRODUCT_ID ||
          DEFAULT_STORE_SUBSCRIPTION_PRODUCTS.basic.google,
      ).trim(),
    },
    pro: {
      apple: String(
        process.env.APPLE_SUBSCRIPTION_PRO_PRODUCT_ID ||
          DEFAULT_STORE_SUBSCRIPTION_PRODUCTS.pro.apple,
      ).trim(),
      google: String(
        process.env.GOOGLE_SUBSCRIPTION_PRO_PRODUCT_ID ||
          DEFAULT_STORE_SUBSCRIPTION_PRODUCTS.pro.google,
      ).trim(),
    },
  };
}

function resolveStorePlan({ provider, plan, productId, currentPlanId }) {
  if (plan === "basic" || plan === "pro") {
    return plan;
  }

  const catalog = getStoreSubscriptionProducts();
  const targetIds = [String(productId || "").trim(), String(currentPlanId || "").trim()].filter(Boolean);

  for (const candidatePlan of ["basic", "pro"]) {
    const candidateProductId = catalog[candidatePlan]?.[provider];
    if (candidateProductId && targetIds.includes(candidateProductId)) {
      return candidatePlan;
    }
  }

  return null;
}

function normalizeSubscriptionProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function isWebSubscriptionProvider(provider) {
  return provider === "mercadopago" || provider === "astropay";
}

function isStoreSubscriptionProvider(provider) {
  return provider === "apple" || provider === "google";
}

function getChannelConflictMessage(provider) {
  if (isStoreSubscriptionProvider(provider)) {
    return "Esta cuenta ya tiene una suscripción asociada a la tienda donde fue activada.";
  }

  if (isWebSubscriptionProvider(provider)) {
    return "Esta cuenta ya tiene una suscripción asociada a pagos web.";
  }

  return "Esta cuenta ya tiene una suscripción asociada a otro canal.";
}

function sanitizeStoreSubscriptionSyncInput(input) {
  const provider = String(input?.provider || "").trim().toLowerCase();
  if (!["apple", "google"].includes(provider)) {
    throw new Error("El proveedor de la suscripción debe ser apple o google.");
  }

  const plan = String(input?.plan || "").trim().toLowerCase();
  const productId = String(input?.productId || "").trim();
  if (!productId) {
    throw new Error("Falta el identificador del producto.");
  }

  const resolvedPlan = resolveStorePlan({
    provider,
    plan: plan || null,
    productId,
    currentPlanId: input?.currentPlanId,
  });

  if (!resolvedPlan) {
    throw new Error("No pudimos asociar la compra a un plan válido.");
  }

  const status = String(input?.status || "active").trim().toLowerCase();
  const normalizedStatus = ["active", "past_due", "cancelled"].includes(status)
    ? status
    : "active";

  const expiresAt =
    input?.expiresAt && !Number.isNaN(new Date(input.expiresAt).getTime())
      ? new Date(input.expiresAt)
      : null;

  return {
    provider,
    plan: resolvedPlan,
    productId,
    currentPlanId: String(input?.currentPlanId || "").trim() || null,
    purchaseToken: String(input?.purchaseToken || "").trim() || null,
    transactionId: String(input?.transactionId || "").trim() || null,
    originalTransactionId:
      String(input?.originalTransactionId || "").trim() || null,
    environment: String(input?.environment || "").trim() || null,
    autoRenewing: Boolean(input?.autoRenewing),
    status: normalizedStatus,
    expiresAt,
  };
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSlugCandidate(value) {
  const slug = slugify(value);
  return slug.length >= 3 ? slug : "";
}

function normalizeHexColor(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : null;
}

function buildPasswordResetCode() {
  return String(crypto.randomInt(100000, 999999));
}

function hashPasswordResetCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

async function sendPasswordRecoveryEmail({ email, fullName, code }) {
  await sendAppMail({
    to: email,
    subject: "Recupera tu contrasena de Shift App",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin-bottom: 8px;">Recuperacion de contrasena</h2>
        <p>Hola ${fullName || "equipo"},</p>
        <p>Tu codigo para poner una nueva contrasena es:</p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; margin: 18px 0; color: #FF1493;">
          ${code}
        </div>
        <p>Este codigo vence en 15 minutos.</p>
        <p>Si vos no pediste este cambio, ignora este correo.</p>
      </div>
    `,
  });
}

export async function sendTestMail(req, res, next) {
  try {
    const user = await UserModel.findById(req.user.id)
      .select({ email: 1, fullName: 1 })
      .lean();

    if (!user?.email) {
      return res.status(400).json({ error: "El usuario no tiene un email configurado." });
    }

    await sendAppMail({
      to: user.email,
      subject: "Prueba de correo de Shift App",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
          <h2 style="margin-bottom: 8px;">Correo de prueba</h2>
          <p>Hola ${user.fullName || "equipo"},</p>
          <p>Este correo confirma que la configuracion SMTP de tu Shift App esta funcionando.</p>
          <p>Si recibiste este mensaje, los mails automaticos del sistema deberian salir bien.</p>
        </div>
      `,
      text: `Hola ${user.fullName || "equipo"}. Este correo confirma que la configuracion SMTP de tu Shift App esta funcionando.`,
    });

    return res.json({ message: `Correo de prueba enviado a ${user.email}` });
  } catch (err) {
    return next(err);
  }
}

export async function getMailDebug(req, res, next) {
  try {
    const verify = await verifyMailerConnection();
    return res.json({
      ok: verify.ok,
      verify,
      env: getMailerDebugInfo(),
    });
  } catch (err) {
    return next(err);
  }
}

function buildMercadoPagoStateToken(userId, extra = {}) {
  return signAccessToken(
    {
      sub: userId,
      type: "mp_oauth",
      nonce: crypto.randomUUID(),
      ...extra,
    },
    { expiresIn: "15m" },
  );
}

function buildMercadoPagoConnectionPayload(userDoc) {
  const auth = userDoc?.mercadoPagoAuth ?? null;
  return {
    connectionStatus:
      userDoc?.paymentSettings?.mercadoPagoConnectionStatus || "disconnected",
    sellerId:
      userDoc?.paymentSettings?.mercadoPagoSellerId ||
      auth?.userId ||
      null,
    publicKey:
      userDoc?.paymentSettings?.mercadoPagoPublicKey ||
      auth?.publicKey ||
      null,
    linkedAt: auth?.linkedAt || null,
    expiresAt: auth?.expiresAt || null,
    hasRefreshToken: Boolean(auth?.refreshToken),
  };
}

function buildMercadoPagoCallbackHtml({
  success,
  title,
  message,
}) {
  const accent = success ? "#34C759" : "#FF5A5F";
  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
    </head>
    <body style="margin:0;background:#0D0D11;color:#fff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
      <div style="max-width:460px;width:100%;background:#17171C;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:28px;text-align:center;">
        <div style="width:64px;height:64px;border-radius:20px;margin:0 auto 18px;background:${accent};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;">
          ${success ? "✓" : "!"}
        </div>
        <h1 style="margin:0 0 12px;font-size:24px;">${title}</h1>
        <p style="margin:0 0 18px;color:#B7BECC;line-height:1.5;">${message}</p>
        <p style="margin:0;color:#7C8596;font-size:13px;">Podés volver a la app y refrescar la pantalla de Cobros.</p>
      </div>
    </body>
  </html>`;
}

function sanitizeThemeMediaValue(value, { label, maxLength }) {
  if (value == null || String(value).trim() === "") return null;
  const mediaValue = String(value).trim();

  if (isPublicMediaUrl(mediaValue) || /^https?:\/\//i.test(mediaValue)) {
    return mediaValue;
  }

  if (!isImageDataUrl(mediaValue)) {
    throw new Error(`${label} debe ser una imagen válida en base64 o una URL pública.`);
  }

  if (mediaValue.length > maxLength) {
    throw new Error(`${label} es demasiado grande. Elegí una imagen más liviana.`);
  }

  return mediaValue;
}

function sanitizeThemeConfigInput(input) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  const updates = {};
  let hasAnyField = false;

  if (Object.prototype.hasOwnProperty.call(input, "mode")) {
    hasAnyField = true;
    if (input.mode == null || String(input.mode).trim() === "") {
      updates.mode = null;
    } else if (input.mode === "dark" || input.mode === "light") {
      updates.mode = input.mode;
    } else {
      throw new Error("El modo del tema debe ser dark o light.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "webPreset")) {
    hasAnyField = true;
    if (input.webPreset == null || String(input.webPreset).trim() === "") {
      updates.webPreset = null;
    } else if (
      input.webPreset === "dark" ||
      input.webPreset === "light" ||
      input.webPreset === "vintage"
    ) {
      updates.webPreset = input.webPreset;
    } else {
      throw new Error("El estilo web debe ser dark, light o vintage.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "primary")) {
    hasAnyField = true;
    const normalized = normalizeHexColor(input.primary);
    if (input.primary != null && String(input.primary).trim() !== "" && !normalized) {
      throw new Error("El color primario no es válido.");
    }
    updates.primary = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(input, "secondary")) {
    hasAnyField = true;
    const normalized = normalizeHexColor(input.secondary);
    if (input.secondary != null && String(input.secondary).trim() !== "" && !normalized) {
      throw new Error("El color secundario no es válido.");
    }
    updates.secondary = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(input, "card")) {
    hasAnyField = true;
    const normalized = normalizeHexColor(input.card);
    if (input.card != null && String(input.card).trim() !== "" && !normalized) {
      throw new Error("El color de tarjeta no es válido.");
    }
    updates.card = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(input, "gradientColors")) {
    hasAnyField = true;
    if (input.gradientColors == null) {
      updates.gradientColors = [];
    } else if (!Array.isArray(input.gradientColors) || input.gradientColors.length !== 4) {
      throw new Error("El gradiente debe tener exactamente 4 colores.");
    } else {
      const normalizedColors = input.gradientColors.map(color => normalizeHexColor(color));
      if (normalizedColors.some(color => !color)) {
        throw new Error("Uno de los colores del gradiente no es válido.");
      }
      updates.gradientColors = normalizedColors;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "logoDataUrl")) {
    hasAnyField = true;
    updates.logoDataUrl = sanitizeThemeMediaValue(input.logoDataUrl, {
      label: "El logo",
      maxLength: 2_500_000,
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, "bannerDataUrl")) {
    hasAnyField = true;
    updates.bannerDataUrl = sanitizeThemeMediaValue(input.bannerDataUrl, {
      label: "La portada",
      maxLength: 4_500_000,
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, "mobileBannerDataUrl")) {
    hasAnyField = true;
    updates.mobileBannerDataUrl = sanitizeThemeMediaValue(input.mobileBannerDataUrl, {
      label: "La portada para teléfono",
      maxLength: 4_500_000,
    });
  }

  return { updates, hasAnyField };
}

function sanitizePublicProfileInput(input) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  const updates = {};
  let hasAnyField = false;
  const stringFields = [
    ["subtitle", 160, "El subtítulo no puede superar los 160 caracteres."],
    ["address", 220, "La dirección no puede superar los 220 caracteres."],
    ["phone", 80, "El teléfono no puede superar los 80 caracteres."],
    ["googlePlaceId", 180, "El Place ID no puede superar los 180 caracteres."],
  ];

  for (const [field, maxLength, message] of stringFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    hasAnyField = true;
    const value = String(input[field] ?? "").trim();
    if (value.length > maxLength) {
      throw new Error(message);
    }
    updates[field] = value || null;
  }

  const urlFields = [
    ["googleMapsUrl", "El link de Google Maps no es válido."],
    ["googleReviewsUrl", "El link de Google Reviews no es válido."],
    ["instagramUrl", "El link de Instagram no es válido."],
    ["linktreeUrl", "El link de Linktree no es válido."],
  ];

  for (const [field, message] of urlFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    hasAnyField = true;
    const value = String(input[field] ?? "").trim();
    if (!value) {
      updates[field] = null;
      continue;
    }

    let parsed;
    try {
      parsed = new URL(value);
    } catch (_error) {
      throw new Error(message);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(message);
    }

    updates[field] = parsed.toString();
  }

  if (Object.prototype.hasOwnProperty.call(input, "googleRating")) {
    hasAnyField = true;
    const rawRating = input.googleRating;
    if (rawRating == null || String(rawRating).trim() === "") {
      updates.googleRating = null;
    } else {
      const rating = Number(rawRating);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        throw new Error("La valoración de Google no es válida.");
      }
      updates.googleRating = rating > 0 ? rating : null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "googleReviewCount")) {
    hasAnyField = true;
    const rawCount = input.googleReviewCount;
    if (rawCount == null || String(rawCount).trim() === "") {
      updates.googleReviewCount = null;
    } else {
      const count = Number(rawCount);
      if (!Number.isInteger(count) || count < 0) {
        throw new Error("La cantidad de reseñas de Google no es válida.");
      }
      updates.googleReviewCount = count > 0 ? count : null;
    }
  }

  return { updates, hasAnyField };
}

function sanitizeAccountDeletionRequestInput(input) {
  const reason = String(input?.reason ?? "").trim();
  if (reason.length > 500) {
    throw new Error("El motivo no puede superar los 500 caracteres.");
  }

  return {
    reason,
  };
}

function sanitizePaymentSettingsInput(input) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  const updates = {};
  let hasAnyField = false;

  if (Object.prototype.hasOwnProperty.call(input, "cashEnabled")) {
    hasAnyField = true;
    updates.cashEnabled = Boolean(input.cashEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(input, "advancePaymentEnabled")) {
    hasAnyField = true;
    updates.advancePaymentEnabled = Boolean(input.advancePaymentEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(input, "advanceMode")) {
    hasAnyField = true;
    const value = String(input.advanceMode ?? "").trim().toLowerCase();
    if (value && !["deposit", "full"].includes(value)) {
      throw new Error("El modo de cobro adelantado no es válido.");
    }
    updates.advanceMode = value || "deposit";
  }

  if (Object.prototype.hasOwnProperty.call(input, "advanceType")) {
    hasAnyField = true;
    const value = String(input.advanceType ?? "").trim().toLowerCase();
    if (value && !["percent", "fixed"].includes(value)) {
      throw new Error("El tipo de adelanto no es válido.");
    }
    updates.advanceType = value || "percent";
  }

  if (Object.prototype.hasOwnProperty.call(input, "advanceValue")) {
    hasAnyField = true;
    const parsed = Number(input.advanceValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("El valor del adelanto no es válido.");
    }
    updates.advanceValue = parsed;
  }

  if (Object.prototype.hasOwnProperty.call(input, "mercadoPagoConnectionStatus")) {
    hasAnyField = true;
    const value = String(input.mercadoPagoConnectionStatus ?? "")
      .trim()
      .toLowerCase();
    if (value && !["disconnected", "pending", "connected"].includes(value)) {
      throw new Error("El estado de Mercado Pago no es válido.");
    }
    updates.mercadoPagoConnectionStatus = value || "disconnected";
  }

  if (Object.prototype.hasOwnProperty.call(input, "mercadoPagoSellerId")) {
    hasAnyField = true;
    const value = String(input.mercadoPagoSellerId ?? "").trim();
    updates.mercadoPagoSellerId = value || null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "mercadoPagoPublicKey")) {
    hasAnyField = true;
    const value = String(input.mercadoPagoPublicKey ?? "").trim();
    updates.mercadoPagoPublicKey = value || null;
  }

  return { updates, hasAnyField };
}

function sanitizeSubscriptionInput(input) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  const updates = {};
  let hasAnyField = false;

  if (Object.prototype.hasOwnProperty.call(input, "plan")) {
    const plan = String(input.plan ?? "").trim();
    if (!["free", "basic", "pro", "custom"].includes(plan)) {
      throw new Error("El plan no es válido.");
    }
    updates.plan = plan;
    hasAnyField = true;
  }

  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    const status = String(input.status ?? "").trim();
    if (!["trial", "active", "past_due", "cancelled"].includes(status)) {
      throw new Error("El estado no es válido.");
    }
    updates.status = status;
    hasAnyField = true;
  }

  if (Object.prototype.hasOwnProperty.call(input, "billingCycle")) {
    const rawCycle = input.billingCycle;
    const cycle =
      rawCycle == null || String(rawCycle).trim() === ""
        ? null
        : String(rawCycle).trim();
    if (cycle !== null && !["monthly", "yearly", "custom"].includes(cycle)) {
      throw new Error("El ciclo de facturación no es válido.");
    }
    updates.billingCycle = cycle;
    hasAnyField = true;
  }

  if (Object.prototype.hasOwnProperty.call(input, "renewalMode")) {
    const renewalMode = String(input.renewalMode ?? "").trim();
    if (!["manual", "automatic"].includes(renewalMode)) {
      throw new Error("El modo de renovación no es válido.");
    }
    updates.renewalMode = renewalMode;
    hasAnyField = true;
  }

  if (Object.prototype.hasOwnProperty.call(input, "customPriceArs")) {
    hasAnyField = true;
    const raw = input.customPriceArs;
    if (raw == null || String(raw).trim() === "") {
      updates.customPriceArs = null;
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("El precio especial en ARS no es válido.");
      }
      updates.customPriceArs = parsed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "customPriceUsdReference")) {
    hasAnyField = true;
    const raw = input.customPriceUsdReference;
    if (raw == null || String(raw).trim() === "") {
      updates.customPriceUsdReference = null;
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("La referencia especial en USD no es válida.");
      }
      updates.customPriceUsdReference = parsed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "internalNotes")) {
    hasAnyField = true;
    const notes = String(input.internalNotes ?? "").trim();
    if (notes.length > 400) {
      throw new Error("Las notas internas no pueden superar los 400 caracteres.");
    }
    updates.internalNotes = notes;
  }

  if (Object.prototype.hasOwnProperty.call(input, "startedAt")) {
    hasAnyField = true;
    if (!input.startedAt) {
      updates.startedAt = null;
    } else {
      const parsed = new Date(input.startedAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("La fecha de inicio no es válida.");
      }
      updates.startedAt = parsed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "expiresAt")) {
    hasAnyField = true;
    if (!input.expiresAt) {
      updates.expiresAt = null;
    } else {
      const parsed = new Date(input.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("La fecha de vencimiento no es válida.");
      }
      updates.expiresAt = parsed;
    }
  }

  return { updates, hasAnyField };
}

function sanitizeSubscriptionCouponInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  const updates = {};
  let hasAnyField = false;

  if (Object.prototype.hasOwnProperty.call(input, "code")) {
    hasAnyField = true;
    const code = normalizeCouponCode(input.code);
    if (!partial && !code) {
      throw new Error("El código del cupón es obligatorio.");
    }
    if (code) {
      updates.code = code;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "plan")) {
    hasAnyField = true;
    const rawPlan = input.plan == null || String(input.plan).trim() === ""
      ? null
      : String(input.plan).trim();
    if (rawPlan !== null && !["basic", "pro"].includes(rawPlan)) {
      throw new Error("El plan del cupón no es válido.");
    }
    updates.plan = rawPlan;
  }

  if (Object.prototype.hasOwnProperty.call(input, "couponCategory")) {
    hasAnyField = true;
    const couponCategory = String(input.couponCategory ?? "").trim() || "standard";
    if (!["standard", "referral"].includes(couponCategory)) {
      throw new Error("La categoría del cupón no es válida.");
    }
    updates.couponCategory = couponCategory;
  } else if (!partial) {
    updates.couponCategory = "standard";
  }

  if (Object.prototype.hasOwnProperty.call(input, "referralOwnerName")) {
    hasAnyField = true;
    const referralOwnerName = String(input.referralOwnerName ?? "").trim();
    if (referralOwnerName.length > 120) {
      throw new Error("El nombre del referente no puede superar los 120 caracteres.");
    }
    updates.referralOwnerName = referralOwnerName;
  } else if (!partial) {
    updates.referralOwnerName = "";
  }

  const rawDiscountType = Object.prototype.hasOwnProperty.call(input, "discountType")
    ? String(input.discountType ?? "").trim() || "percentage"
    : partial
      ? null
      : "percentage";

  if (rawDiscountType && !["percentage", "fixed_usd_reference"].includes(rawDiscountType)) {
    throw new Error("El tipo de descuento del cupón no es válido.");
  }

  if (rawDiscountType) {
    hasAnyField = true;
    updates.discountType = rawDiscountType;
  }

  if (Object.prototype.hasOwnProperty.call(input, "discountPercent")) {
    hasAnyField = true;
    const raw = input.discountPercent;

    if (raw == null || String(raw).trim() === "") {
      if (rawDiscountType === "percentage") {
        throw new Error("El descuento porcentual del cupón es obligatorio.");
      }
      updates.discountPercent = null;
    } else {
      const discountPercent = Number(raw);
      if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
        throw new Error("El descuento del cupón debe estar entre 0 y 100.");
      }
      updates.discountPercent = Number(discountPercent.toFixed(2));
    }
  } else if (!partial && rawDiscountType === "percentage") {
    throw new Error("El descuento porcentual del cupón es obligatorio.");
  } else if (rawDiscountType === "fixed_usd_reference") {
    updates.discountPercent = null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "discountAmountUsdReference")) {
    hasAnyField = true;
    const raw = input.discountAmountUsdReference;

    if (raw == null || String(raw).trim() === "") {
      if (rawDiscountType === "fixed_usd_reference") {
        throw new Error("El monto fijo del cupón en USD de referencia es obligatorio.");
      }
      updates.discountAmountUsdReference = null;
    } else {
      const discountAmountUsdReference = Number(raw);
      if (!Number.isFinite(discountAmountUsdReference) || discountAmountUsdReference <= 0) {
        throw new Error("El monto fijo del cupón en USD de referencia no es válido.");
      }
      updates.discountAmountUsdReference = Number(discountAmountUsdReference.toFixed(2));
    }
  } else if (!partial && rawDiscountType === "fixed_usd_reference") {
    throw new Error("El monto fijo del cupón en USD de referencia es obligatorio.");
  } else if (rawDiscountType === "percentage") {
    updates.discountAmountUsdReference = null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "benefitDurationType")) {
    hasAnyField = true;
    const benefitDurationType = String(input.benefitDurationType ?? "").trim() || "forever";
    if (!["forever", "one_time", "days", "months"].includes(benefitDurationType)) {
      throw new Error("La duración del beneficio no es válida.");
    }
    updates.benefitDurationType = benefitDurationType;
  } else if (!partial) {
    updates.benefitDurationType = "forever";
  }

  if (Object.prototype.hasOwnProperty.call(input, "benefitDurationValue")) {
    hasAnyField = true;
    const raw = input.benefitDurationValue;
    if (raw == null || String(raw).trim() === "") {
      updates.benefitDurationValue = null;
    } else {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("La duración del beneficio debe ser un entero mayor a cero.");
      }
      updates.benefitDurationValue = parsed;
    }
  }

  const effectiveBenefitDurationType =
    updates.benefitDurationType ??
    (partial ? null : "forever");
  const effectiveBenefitDurationValue = Object.prototype.hasOwnProperty.call(
    updates,
    "benefitDurationValue",
  )
    ? updates.benefitDurationValue
    : partial
      ? undefined
      : null;

  if (
    ["days", "months"].includes(effectiveBenefitDurationType) &&
    !(Number.isInteger(effectiveBenefitDurationValue) && effectiveBenefitDurationValue > 0)
  ) {
    throw new Error("Tenés que indicar cuántos días o meses dura el beneficio.");
  }

  if (
    ["forever", "one_time"].includes(effectiveBenefitDurationType) &&
    effectiveBenefitDurationValue !== undefined
  ) {
    updates.benefitDurationValue = null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "maxRedemptions")) {
    hasAnyField = true;
    const raw = input.maxRedemptions;
    if (raw == null || String(raw).trim() === "") {
      updates.maxRedemptions = null;
    } else {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("El máximo de usos debe ser un entero mayor a cero.");
      }
      updates.maxRedemptions = parsed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "expiresAt")) {
    hasAnyField = true;
    if (!input.expiresAt) {
      updates.expiresAt = null;
    } else {
      const parsed = new Date(input.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("La fecha de vencimiento del cupón no es válida.");
      }
      updates.expiresAt = parsed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "internalNote")) {
    hasAnyField = true;
    const internalNote = String(input.internalNote ?? "").trim();
    if (internalNote.length > 300) {
      throw new Error("La nota interna del cupón no puede superar los 300 caracteres.");
    }
    updates.internalNote = internalNote;
  }

  if (Object.prototype.hasOwnProperty.call(input, "isActive")) {
    hasAnyField = true;
    updates.isActive = Boolean(input.isActive);
  } else if (!partial) {
    updates.isActive = true;
  }

  const effectiveCategory =
    updates.couponCategory ??
    (partial ? null : "standard");
  const effectiveReferralOwnerName =
    updates.referralOwnerName ??
    (partial ? null : "");

  if (effectiveCategory === "referral" && !String(effectiveReferralOwnerName || "").trim()) {
    throw new Error("El nombre del referente es obligatorio para códigos de referido.");
  }

  return { updates, hasAnyField };
}

function serializeSubscriptionCoupon(coupon) {
  if (!coupon) return null;
  return {
    _id: String(coupon._id),
    code: coupon.code,
    plan: coupon.plan || null,
    couponCategory: coupon.couponCategory || "standard",
    referralOwnerName: coupon.referralOwnerName || "",
    discountType: coupon.discountType || "percentage",
    discountPercent: Number(coupon.discountPercent || 0),
    discountAmountUsdReference: Number(coupon.discountAmountUsdReference || 0),
    benefitDurationType: coupon.benefitDurationType || "forever",
    benefitDurationValue: coupon.benefitDurationValue ?? null,
    maxRedemptions: coupon.maxRedemptions ?? null,
    redemptionCount: Number(coupon.redemptionCount || 0),
    expiresAt: coupon.expiresAt || null,
    internalNote: coupon.internalNote || "",
    isActive: Boolean(coupon.isActive),
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt,
  };
}

function sanitizePlanPricingInput(input) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  const updates = {};
  let hasAnyField = false;

  const fields = [
    ["basicPriceArs", "El precio ARS del plan Básico no es válido."],
    ["basicPriceUsdReference", "La referencia USD del plan Básico no es válida."],
    ["proPriceArs", "El precio ARS del plan Pro no es válido."],
    ["proPriceUsdReference", "La referencia USD del plan Pro no es válida."],
  ];

  for (const [field, message] of fields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const parsed = Number(input[field]);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(message);
    }
    updates[field] = parsed;
    hasAnyField = true;
  }

  return { updates, hasAnyField };
}

function sanitizeNotificationSettingsInput(input) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  const updates = {};
  let hasAnyField = false;
  const allowedReminderMinutes = new Set([15, 30, 60, 120, 180, 1440]);

  if (Object.prototype.hasOwnProperty.call(input, "adminInstantBookingEnabled")) {
    hasAnyField = true;
    updates.adminInstantBookingEnabled = Boolean(input.adminInstantBookingEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(input, "barberInstantBookingEnabled")) {
    hasAnyField = true;
    updates.barberInstantBookingEnabled = Boolean(input.barberInstantBookingEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(input, "barberReminderEnabled")) {
    hasAnyField = true;
    updates.barberReminderEnabled = Boolean(input.barberReminderEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(input, "barberReminderMinutesBefore")) {
    hasAnyField = true;
    const parsed = Number(input.barberReminderMinutesBefore);
    if (!allowedReminderMinutes.has(parsed)) {
      throw new Error("El tiempo del recordatorio debe ser 15, 30, 60, 120, 180 o 1440 minutos.");
    }
    updates.barberReminderMinutesBefore = parsed;
  }

  if (Object.prototype.hasOwnProperty.call(input, "customerSameDayEmailEnabled")) {
    hasAnyField = true;
    updates.customerSameDayEmailEnabled = Boolean(input.customerSameDayEmailEnabled);
  }

  return { updates, hasAnyField };
}

function sanitizeBarberProfileSettingsInput(input) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  const updates = {};
  let hasAnyField = false;

  if (Object.prototype.hasOwnProperty.call(input, "barberSelfEditEnabled")) {
    hasAnyField = true;
    updates.barberSelfEditEnabled = Boolean(input.barberSelfEditEnabled);
  }

  return { updates, hasAnyField };
}

function sanitizeShopClosedDaysInput(input) {
  if (!input || typeof input !== "object") {
    return { updates: {}, hasAnyField: false };
  }

  if (!Object.prototype.hasOwnProperty.call(input, "shopClosedDays")) {
    return { updates: {}, hasAnyField: false };
  }

  return {
    updates: {
      shopClosedDays: normalizeShopClosedDays(input.shopClosedDays),
    },
    hasAnyField: true,
  };
}

async function buildAvailableSlug(baseValue) {
  const base = baseValue || "negocio";
  let candidate = base;
  let suffix = 1;
  while (await UserModel.exists({ shopSlug: candidate })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeRegistrationSource(value) {
  return String(value ?? "").trim().toLowerCase() === "mobile" ? "mobile" : "web";
}

async function buildAuthUserResponse(userDoc) {
  if (shouldNormalizeLegacyTrialToFree(userDoc?.subscription)) {
    userDoc.subscription = buildFreeSubscriptionPatch(userDoc.subscription);
    if (typeof userDoc.save === "function") {
      await userDoc.save();
    }
  }

  const userResponse = serializeAuthUser(userDoc);
  userResponse.businessType = normalizeBusinessType(userResponse.businessType);
  userResponse.businessTypeLabel = getBusinessTypeLabel(userResponse.businessType);

  if (userResponse.role !== "barber" || !userDoc?.shopOwnerId) {
    return userResponse;
  }

  const ownerDoc = await UserModel.findOne({
    _id: resolveEffectiveOwnerId(userDoc),
    isActive: true,
  })
    .select({
      shopSlug: 1,
      subscription: 1,
      themeConfig: 1,
      publicProfile: 1,
      barberProfileSettings: 1,
      businessType: 1,
      registrationSource: 1,
    })
    .lean();

  if (ownerDoc?.shopSlug) {
    userResponse.shopSlug = ownerDoc.shopSlug;
  }

  if (ownerDoc?.subscription) {
    userResponse.subscription = ownerDoc.subscription;
  }

  if (ownerDoc?.themeConfig) {
    userResponse.themeConfig = ownerDoc.themeConfig;
  }

  if (ownerDoc?.publicProfile) {
    userResponse.publicProfile = ownerDoc.publicProfile;
  }

  if (ownerDoc?.barberProfileSettings) {
    userResponse.barberProfileSettings = ownerDoc.barberProfileSettings;
  }

  if (ownerDoc?.businessType) {
    userResponse.businessType = normalizeBusinessType(ownerDoc.businessType);
    userResponse.businessTypeLabel = getBusinessTypeLabel(ownerDoc.businessType);
  }

  if (ownerDoc?.registrationSource) {
    userResponse.registrationSource = ownerDoc.registrationSource;
  }

  return userResponse;
}

export async function registerUser(req, res, next) {
  try {
    const fullName = String(req.body?.fullName ?? "").trim();
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const businessTypeRaw = String(req.body?.businessType ?? "").trim().toLowerCase();
    const requestedSlugRaw = String(req.body?.shopSlug ?? "").trim();
    const requestedSlug = requestedSlugRaw ? normalizeSlugCandidate(requestedSlugRaw) : "";
    const registrationSource = normalizeRegistrationSource(req.body?.registrationSource);

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "fullName, email y password son obligatorios" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "El password debe tener al menos 8 caracteres" });
    }
    if (businessTypeRaw && !isValidBusinessType(businessTypeRaw)) {
      return res.status(400).json({ error: "El rubro seleccionado no es valido." });
    }
    if (requestedSlugRaw && !requestedSlug) {
      return res
        .status(400)
        .json({ error: "shopSlug solo puede incluir letras, números y guiones." });
    }

    const businessType = normalizeBusinessType(businessTypeRaw);
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Ya existe un usuario con ese email" });
    }

    const passwordHash = await hashPassword(password);
    const fallbackSlug = normalizeSlugCandidate(fullName) || "negocio";
    let shopSlug = requestedSlug || fallbackSlug;
    const slugExists = await UserModel.exists({ shopSlug });
    if (slugExists) {
      if (requestedSlug) {
        return res.status(409).json({ error: "El enlace público ya está en uso." });
      }
      shopSlug = await buildAvailableSlug(fallbackSlug);
    }

    const userDoc = await UserModel.create({
      fullName,
      businessType,
      shopSlug,
      email,
      passwordHash,
      registrationSource,
      subscription: {
        plan: "free",
        status: "active",
        billingCycle: null,
        renewalMode: "manual",
        startedAt: new Date(),
      },
      // no aceptar role desde el cliente
    });

    const token = signAccessToken({
      sub: userDoc._id.toString(),
      email: userDoc.email,
      role: normalizeAppRole(userDoc.role),
    });

    const userResponse = await buildAuthUserResponse(userDoc);

    return res.status(201).json({
      message: "Usuario registrado correctamente",
      token,
      user: userResponse,
    });
  } catch (err) {
    return next(err);
  }
}

export async function createSubscriptionCheckout(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const plan = String(req.body?.plan ?? "").trim();
    const planConfig = SUBSCRIPTION_PLAN_CONFIG[plan];
    if (!planConfig) {
      return res.status(400).json({ error: "El plan seleccionado no es válido." });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(404).json({ error: "No encontramos la cuenta." });
    }

    const currentProvider = normalizeSubscriptionProvider(userDoc.subscription?.provider);
    if (isStoreSubscriptionProvider(currentProvider)) {
      return res.status(409).json({
        error: getChannelConflictMessage(currentProvider),
        code: "SUBSCRIPTION_CHANNEL_LOCKED",
        provider: currentProvider,
      });
    }

    const pricingDoc = await getOrCreatePlanPricing();
    const pricing = serializePlanPricing(pricingDoc);
    const resolvedPricing = resolvePlanPricingForSubscription({
      plan,
      pricing,
      subscription: userDoc.subscription,
    });
    const amount =
      SUBSCRIPTION_CURRENCY_ID === "USD"
        ? Number(resolvedPricing.effectiveUsdReference || 0)
        : Number(resolvedPricing.effectiveArs || 0);

    if (!(amount > 0)) {
      return res.status(400).json({ error: "El plan no tiene un precio configurado." });
    }

    const externalReference = `subscription:${userDoc._id.toString()}:${plan}:${Date.now()}`;
    const returnUrls = buildMercadoPagoSubscriptionReturnUrls();
    const preference = await createMercadoPagoSystemPreference({
      payload: {
        items: [
          {
            id: `${plan}-monthly`,
            title: planConfig.title,
            description: planConfig.description,
            quantity: 1,
            currency_id: SUBSCRIPTION_CURRENCY_ID,
            unit_price: amount,
          },
        ],
        payer: userDoc.email
          ? {
              email: userDoc.email,
              name: userDoc.fullName,
            }
          : undefined,
        external_reference: externalReference,
        notification_url: `${buildMercadoPagoSubscriptionWebhookUrl()}?userId=${userDoc._id.toString()}`,
        back_urls: returnUrls,
        auto_return: "approved",
        metadata: {
          user_id: userDoc._id.toString(),
          plan,
          billing_cycle: planConfig.billingCycle,
          subscription_type: "barberapp_plan",
        },
      },
    });

    userDoc.subscription = {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      pendingPlan: plan,
      provider: "mercadopago",
      mercadoPagoPreferenceId: preference.id || null,
    };
    await userDoc.save();

    return res.json({
      checkoutUrl: preference.init_point || null,
      sandboxCheckoutUrl: preference.sandbox_init_point || null,
      preferenceId: preference.id || null,
      amount,
      currencyId: SUBSCRIPTION_CURRENCY_ID,
      discountApplied: resolvedPricing.discountApplied,
    });
  } catch (err) {
    return next(err);
  }
}

export async function syncStoreSubscription(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(404).json({ error: "No encontramos la cuenta." });
    }

    const {
      provider,
      plan,
      productId,
      currentPlanId,
      purchaseToken,
      transactionId,
      originalTransactionId,
      environment,
      autoRenewing,
      status,
      expiresAt,
    } = sanitizeStoreSubscriptionSyncInput(req.body ?? {});

    const currentProvider = normalizeSubscriptionProvider(userDoc.subscription?.provider);
    if (currentProvider && currentProvider !== provider) {
      return res.status(409).json({
        error: getChannelConflictMessage(currentProvider),
        code: "SUBSCRIPTION_CHANNEL_LOCKED",
        provider: currentProvider,
      });
    }

    const nextStatus = status === "cancelled" ? "cancelled" : status === "past_due" ? "past_due" : "active";
    const startedAt = userDoc.subscription?.startedAt || new Date();

    userDoc.subscription = {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      plan,
      status: nextStatus,
      billingCycle: "monthly",
      renewalMode: autoRenewing ? "automatic" : "manual",
      provider,
      customPriceArs: null,
      customPriceUsdReference: null,
      couponCode: null,
      couponDiscountType: null,
      couponDiscountPercent: null,
      couponDiscountAmountUsdReference: null,
      couponBenefitDurationType: null,
      couponBenefitDurationValue: null,
      couponAppliedAt: null,
      couponValidUntil: null,
      pendingCouponCode: null,
      pendingCouponDiscountType: null,
      pendingCouponDiscountPercent: null,
      pendingCouponDiscountAmountUsdReference: null,
      pendingCouponBenefitDurationType: null,
      pendingCouponBenefitDurationValue: null,
      startedAt,
      expiresAt,
      nextBillingAt: autoRenewing ? expiresAt : null,
      pendingPlan: null,
      mercadoPagoPreferenceId: null,
      mercadoPagoPreapprovalId: null,
      mercadoPagoPreapprovalStatus: null,
      mercadoPagoPreapprovalAmountArs: null,
      storeProductId: productId,
      storeCurrentPlanId: currentPlanId,
      storePurchaseToken: purchaseToken,
      storeTransactionId: transactionId,
      storeOriginalTransactionId: originalTransactionId,
      storeEnvironment: environment,
      storeLastSyncedAt: new Date(),
      storeAutoRenewing: autoRenewing,
      storeStatus: status,
      lastPaymentAt: nextStatus === "active" ? new Date() : userDoc.subscription?.lastPaymentAt || null,
      cancelledAt: nextStatus === "cancelled" ? new Date() : null,
      pastDueAt: nextStatus === "past_due" ? new Date() : null,
    };

    await userDoc.save();

    return res.json({
      message: "Suscripción sincronizada correctamente.",
      user: await buildAuthUserResponse(userDoc),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function loginUser(req, res, next) {
  try {
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      return res.status(400).json({ error: "email y password son obligatorios" });
    }

    const userDoc = await UserModel.findOne({ email, isActive: true }).select("+passwordHash");
    if (!userDoc) return res.status(401).json({ error: "Credenciales inválidas" });

    const isValidPassword = await verifyPassword(password, userDoc.passwordHash);
    if (!isValidPassword) return res.status(401).json({ error: "Credenciales inválidas" });

    // Aseguramos el slug
    if (!userDoc.shopSlug) {
      const fallbackSlug = normalizeSlugCandidate(userDoc.fullName) || "negocio";
      userDoc.shopSlug = await buildAvailableSlug(fallbackSlug);
    }

    userDoc.lastLoginAt = new Date();
    await userDoc.save();

    const token = signAccessToken({
      sub: userDoc._id.toString(),
      email: userDoc.email,
      role: normalizeAppRole(userDoc.role),
    });

    const userResponse = await buildAuthUserResponse(userDoc);

    return res.json({
      message: "Login exitoso",
      token,
      user: userResponse,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    if (!userDoc.shopSlug) {
      const fallbackSlug = normalizeSlugCandidate(userDoc.fullName) || "negocio";
      userDoc.shopSlug = await buildAvailableSlug(fallbackSlug);
      await userDoc.save();
    }

    return res.json({
      user: await buildAuthUserResponse(userDoc),
    });
  } catch (err) {
    return next(err);
  }
}

export async function upsertBarberAccess(req, res, next) {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const barberId = String(req.body?.barberId ?? "").trim();
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");

    if (!barberId) {
      return res.status(400).json({ error: "Falta el barbero a vincular." });
    }

    if (!email) {
      return res.status(400).json({ error: "El email del acceso es obligatorio." });
    }

    const ownerDoc = await UserModel.findById(ownerId)
      .select({ shopSlug: 1, businessType: 1 })
      .lean();

    if (!ownerDoc || !ownerDoc.shopSlug) {
      return res.status(404).json({ error: "No encontramos la barbería administradora." });
    }

    const barberDoc = await BarberModel.findOne({ _id: barberId, owner: ownerId, isActive: true })
      .select({ fullName: 1 })
      .lean();

    if (!barberDoc) {
      return res.status(404).json({ error: "Barbero no encontrado." });
    }

    const existingAccessUser = await UserModel.findOne({
      shopOwnerId: ownerId,
      barberId,
    }).select("+passwordHash");

    const emailTakenByAnotherUser = await UserModel.findOne({
      email,
      _id: { $ne: existingAccessUser?._id || null },
    }).lean();

    if (emailTakenByAnotherUser) {
      return res.status(409).json({ error: "Ese email ya está en uso por otra cuenta." });
    }

    if (!existingAccessUser && password.length < 8) {
      return res.status(400).json({
        error: "La contraseña inicial del barbero debe tener al menos 8 caracteres.",
      });
    }

    if (existingAccessUser) {
      existingAccessUser.fullName = barberDoc.fullName;
      existingAccessUser.email = email;
      existingAccessUser.role = "barber";
      existingAccessUser.barberId = barberId;
      existingAccessUser.shopOwnerId = ownerId;
      existingAccessUser.isActive = true;

      if (password) {
        if (password.length < 8) {
          return res.status(400).json({
            error: "La nueva contraseña del barbero debe tener al menos 8 caracteres.",
          });
        }
        existingAccessUser.passwordHash = await hashPassword(password);
      }

      await existingAccessUser.save();

      return res.json({
        message: "Acceso del barbero actualizado correctamente.",
        barberAccess: {
          enabled: true,
          userId: existingAccessUser._id.toString(),
          email: existingAccessUser.email,
          barberId,
        },
      });
    }

    const baseSlug =
      normalizeSlugCandidate(`${ownerDoc.shopSlug}-${barberDoc.fullName}`) ||
      normalizeSlugCandidate(`${ownerDoc.shopSlug}-barber`) ||
      "equipo";
    const shopSlug = await buildAvailableSlug(baseSlug);

    const passwordHash = await hashPassword(password);
    const barberUser = await UserModel.create({
      fullName: barberDoc.fullName,
      businessType: normalizeBusinessType(ownerDoc?.businessType),
      shopSlug,
      email,
      passwordHash,
      role: "barber",
      barberId,
      shopOwnerId: ownerId,
      registrationSource: ownerDoc?.registrationSource || null,
      subscription: {
        plan: "basic",
        status: "active",
        billingCycle: "monthly",
        startedAt: new Date(),
      },
    });

    return res.status(201).json({
      message: "Acceso del barbero creado correctamente.",
      barberAccess: {
        enabled: true,
        userId: barberUser._id.toString(),
        email: barberUser.email,
        barberId,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function disableBarberAccess(req, res, next) {
  try {
    const ownerId = req.user?.id;
    const barberId = String(req.params?.barberId ?? "").trim();

    if (!ownerId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    if (!barberId) {
      return res.status(400).json({ error: "Falta el barbero a desvincular." });
    }

    const accessUser = await UserModel.findOne({
      shopOwnerId: ownerId,
      barberId,
      role: "barber",
      isActive: true,
    });

    if (!accessUser) {
      return res.status(404).json({ error: "Ese barbero no tiene un acceso activo." });
    }

    accessUser.isActive = false;
    accessUser.pushToken = null;
    await accessUser.save();

    return res.json({
      message: "El acceso del barbero quedó desactivado.",
      barberAccess: {
        enabled: false,
        barberId,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function getMercadoPagoConnectionStatus(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId)
      .select("+mercadoPagoAuth")
      .lean();

    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    return res.json({
      mercadoPago: buildMercadoPagoConnectionPayload(userDoc),
    });
  } catch (err) {
    return next(err);
  }
}

export async function getMercadoPagoConnectUrl(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    getMercadoPagoConfig();
    const pkce = createMercadoPagoPkcePair();
    const state = buildMercadoPagoStateToken(userId, {
      codeVerifier: pkce.codeVerifier,
    });
    const authUrl = buildMercadoPagoOAuthUrl({
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
    });

    return res.json({ authUrl });
  } catch (err) {
    return next(err);
  }
}

export async function handleMercadoPagoOAuthCallback(req, res, next) {
  try {
    const errorCode = String(req.query?.error ?? "").trim();
    const errorDescription = String(req.query?.error_description ?? "").trim();
    const code = String(req.query?.code ?? "").trim();
    const state = String(req.query?.state ?? "").trim();

    if (errorCode) {
      return res
        .status(400)
        .send(
          buildMercadoPagoCallbackHtml({
            success: false,
            title: "No se pudo conectar Mercado Pago",
            message: errorDescription || errorCode,
          }),
        );
    }

    if (!code || !state) {
      return res
        .status(400)
        .send(
          buildMercadoPagoCallbackHtml({
            success: false,
            title: "Falta información para completar la conexión",
            message: "Mercado Pago no devolvió el código de autorización esperado.",
          }),
        );
    }

    const payload = verifyAccessToken(state);
    if (!payload?.sub || payload?.type !== "mp_oauth") {
      return res
        .status(400)
        .send(
          buildMercadoPagoCallbackHtml({
            success: false,
            title: "La conexión venció o no es válida",
            message: "Volvé a iniciar la conexión desde la pantalla de Cobros.",
          }),
        );
    }

    const userDoc = await UserModel.findById(payload.sub).select("+mercadoPagoAuth");
    if (!userDoc || userDoc.isActive === false) {
      return res
        .status(404)
        .send(
          buildMercadoPagoCallbackHtml({
            success: false,
            title: "No encontramos la barbería",
            message: "La cuenta usada para conectar Mercado Pago ya no está disponible.",
          }),
        );
    }

    const tokenResponse = await exchangeMercadoPagoCode({
      code,
      codeVerifier: payload.codeVerifier,
    });
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000)
      : null;

    userDoc.mercadoPagoAuth = {
      accessToken: tokenResponse.access_token || null,
      refreshToken: tokenResponse.refresh_token || null,
      userId: tokenResponse.user_id ? String(tokenResponse.user_id) : null,
      publicKey: tokenResponse.public_key || null,
      scope: tokenResponse.scope || null,
      expiresAt,
      linkedAt: new Date(),
      lastRefreshAt: new Date(),
    };

    userDoc.paymentSettings = {
      ...(userDoc.paymentSettings?.toObject?.() ?? userDoc.paymentSettings ?? {}),
      mercadoPagoConnectionStatus: "connected",
      mercadoPagoSellerId: tokenResponse.user_id ? String(tokenResponse.user_id) : null,
      mercadoPagoPublicKey: tokenResponse.public_key || null,
    };

    await userDoc.save();

    return res
      .status(200)
      .send(
        buildMercadoPagoCallbackHtml({
          success: true,
          title: "Mercado Pago conectado",
          message: "La cuenta quedó vinculada a tu barbería. Ya podés volver a la app y ofrecer cobro adelantado real.",
        }),
      );
  } catch (err) {
    return next(err);
  }
}

export async function disconnectMercadoPago(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId).select("+mercadoPagoAuth");
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    userDoc.mercadoPagoAuth = null;
    userDoc.paymentSettings = {
      ...(userDoc.paymentSettings?.toObject?.() ?? userDoc.paymentSettings ?? {}),
      mercadoPagoConnectionStatus: "disconnected",
      mercadoPagoSellerId: null,
      mercadoPagoPublicKey: null,
    };

    await userDoc.save();

    return res.json({
      message: "Mercado Pago desconectado.",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateThemeConfig(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const { updates, hasAnyField } = sanitizeThemeConfigInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios de tema para guardar." });
    }
    const persistedUpdates = await persistThemeMediaUpdates({
      ownerId: userDoc._id,
      updates,
    });

    userDoc.themeConfig = {
      ...(userDoc.themeConfig?.toObject?.() ?? userDoc.themeConfig ?? {}),
      ...persistedUpdates,
    };

    await userDoc.save();

    return res.json({
      message: "Tema guardado correctamente",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updatePublicProfile(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const { updates, hasAnyField } = sanitizePublicProfileInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron datos públicos para guardar." });
    }

    userDoc.publicProfile = {
      ...(userDoc.publicProfile?.toObject?.() ?? userDoc.publicProfile ?? {}),
      ...updates,
    };

    await userDoc.save();

    return res.json({
      message: "Datos públicos guardados correctamente",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updatePaymentSettings(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const { updates, hasAnyField } = sanitizePaymentSettingsInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios de cobro para guardar." });
    }

    userDoc.paymentSettings = {
      ...(userDoc.paymentSettings?.toObject?.() ?? userDoc.paymentSettings ?? {}),
      ...updates,
    };

    await userDoc.save();

    return res.json({
      message: "Configuración de cobro guardada correctamente",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updateNotificationSettings(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const { updates, hasAnyField } = sanitizeNotificationSettingsInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios de notificaciones para guardar." });
    }

    userDoc.notificationSettings = {
      ...(userDoc.notificationSettings?.toObject?.() ?? userDoc.notificationSettings ?? {}),
      ...updates,
    };

    await userDoc.save();

    return res.json({
      message: "Notificaciones guardadas correctamente",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updateBarberProfileSettings(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    if (normalizeAppRole(userDoc.role) !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede cambiar este ajuste." });
    }

    const { updates, hasAnyField } = sanitizeBarberProfileSettingsInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios del perfil del barbero para guardar." });
    }

    userDoc.barberProfileSettings = {
      ...(userDoc.barberProfileSettings?.toObject?.() ?? userDoc.barberProfileSettings ?? {}),
      ...updates,
    };

    await userDoc.save();

    return res.json({
      message: "Configuración del perfil del barbero guardada correctamente",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updateShopClosedDays(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const { updates, hasAnyField } = sanitizeShopClosedDaysInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios de cierre para guardar." });
    }

    userDoc.shopClosedDays = updates.shopClosedDays;
    await userDoc.save();

    return res.json({
      message: "Los cierres del local se guardaron correctamente.",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updateOwnSubscriptionSettings(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const { updates, hasAnyField } = sanitizeSubscriptionInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios de suscripción para guardar." });
    }

    if (
      updates.renewalMode === "manual" &&
      userDoc.subscription?.renewalMode === "automatic" &&
      userDoc.subscription?.mercadoPagoPreapprovalId
    ) {
      try {
        await updateMercadoPagoSystemPreapproval({
          preapprovalId: userDoc.subscription.mercadoPagoPreapprovalId,
          payload: { status: "cancelled" },
        });
      } catch (err) {
        console.error("No se pudo cancelar la renovación automática en Mercado Pago:", err?.message || err);
      }

      updates.mercadoPagoPreapprovalStatus = "cancelled";
      updates.mercadoPagoPreapprovalId = null;
      updates.mercadoPagoPreapprovalAmountArs = null;
      updates.nextBillingAt = null;
    }

    userDoc.subscription = {
      ...(userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {}),
      ...updates,
    };

    await userDoc.save();

    return res.json({
      message: "Configuración de suscripción guardada correctamente.",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

function getGooglePlacesApiKey() {
  return String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
}

async function fetchGooglePlacesJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload || payload.status === "REQUEST_DENIED") {
    throw new Error(payload?.error_message || "Google Places no respondió correctamente.");
  }

  return payload;
}

export async function searchGooglePlaces(req, res, next) {
  try {
    const apiKey = getGooglePlacesApiKey();
    if (!apiKey) {
      return res.status(503).json({
        error: "GOOGLE_PLACES_API_KEY no está configurada.",
        code: "GOOGLE_PLACES_API_KEY_MISSING",
      });
    }

    const query = String(req.query?.query || "").trim();
    if (query.length < 3) {
      return res.status(400).json({ error: "Escribí al menos 3 caracteres para buscar." });
    }

    const params = new URLSearchParams({
      query,
      key: apiKey,
      language: "es",
    });
    const payload = await fetchGooglePlacesJson(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
    );

    return res.json({
      results: (payload.results || []).slice(0, 8).map((place) => ({
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address || null,
        googleRating: Number(place.rating || 0) > 0 ? Number(place.rating) : null,
        googleReviewCount:
          Number(place.user_ratings_total || 0) > 0 ? Number(place.user_ratings_total) : null,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

export async function selectGooglePlace(req, res, next) {
  try {
    const apiKey = getGooglePlacesApiKey();
    if (!apiKey) {
      return res.status(503).json({
        error: "GOOGLE_PLACES_API_KEY no está configurada.",
        code: "GOOGLE_PLACES_API_KEY_MISSING",
      });
    }

    const userId = req.user?.id;
    const placeId = String(req.body?.placeId || "").trim();
    if (!userId) return res.status(401).json({ error: "Usuario no autorizado" });
    if (!placeId) return res.status(400).json({ error: "Falta el Place ID de Google." });

    const params = new URLSearchParams({
      place_id: placeId,
      fields: "place_id,name,rating,user_ratings_total,url",
      key: apiKey,
      language: "es",
    });
    const payload = await fetchGooglePlacesJson(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
    );
    const place = payload.result || {};

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const mapsUrl =
      place.url || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
    userDoc.publicProfile = {
      ...(userDoc.publicProfile?.toObject?.() ?? userDoc.publicProfile ?? {}),
      googlePlaceId: place.place_id || placeId,
      googleRating: Number(place.rating || 0) > 0 ? Number(place.rating) : null,
      googleReviewCount:
        Number(place.user_ratings_total || 0) > 0 ? Number(place.user_ratings_total) : null,
      googleMapsUrl: mapsUrl,
      googleReviewsUrl: mapsUrl,
    };

    await userDoc.save();

    return res.json({
      message: "Perfil de Google vinculado correctamente.",
      user: userDoc.toJSON(),
    });
  } catch (err) {
    return next(err);
  }
}

export async function requestAccountDeletion(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const { reason } = sanitizeAccountDeletionRequestInput(req.body ?? {});
    const existingRequest = userDoc.accountDeletionRequest ?? null;
    const alreadyPending = existingRequest?.status === "pending";

    userDoc.accountDeletionRequest = {
      status: "pending",
      requestedAt: existingRequest?.requestedAt || new Date(),
      reason,
      contactEmail: sanitizeEmail(userDoc.email),
      handledAt: null,
    };

    await userDoc.save();

    const requestedAtLabel = new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Argentina/Cordoba",
    }).format(userDoc.accountDeletionRequest.requestedAt);

    try {
      await sendAppMail({
        to: SUPPORT_CONTACT_EMAIL,
        subject: `Solicitud de eliminación de cuenta - ${userDoc.fullName || userDoc.email}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
            <h2 style="margin-bottom: 8px;">Solicitud de eliminación de cuenta</h2>
            <p><strong>Cuenta:</strong> ${userDoc.fullName || "Sin nombre"}</p>
            <p><strong>Email:</strong> ${userDoc.email}</p>
            <p><strong>Shop slug:</strong> ${userDoc.shopSlug}</p>
            <p><strong>Fecha:</strong> ${requestedAtLabel}</p>
            <p><strong>Motivo:</strong> ${reason || "Sin motivo especificado"}</p>
          </div>
        `,
        text: `Solicitud de eliminación de cuenta\nCuenta: ${userDoc.fullName || "Sin nombre"}\nEmail: ${userDoc.email}\nShop slug: ${userDoc.shopSlug}\nFecha: ${requestedAtLabel}\nMotivo: ${reason || "Sin motivo especificado"}`,
      });
    } catch (mailError) {
      console.error("No se pudo enviar el mail de solicitud de eliminación:", mailError?.message || mailError);
    }

    return res.json({
      message: alreadyPending
        ? "Tu solicitud ya estaba pendiente. La dejamos actualizada."
        : "Recibimos tu solicitud de eliminación. Soporte la va a revisar.",
      user: serializeAuthUser(userDoc),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function getPlanPricingAdmin(req, res, next) {
  try {
    const pricingDoc = await getOrCreatePlanPricing();
    return res.json({ pricing: serializePlanPricing(pricingDoc) });
  } catch (err) {
    return next(err);
  }
}

export async function listSubscriptionCouponsAdmin(req, res, next) {
  try {
    const coupons = await SubscriptionCouponModel.find({})
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      coupons: coupons.map(serializeSubscriptionCoupon),
    });
  } catch (err) {
    return next(err);
  }
}

export async function createSubscriptionCouponAdmin(req, res, next) {
  try {
    const { updates } = sanitizeSubscriptionCouponInput(req.body ?? {});

    const existing = await SubscriptionCouponModel.findOne({ code: updates.code }).lean();
    if (existing) {
      return res.status(409).json({ error: "Ya existe un cupón con ese código." });
    }

    const coupon = await SubscriptionCouponModel.create(updates);

    return res.status(201).json({
      message: "Cupón creado correctamente.",
      coupon: serializeSubscriptionCoupon(coupon.toJSON()),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updateSubscriptionCouponAdmin(req, res, next) {
  try {
    const couponId = String(req.params?.couponId || "").trim();
    if (!couponId) {
      return res.status(400).json({ error: "Falta el cupón a actualizar." });
    }

    const { updates, hasAnyField } = sanitizeSubscriptionCouponInput(req.body ?? {}, {
      partial: true,
    });
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios del cupón para guardar." });
    }

    if (updates.code) {
      const existing = await SubscriptionCouponModel.findOne({
        code: updates.code,
        _id: { $ne: couponId },
      }).lean();
      if (existing) {
        return res.status(409).json({ error: "Ya existe otro cupón con ese código." });
      }
    }

    const coupon = await SubscriptionCouponModel.findByIdAndUpdate(
      couponId,
      updates,
      { new: true },
    ).lean();

    if (!coupon) {
      return res.status(404).json({ error: "Cupón no encontrado." });
    }

    return res.json({
      message: "Cupón actualizado correctamente.",
      coupon: serializeSubscriptionCoupon(coupon),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function deleteSubscriptionCouponAdmin(req, res, next) {
  try {
    const couponId = String(req.params?.couponId || "").trim();
    if (!couponId) {
      return res.status(400).json({ error: "Falta el cupón a borrar." });
    }

    const coupon = await SubscriptionCouponModel.findByIdAndDelete(couponId).lean();

    if (!coupon) {
      return res.status(404).json({ error: "Cupón no encontrado." });
    }

    return res.json({
      message: "Cupón borrado correctamente.",
      coupon: serializeSubscriptionCoupon(coupon),
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updatePlanPricingAdmin(req, res, next) {
  try {
    const { updates, hasAnyField } = sanitizePlanPricingInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios de precios para guardar." });
    }

    const pricingDoc = await getOrCreatePlanPricing();
    const previousPricing = serializePlanPricing(pricingDoc);
    Object.assign(pricingDoc, updates);
    await pricingDoc.save();
    const nextPricing = serializePlanPricing(pricingDoc);

    const changedPlans = ["basic", "pro"].filter((plan) => {
      const previousAmount = Number(previousPricing?.[plan]?.ars || 0);
      const nextAmount = Number(nextPricing?.[plan]?.ars || 0);
      return previousAmount > 0 && nextAmount > 0 && previousAmount !== nextAmount;
    });

    let notifiedUsers = 0;
    if (changedPlans.length) {
      const usersToNotify = await UserModel.find({
        "subscription.status": "active",
        "subscription.plan": { $in: changedPlans },
        $and: [
          {
            $or: [
              { "subscription.customPriceArs": null },
              { "subscription.customPriceArs": { $exists: false } },
              { "subscription.customPriceArs": 0 },
            ],
          },
          {
            $or: [
              { "subscription.customPriceUsdReference": null },
              { "subscription.customPriceUsdReference": { $exists: false } },
              { "subscription.customPriceUsdReference": 0 },
            ],
          },
        ],
      }).select({
        email: 1,
        fullName: 1,
        pushToken: 1,
        subscription: 1,
      });

      const results = await Promise.allSettled(
        usersToNotify.map(async (userDoc) => {
          const plan = String(userDoc.subscription?.plan || "").trim();
          if (!changedPlans.includes(plan)) return false;

          await notifySubscriptionPriceChange({
            userDoc,
            plan,
            previousAmountArs: previousPricing[plan]?.ars,
            nextAmountArs: nextPricing[plan]?.ars,
            effectiveAt: userDoc.subscription?.nextBillingAt || userDoc.subscription?.expiresAt || null,
          });
          return true;
        }),
      );

      notifiedUsers = results.filter((result) => result.status === "fulfilled" && result.value).length;
    }

    return res.json({
      message: "Precios actualizados correctamente.",
      pricing: serializePlanPricing(pricingDoc),
      notifiedUsers,
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function listSubscriptionUsers(req, res, next) {
  try {
    const search = String(req.query?.search ?? "").trim().toLowerCase();

    const users = await UserModel.find({ isActive: { $ne: false } })
      .sort({ createdAt: -1 })
      .select({
        fullName: 1,
        email: 1,
        shopSlug: 1,
        role: 1,
        barberId: 1,
        shopOwnerId: 1,
        isActive: 1,
        createdAt: 1,
        subscription: 1,
      })
      .lean();

    const ownerUsers = users.filter((user) => user.role !== "barber" || !user.shopOwnerId);
    const ownerIds = ownerUsers.map((user) => user._id);
    const barbers = await BarberModel.find({ owner: { $in: ownerIds } })
      .sort({ createdAt: -1 })
      .select({
        owner: 1,
        fullName: 1,
        email: 1,
        phone: 1,
        isActive: 1,
        createdAt: 1,
      })
      .lean();

    const usersByOwnerId = new Map();
    users.forEach((user) => {
      const ownerId = user.shopOwnerId ? String(user.shopOwnerId) : String(user._id);
      const current = usersByOwnerId.get(ownerId) || [];
      current.push(user);
      usersByOwnerId.set(ownerId, current);
    });

    const barbersByOwnerId = new Map();
    barbers.forEach((barber) => {
      const ownerId = String(barber.owner);
      const current = barbersByOwnerId.get(ownerId) || [];
      current.push(barber);
      barbersByOwnerId.set(ownerId, current);
    });

    const serializeAdminPanelUser = (user) => ({
      _id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      shopSlug: user.shopSlug,
      role: user.role,
      barberId: user.barberId ? String(user.barberId) : null,
      shopOwnerId: user.shopOwnerId ? String(user.shopOwnerId) : null,
      isActive: Boolean(user.isActive),
      createdAt: user.createdAt,
      subscription: user.subscription ?? {
        plan: "free",
        status: "active",
        billingCycle: null,
        renewalMode: "manual",
        startedAt: null,
        expiresAt: null,
      },
    });

    const shops = ownerUsers.map((owner) => {
      const ownerId = String(owner._id);
      const staffUsers = (usersByOwnerId.get(ownerId) || []).filter(
        (user) => String(user._id) !== ownerId,
      );
      const staffByBarberId = new Map(
        staffUsers
          .filter((user) => user.barberId)
          .map((user) => [String(user.barberId), serializeAdminPanelUser(user)]),
      );

      return {
        owner: serializeAdminPanelUser(owner),
        staffUsers: staffUsers.map(serializeAdminPanelUser),
        barbers: (barbersByOwnerId.get(ownerId) || []).map((barber) => ({
          _id: String(barber._id),
          fullName: barber.fullName,
          email: barber.email,
          phone: barber.phone,
          isActive: Boolean(barber.isActive),
          createdAt: barber.createdAt,
          accessUser: staffByBarberId.get(String(barber._id)) || null,
        })),
      };
    });

    const filteredShops = shops.filter((shop) => {
      if (!search) return true;
      const searchableValues = [
        shop.owner.fullName,
        shop.owner.email,
        shop.owner.shopSlug,
        ...shop.staffUsers.flatMap((user) => [user.fullName, user.email, user.shopSlug]),
        ...shop.barbers.flatMap((barber) => [barber.fullName, barber.email, barber.phone]),
      ];
      return searchableValues
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });

    const filtered = filteredShops.flatMap((shop) => [
      shop.owner,
      ...shop.staffUsers,
    ]);

    return res.json({
      users: filtered,
      shops: filteredShops,
    });
  } catch (err) {
    return next(err);
  }
}

export async function deleteAdminUser(req, res, next) {
  try {
    const userId = String(req.params?.userId ?? "").trim();
    if (!userId) {
      return res.status(400).json({ error: "Falta la cuenta a borrar." });
    }

    const userDoc = await UserModel.findById(userId).lean();
    if (!userDoc) {
      return res.status(404).json({ error: "No encontramos esa cuenta." });
    }

    const ownerId = userDoc.shopOwnerId ? String(userDoc.shopOwnerId) : String(userDoc._id);
    const deletedCounts = {
      users: 0,
      barbers: 0,
      appointments: 0,
      services: 0,
      shops: 0,
    };

    if (userDoc.role === "barber") {
      const barberId = userDoc.barberId || null;

      if (barberId) {
        const appointmentsResult = await AppointmentModel.deleteMany({
          owner: ownerId,
          barber: barberId,
        });
        const barberResult = await BarberModel.deleteOne({
          _id: barberId,
          owner: ownerId,
        });
        deletedCounts.appointments = appointmentsResult.deletedCount || 0;
        deletedCounts.barbers = barberResult.deletedCount || 0;
      }

      const userResult = await UserModel.deleteOne({ _id: userDoc._id });
      deletedCounts.users = userResult.deletedCount || 0;
    } else {
      const [usersResult, barbersResult, appointmentsResult, servicesResult, shopsResult] =
        await Promise.all([
          UserModel.deleteMany({ $or: [{ _id: userDoc._id }, { shopOwnerId: userDoc._id }] }),
          BarberModel.deleteMany({ owner: userDoc._id }),
          AppointmentModel.deleteMany({ owner: userDoc._id }),
          ServiceModel.deleteMany({ owner: userDoc._id }),
          ShopModel.deleteMany({ owner: userDoc._id }),
        ]);

      deletedCounts.users = usersResult.deletedCount || 0;
      deletedCounts.barbers = barbersResult.deletedCount || 0;
      deletedCounts.appointments = appointmentsResult.deletedCount || 0;
      deletedCounts.services = servicesResult.deletedCount || 0;
      deletedCounts.shops = shopsResult.deletedCount || 0;
    }

    return res.json({
      message:
        userDoc.role === "barber"
          ? "Cuenta de empleado/barbero borrada correctamente."
          : "Barbería, cuenta administradora y datos asociados borrados correctamente.",
      deletedCount: Object.values(deletedCounts).reduce((total, count) => total + count, 0),
      deletedCounts,
      deletedUserId: String(userDoc._id),
      ownerId,
      deletedRole: userDoc.role || "admin",
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateSubscriptionUser(req, res, next) {
  try {
    const userId = String(req.params?.userId ?? "").trim();
    if (!userId) {
      return res.status(400).json({ error: "Falta el usuario a actualizar." });
    }

    const { updates, hasAnyField } = sanitizeSubscriptionInput(req.body ?? {});
    if (!hasAnyField) {
      return res.status(400).json({ error: "No llegaron cambios de suscripción para guardar." });
    }

    const userDoc = await UserModel.findById(userId);
    if (!userDoc) {
      return res.status(404).json({ error: "No encontramos esa cuenta." });
    }

    const currentSubscription = userDoc.subscription?.toObject?.() ?? userDoc.subscription ?? {};
    const effectiveRenewalMode = updates.renewalMode || currentSubscription.renewalMode || "manual";
    const hasExpiresAtUpdate = Object.prototype.hasOwnProperty.call(updates, "expiresAt");
    const hasRenewalModeUpdate = Object.prototype.hasOwnProperty.call(updates, "renewalMode");

    if (hasExpiresAtUpdate || hasRenewalModeUpdate) {
      const effectiveExpiresAt = hasExpiresAtUpdate
        ? updates.expiresAt
        : currentSubscription.expiresAt || null;
      updates.nextBillingAt =
        effectiveRenewalMode === "automatic" && effectiveExpiresAt ? effectiveExpiresAt : null;
    }

    userDoc.subscription = {
      ...currentSubscription,
      ...updates,
    };

    await userDoc.save();

    return res.json({
      message: "Suscripción actualizada correctamente.",
      user: {
        _id: String(userDoc._id),
        fullName: userDoc.fullName,
        email: userDoc.email,
        shopSlug: userDoc.shopSlug,
        subscription: userDoc.subscription,
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

export async function runSubscriptionLifecycle(req, res, next) {
  try {
    if (!isSubscriptionLifecycleAuthorized(req)) {
      return res.status(401).json({ error: "No autorizado para correr el cron de suscripciones." });
    }

    const result = await processSubscriptionLifecycle({ now: new Date() });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function updatePassword(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "La contraseña actual y la nueva son obligatorias." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
    }

    const userDoc = await UserModel.findById(userId).select("+passwordHash");
    if (!userDoc || userDoc.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    const isValidPassword = await verifyPassword(currentPassword, userDoc.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({ error: "La contraseña actual no coincide." });
    }

    userDoc.passwordHash = await hashPassword(newPassword);
    await userDoc.save();

    return res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    return next(err);
  }
}

export async function requestPasswordRecovery(req, res, next) {
  try {
    const email = sanitizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: "El email es obligatorio." });
    }

    const userDoc = await UserModel.findOne({ email, isActive: true });
    if (!userDoc) {
      return res.json({
        message: "Si existe una cuenta con ese mail, enviamos un código de recuperación.",
      });
    }

    const code = buildPasswordResetCode();
    userDoc.passwordResetCodeHash = hashPasswordResetCode(code);
    userDoc.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
    await userDoc.save();

    await sendPasswordRecoveryEmail({
      email: userDoc.email,
      fullName: userDoc.fullName,
      code,
    });

    return res.json({
      message: "Te mandamos un código al mail para recuperar la contraseña.",
    });
  } catch (err) {
    return next(err);
  }
}

export async function confirmPasswordRecovery(req, res, next) {
  try {
    const email = sanitizeEmail(req.body?.email);
    const code = String(req.body?.code ?? "").trim();
    const newPassword = String(req.body?.newPassword ?? "");

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, código y nueva contraseña son obligatorios." });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "El código debe tener 6 números." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
    }

    const userDoc = await UserModel.findOne({ email, isActive: true }).select(
      "+passwordResetCodeHash +passwordResetExpiresAt +passwordHash",
    );

    if (!userDoc || !userDoc.passwordResetCodeHash || !userDoc.passwordResetExpiresAt) {
      return res.status(400).json({ error: "El código es inválido o ya no sirve." });
    }

    if (new Date(userDoc.passwordResetExpiresAt).getTime() < Date.now()) {
      userDoc.passwordResetCodeHash = null;
      userDoc.passwordResetExpiresAt = null;
      await userDoc.save();
      return res.status(400).json({ error: "El código venció. Pedí uno nuevo." });
    }

    if (userDoc.passwordResetCodeHash !== hashPasswordResetCode(code)) {
      return res.status(400).json({ error: "El código es inválido o ya no sirve." });
    }

    userDoc.passwordHash = await hashPassword(newPassword);
    userDoc.passwordResetCodeHash = null;
    userDoc.passwordResetExpiresAt = null;
    await userDoc.save();

    return res.json({ message: "Tu contraseña nueva ya quedó guardada." });
  } catch (err) {
    return next(err);
  }
}

export async function savePushToken(req, res) {
  try {
    const userId = req.user?.id; // <--- Ahora sí vendrá en .id gracias al middleware
    const { token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    await UserModel.findByIdAndUpdate(userId, { pushToken: token });

    console.log("✅ TOKEN GUARDADO EXITOSAMENTE PARA EL USUARIO:", userId);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error en savePushToken:", err);
    return res.status(500).json({ error: "Error interno" });
  }
}
