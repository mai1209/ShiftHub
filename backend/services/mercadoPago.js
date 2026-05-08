import crypto from "node:crypto";

const DEFAULT_AUTH_URL = "https://auth.mercadopago.com/authorization";
const DEFAULT_API_BASE_URL = "https://api.mercadopago.com";

function getRequiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    const error = new Error(`Falta ${name} en variables de entorno.`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function validateMercadoPagoRedirectUri(redirectUri) {
  let parsed;

  try {
    parsed = new URL(redirectUri);
  } catch (_error) {
    const error = new Error(
      "La URL de retorno de Mercado Pago no es válida. Revisá MERCADO_PAGO_REDIRECT_URI.",
    );
    error.statusCode = 500;
    throw error;
  }

  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (parsed.protocol !== "https:" && !(isLocalhost && parsed.protocol === "http:")) {
    const error = new Error(
      "Mercado Pago está mal configurado: MERCADO_PAGO_REDIRECT_URI debe usar HTTPS en producción y coincidir exactamente con la URL cargada en la app de Mercado Pago Developers.",
    );
    error.statusCode = 500;
    throw error;
  }

  if (parsed.search || parsed.hash) {
    const error = new Error(
      "Mercado Pago está mal configurado: MERCADO_PAGO_REDIRECT_URI no debe incluir parámetros ni fragmentos.",
    );
    error.statusCode = 500;
    throw error;
  }

  return redirectUri;
}

export function getMercadoPagoConfig() {
  const backendBaseUrl = normalizeBaseUrl(getRequiredEnv("BACKEND_PUBLIC_BASE_URL"));
  const redirectUri = String(
    process.env.MERCADO_PAGO_REDIRECT_URI ||
      `${backendBaseUrl}/api/auth/mercadopago/callback`,
  ).trim();

  return {
    clientId: getRequiredEnv("MERCADO_PAGO_CLIENT_ID"),
    clientSecret: getRequiredEnv("MERCADO_PAGO_CLIENT_SECRET"),
    redirectUri: validateMercadoPagoRedirectUri(redirectUri),
    publicBookingBaseUrl: getRequiredEnv("PUBLIC_BOOKING_BASE_URL"),
    backendBaseUrl,
    authUrl: String(process.env.MERCADO_PAGO_OAUTH_AUTHORIZE_URL || DEFAULT_AUTH_URL).trim(),
    apiBaseUrl: String(process.env.MERCADO_PAGO_API_BASE_URL || DEFAULT_API_BASE_URL).trim(),
    webhookSecret: String(process.env.MERCADO_PAGO_WEBHOOK_SECRET || "").trim() || null,
    subscriptionsAccessToken: String(
      process.env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN ||
        process.env.MERCADO_PAGO_ACCESS_TOKEN ||
        "",
    ).trim(),
  };
}

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createMercadoPagoPkcePair() {
  const codeVerifier = base64Url(crypto.randomBytes(64));
  const codeChallenge = base64Url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
  };
}

async function mercadoPagoFetch(path, options = {}) {
  const { apiBaseUrl } = getMercadoPagoConfig();
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      payload?.cause?.[0]?.description ||
      `Mercado Pago respondió ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

export function buildMercadoPagoOAuthUrl({
  state,
  codeChallenge,
  codeChallengeMethod = "S256",
}) {
  const { authUrl, clientId, redirectUri } = getMercadoPagoConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    platform_id: "mp",
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  });
  return `${authUrl}?${params.toString()}`;
}

export async function exchangeMercadoPagoCode({ code, codeVerifier }) {
  const { clientId, clientSecret, redirectUri } = getMercadoPagoConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  return mercadoPagoFetch("/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
}

export async function refreshMercadoPagoAccessToken({ refreshToken }) {
  const { clientId, clientSecret } = getMercadoPagoConfig();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  return mercadoPagoFetch("/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
}

export async function createMercadoPagoPreference({ accessToken, payload }) {
  return mercadoPagoFetch("/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function createMercadoPagoPreapproval({ accessToken, payload }) {
  return mercadoPagoFetch("/preapproval", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function getMercadoPagoPayment({ accessToken, paymentId }) {
  return mercadoPagoFetch(`/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
}

export async function getMercadoPagoPreapproval({ accessToken, preapprovalId }) {
  return mercadoPagoFetch(`/preapproval/${preapprovalId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
}

export async function updateMercadoPagoPreapproval({ accessToken, preapprovalId, payload }) {
  return mercadoPagoFetch(`/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function getMercadoPagoSubscriptionsAccessToken() {
  const { subscriptionsAccessToken } = getMercadoPagoConfig();
  if (!subscriptionsAccessToken) {
    const error = new Error(
      "Falta MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN en variables de entorno.",
    );
    error.statusCode = 500;
    throw error;
  }
  return subscriptionsAccessToken;
}

export async function createMercadoPagoSystemPreference({ payload }) {
  const accessToken = getMercadoPagoSubscriptionsAccessToken();
  return createMercadoPagoPreference({ accessToken, payload });
}

export async function getMercadoPagoSystemPayment({ paymentId }) {
  const accessToken = getMercadoPagoSubscriptionsAccessToken();
  return getMercadoPagoPayment({ accessToken, paymentId });
}

export async function createMercadoPagoSystemPreapproval({ payload }) {
  const accessToken = getMercadoPagoSubscriptionsAccessToken();
  return createMercadoPagoPreapproval({ accessToken, payload });
}

export async function getMercadoPagoSystemPreapproval({ preapprovalId }) {
  const accessToken = getMercadoPagoSubscriptionsAccessToken();
  return getMercadoPagoPreapproval({ accessToken, preapprovalId });
}

export async function updateMercadoPagoSystemPreapproval({ preapprovalId, payload }) {
  const accessToken = getMercadoPagoSubscriptionsAccessToken();
  return updateMercadoPagoPreapproval({ accessToken, preapprovalId, payload });
}

export function buildMercadoPagoBookingReturnUrls(shopSlug) {
  const { publicBookingBaseUrl } = getMercadoPagoConfig();
  const base = publicBookingBaseUrl.replace(/\/+$/, "");
  const shopPath = `${base}/${encodeURIComponent(shopSlug)}`;
  return {
    success: `${shopPath}?payment_result=success`,
    pending: `${shopPath}?payment_result=pending`,
    failure: `${shopPath}?payment_result=failure`,
  };
}

export function buildMercadoPagoWebhookUrl() {
  const { backendBaseUrl } = getMercadoPagoConfig();
  return `${backendBaseUrl.replace(/\/+$/, "")}/api/payments/mercadopago/webhook`;
}

export function buildMercadoPagoSubscriptionReturnUrls() {
  const { backendBaseUrl } = getMercadoPagoConfig();
  const base = backendBaseUrl.replace(/\/+$/, "");
  return {
    success: `${base}/api/payments/subscriptions/return?result=success`,
    pending: `${base}/api/payments/subscriptions/return?result=pending`,
    failure: `${base}/api/payments/subscriptions/return?result=failure`,
  };
}

export function buildMercadoPagoSubscriptionWebhookUrl() {
  const { backendBaseUrl } = getMercadoPagoConfig();
  return `${backendBaseUrl.replace(/\/+$/, "")}/api/payments/subscriptions/mercadopago/webhook`;
}
