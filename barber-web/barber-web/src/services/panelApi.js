// API autenticada para el Panel Admin web.
// Reutiliza el mismo backend que la app (login con email/password -> JWT)
// y scopea por sucursal con el header X-Shop-Id.

const rawBaseUrl = process.env.REACT_APP_API_BASE_URL;

function normalizeLocalDev(value) {
  if (!value || typeof window === 'undefined') return value;
  if (window.location.hostname !== 'localhost') return value;
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== 'localhost') {
      parsed.hostname = 'localhost';
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch (_e) {
    return value;
  }
  return value;
}

// Raíz /api del backend (los endpoints autenticados cuelgan de /api/...).
function resolveApiRoot() {
  let base = normalizeLocalDev(rawBaseUrl || '').replace(/\/+$/, '');
  // Sacamos sufijos públicos si vinieran configurados.
  base = base.replace(/\/api\/public$/, '').replace(/\/public$/, '').replace(/\/api$/, '');
  if (!base) return '/api';
  return `${base}/api`;
}

const API_ROOT = resolveApiRoot();

const TOKEN_KEY = 'panel_token';
const SHOP_KEY = 'panel_active_shop_id';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (_e) {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (_e) {
    /* noop */
  }
}

export function getActiveShopId() {
  try {
    return localStorage.getItem(SHOP_KEY);
  } catch (_e) {
    return null;
  }
}

export function setActiveShopId(shopId) {
  try {
    if (shopId) localStorage.setItem(SHOP_KEY, shopId);
    else localStorage.removeItem(SHOP_KEY);
  } catch (_e) {
    /* noop */
  }
}

export function clearSession() {
  setToken(null);
  setActiveShopId(null);
}

async function request(path, options = {}) {
  const { auth = true, ...rest } = options;
  const url = `${API_ROOT}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(rest.headers || {}),
  };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const shopId = getActiveShopId();
    if (shopId) headers['X-Shop-Id'] = shopId;
  }

  const config = { ...rest, headers };
  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  let payload = null;
  try {
    payload = await response.json();
  } catch (_e) {
    /* respuesta vacía */
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

export { request as panelRequest };

// --- Auth ---
export async function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
}

export async function fetchOwnShops() {
  return request('/auth/shops');
}

// --- Helper de período (range/date/year/month/annual) ---
function rangeQuery(params = {}) {
  const sp = new URLSearchParams();
  if (params.range) sp.set('range', params.range);
  if (params.date) sp.set('date', params.date);
  if (params.year) sp.set('year', String(params.year));
  if (params.month) sp.set('month', String(params.month));
  if (params.annual) sp.set('annual', 'true');
  if (params.barberId) sp.set('barberId', params.barberId);
  if (params.search) sp.set('search', params.search);
  if (params.paymentMethod) sp.set('paymentMethod', params.paymentMethod);
  if (params.type) sp.set('type', params.type);
  const q = sp.toString();
  return q ? `?${q}` : '';
}

// --- Métricas ---
export async function fetchMetrics(params) {
  return request(`/appointments/metrics${rangeQuery(params)}`);
}

export async function fetchMonthOverview(params) {
  return request(`/appointments/month-overview${rangeQuery(params)}`);
}

// --- Historial ---
export async function fetchCustomerHistory(params) {
  return request(`/appointments/history${rangeQuery(params)}`);
}

// --- Caja ---
export async function fetchCashSummary(params) {
  return request(`/cash/summary${rangeQuery(params)}`);
}

export async function fetchCashEntries(params) {
  return request(`/cash/entries${rangeQuery(params)}`);
}

export async function createCashEntry(payload) {
  return request('/cash/entries', { method: 'POST', body: payload });
}

export async function updateCashEntry(id, payload) {
  return request(`/cash/entries/${id}`, { method: 'PATCH', body: payload });
}

export async function deleteCashEntry(id) {
  return request(`/cash/entries/${id}`, { method: 'DELETE' });
}

// --- Empleados ---
export async function fetchBarbers(includeInactive = false) {
  return request(`/barbers${includeInactive ? '?includeInactive=true' : ''}`);
}

export async function reactivateBarber(id) {
  return request(`/barbers/${id}/reactivate`, { method: 'PATCH' });
}

export async function updateBarber(id, payload) {
  return request(`/barbers/${id}`, { method: 'PUT', body: payload });
}

export async function deactivateBarber(id) {
  return request(`/barbers/${id}`, { method: 'DELETE' });
}

export async function upsertBarberAccess(payload) {
  return request('/auth/barber-access', { method: 'POST', body: payload });
}

// --- Servicios ---
export async function fetchServices() {
  return request('/appointments/services');
}

export async function createService(payload) {
  return request('/appointments/services', { method: 'POST', body: payload });
}

export async function updateService(id, payload) {
  return request(`/appointments/services/${id}`, { method: 'PUT', body: payload });
}

export async function deleteService(id) {
  return request(`/appointments/services/${id}`, { method: 'DELETE' });
}

export async function reorderServices(orderedServiceIds) {
  return request('/appointments/services/reorder', {
    method: 'PATCH',
    body: { serviceIds: orderedServiceIds },
  });
}

// --- Turnos / Agenda ---
export async function fetchAppointments(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : '';
  return request(`/appointments${q}`);
}

export async function fetchBarberAppointments(barberId, date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : '';
  return request(`/barbers/${barberId}/appointments${q}`);
}

export async function createAppointment(payload) {
  return request('/appointments', { method: 'POST', body: payload });
}

export async function updateAppointmentStatus(appointmentId, status, extras) {
  return request(`/appointments/${appointmentId}`, {
    method: 'PATCH',
    body: { status, ...(extras || {}) },
  });
}

export async function deleteAppointment(appointmentId) {
  return request(`/appointments/${appointmentId}`, { method: 'DELETE' });
}

// --- Productos (POS interno) ---
export async function fetchProducts() {
  return request('/products');
}

export async function createProduct(payload) {
  return request('/products', { method: 'POST', body: payload });
}

export async function updateProduct(id, payload) {
  return request(`/products/${id}`, { method: 'PATCH', body: payload });
}

export async function deleteProduct(id) {
  return request(`/products/${id}`, { method: 'DELETE' });
}

export async function registerSale(items) {
  return request('/products/sale', { method: 'POST', body: { items } });
}
