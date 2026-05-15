function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getRequiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    const error = new Error(`Falta ${name} en variables de entorno.`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

export function getAstroPayConfig() {
  return {
    apiBaseUrl: normalizeBaseUrl(getRequiredEnv("ASTROPAY_API_BASE_URL")),
    apiKey: getRequiredEnv("ASTROPAY_API_KEY"),
    secretKey: String(process.env.ASTROPAY_SECRET_KEY || "").trim() || null,
    checkoutCreatePath: String(
      process.env.ASTROPAY_CHECKOUT_CREATE_PATH || "/checkout",
    ).trim(),
    webhookSecret: String(process.env.ASTROPAY_WEBHOOK_SECRET || "").trim() || null,
    backendBaseUrl: normalizeBaseUrl(getRequiredEnv("BACKEND_PUBLIC_BASE_URL")),
  };
}

export function buildAstroPaySubscriptionReturnUrls() {
  const { backendBaseUrl } = getAstroPayConfig();
  const base = backendBaseUrl.replace(/\/+$/, "");
  return {
    success: `${base}/api/payments/subscriptions/astropay/return?result=success`,
    pending: `${base}/api/payments/subscriptions/astropay/return?result=pending`,
    failure: `${base}/api/payments/subscriptions/astropay/return?result=failure`,
  };
}

export function buildAstroPaySubscriptionWebhookUrl() {
  const { backendBaseUrl } = getAstroPayConfig();
  return `${backendBaseUrl.replace(/\/+$/, "")}/api/payments/subscriptions/astropay/webhook`;
}

function resolveCheckoutUrl(payload) {
  return (
    payload?.checkoutUrl ||
    payload?.checkout_url ||
    payload?.redirectUrl ||
    payload?.redirect_url ||
    payload?.paymentUrl ||
    payload?.payment_url ||
    payload?.url ||
    payload?.links?.checkout ||
    payload?.links?.payment ||
    payload?.data?.checkoutUrl ||
    payload?.data?.checkout_url ||
    payload?.data?.redirectUrl ||
    payload?.data?.redirect_url ||
    payload?.data?.paymentUrl ||
    payload?.data?.payment_url ||
    payload?.data?.url ||
    null
  );
}

function resolveCheckoutId(payload) {
  return (
    payload?.id ||
    payload?.checkoutId ||
    payload?.checkout_id ||
    payload?.paymentId ||
    payload?.payment_id ||
    payload?.transactionId ||
    payload?.transaction_id ||
    payload?.data?.id ||
    payload?.data?.checkoutId ||
    payload?.data?.checkout_id ||
    payload?.data?.paymentId ||
    payload?.data?.payment_id ||
    payload?.data?.transactionId ||
    payload?.data?.transaction_id ||
    null
  );
}

export async function createAstroPayCheckout({ payload }) {
  const { apiBaseUrl, apiKey, secretKey, checkoutCreatePath } = getAstroPayConfig();
  const response = await fetch(`${apiBaseUrl}${checkoutCreatePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
      ...(secretKey ? { "X-Secret-Key": secretKey } : {}),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      body?.error_description ||
      `AstroPay respondió ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = body;
    throw error;
  }

  return {
    raw: body,
    checkoutUrl: resolveCheckoutUrl(body),
    checkoutId: resolveCheckoutId(body),
  };
}
