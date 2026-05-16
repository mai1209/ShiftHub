const rawBaseUrl = process.env.REACT_APP_API_BASE_URL;

function isPrivateDevHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function normalizeLocalDevBaseUrl(value) {
  if (!value || typeof window === 'undefined') return value;

  try {
    const parsed = new URL(value);
    const currentHostname = window.location.hostname;
    const currentIsPrivateDevHost = isPrivateDevHost(currentHostname);
    const targetIsLocalHost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    if (currentIsPrivateDevHost && targetIsLocalHost) {
      parsed.hostname = currentHostname;
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch (_error) {
    return value;
  }

  return value;
}

function resolveBaseUrl() {
  const fallback = '/api/public';
  const trimmed = normalizeLocalDevBaseUrl(rawBaseUrl || fallback).replace(/\/+$/, '');

  // Si el usuario configuró solo el dominio (ej: https://mi-backend.com)
  // agregamos automáticamente el segmento /api/public que exige el backend.
  if (trimmed.endsWith('/api/public')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/public`;
  return `${trimmed}/api/public`;
}

const BASE_URL = resolveBaseUrl();
const AUTH_BASE_URL = BASE_URL.replace(/\/public$/, '/auth');
let currentShopSlug = null;

function sanitizeSlug(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '') || null
  );
}

export function setShopSlug(slug) {
  currentShopSlug = sanitizeSlug(slug);
}

export function getShopSlug() {
  return currentShopSlug;
}

function buildShopPath(path = '') {
  if (!currentShopSlug) {
    throw new Error('No se configuró el negocio actual.');
  }
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `/shops/${currentShopSlug}${suffix}`;
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  };

  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    const error = new Error(
      'No pudimos conectar con el servidor de pagos. Revisá tu conexión e intentá de nuevo.',
    );
    error.cause = err;
    throw error;
  }
  let payload = null;

  try {
    payload = await response.json();
  } catch (err) {
    // Ignore JSON parse errors for empty responses.
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `La solicitud falló con código ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

export async function fetchBarbers() {
  return request(buildShopPath('/barbers'));
}

export async function fetchServices() {
  return request(buildShopPath('/services'));
}

// En tu api.js
export async function fetchBarberAppointments(barberId, date) {
  // Verificá que date sea "YYYY-MM-DD"
  const query = date ? `?date=${date}` : '';
  return request(buildShopPath(`/barbers/${barberId}/appointments${query}`));
}

export async function createAppointment(payload) {
  return request(buildShopPath('/appointments'), {
    method: 'POST',
    body: payload,
  });
}

export async function fetchShopInfo() {
  return request(buildShopPath());
}

export async function fetchPlanPricing() {
  return request('/plans', {
    cache: 'no-store',
  });
}

export async function createPublicSubscriptionCheckout(payload) {
  return request('/subscriptions/checkout', {
    method: 'POST',
    body: payload,
  });
}

export async function createPublicRecurringSubscription(payload) {
  return request('/subscriptions/recurring/start', {
    method: 'POST',
    body: payload,
  });
}

export async function registerPublicAccount(payload) {
  const response = await fetch(`${AUTH_BASE_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `La solicitud falló con código ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}
