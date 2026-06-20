import { NativeModules, Platform } from 'react-native';
import { getActiveShop, getToken } from './authStorage';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
};

type ApiError = Error & {
  status?: number;
  code?: string;
  isTimeout?: boolean;
  isNetworkError?: boolean;
};

const LAN_IP = '192.168.100.56';
const ANDROID_EMULATOR_HOST = '10.0.2.2';
const REQUEST_TIMEOUT_MS = 15000;
const FORCE_PROD_IN_DEBUG = false; // En desarrollo usamos el backend local para no mezclar datos con producción FALSO LOCAL / TRUE PRODUCCION.

const isAndroid = Platform.OS === 'android';
const isAndroidEmulator = Boolean(
  NativeModules?.PlatformConstants?.isTesting === true,
);

const DEV_CANDIDATES = isAndroid
  ? [`http://${ANDROID_EMULATOR_HOST}:3002`, `http://${LAN_IP}:3002`]
  : [`http://${LAN_IP}:3002`];

const PROD_API_URL = 'https://api.shifthubycodex.com';

let resolvedDevBaseUrl: string | null = null;

async function resolveDevBaseUrl(): Promise<string> {
  if (resolvedDevBaseUrl) return resolvedDevBaseUrl;

  const candidates = isAndroidEmulator
    ? DEV_CANDIDATES
    : [...DEV_CANDIDATES].reverse();

  for (const base of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const resp = await fetch(`${base}/`, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        resolvedDevBaseUrl = base;
        return base;
      }
    } catch {}
  }

  resolvedDevBaseUrl = DEV_CANDIDATES[0];
  return resolvedDevBaseUrl;
}

async function getBaseUrl() {
  if (!__DEV__ || FORCE_PROD_IN_DEBUG) return PROD_API_URL;
  return await resolveDevBaseUrl();
}

function buildApiError(
  message: string,
  extra: Partial<ApiError> = {},
): ApiError {
  const error = new Error(message) as ApiError;
  Object.assign(error, extra);
  return error;
}

function buildTimeoutMessage(url: string) {
  if (url.startsWith(PROD_API_URL)) {
    return `La conexión con el servidor tardó demasiado (${url}). Revisá internet, VPN/firewall del teléfono o bloqueos de red del lado del cliente.`;
  }

  return `La conexión tardó demasiado. Revisá el backend o la IP local (${url}).`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestOptions,
  headers: Record<string, string>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const abortFromCaller = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    if (options.signal) {
      options.signal.removeEventListener('abort', abortFromCaller);
    }
  }
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (options.auth) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const activeShop = await getActiveShop<{ _id?: string }>();
    if (activeShop?._id) {
      headers['X-Shop-Id'] = activeShop._id;
    }
  }

  let response: Response | null = null;
  let lastError: ApiError | null = null;

  const totalAttempts = __DEV__ && !FORCE_PROD_IN_DEBUG ? 2 : 1;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      if (__DEV__ && !FORCE_PROD_IN_DEBUG && attempt > 0) {
        resolvedDevBaseUrl = null;
      }

      const baseUrl = await getBaseUrl();
      const url = `${baseUrl.trim()}${path}`;
      response = await fetchWithTimeout(url, options, headers);
      lastError = null;
      break;
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      const baseUrl = FORCE_PROD_IN_DEBUG
        ? PROD_API_URL
        : resolvedDevBaseUrl ?? DEV_CANDIDATES[0] ?? PROD_API_URL;
      const url = `${baseUrl.trim()}${path}`;

      lastError = buildApiError(
        isTimeout
          ? buildTimeoutMessage(url)
          : `RED FALLÓ: ${url} | Motivo: ${err?.message ?? 'sin detalle'}`,
        {
          code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
          isTimeout,
          isNetworkError: true,
        },
      );
    }
  }

  if (!response) {
    throw lastError ?? buildApiError('No se pudo completar la solicitud.');
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error ?? `Error servidor: ${response.status}`;
    throw buildApiError(message, {
      status: response.status,
      code: payload?.code,
    });
  }

  return payload as T;
}

export function registerUser(payload: {
  email: string;
  fullName: string;
  phone?: string;
  password: string;
  businessType?: string;
  registrationSource?: 'web' | 'mobile';
}) {
  return request<{ token?: string; user?: any; message?: string }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: {
        ...payload,
        registrationSource: payload.registrationSource ?? 'mobile',
      },
    },
  );
}

export function loginUser(payload: { email: string; password: string }) {
  return request<{ token: string; user: any }>('/api/auth/login', {
    method: 'POST',
    body: payload,
  });
}

export function getCurrentUser() {
  return request<{ user: any }>('/api/auth/me', { auth: true });
}

export type ThemeConfig = {
  mode?: 'dark' | 'light' | null;
  webPreset?: 'dark' | 'light' | 'vintage' | null;
  primary?: string | null;
  secondary?: string | null;
  card?: string | null;
  gradientColors?: string[] | null;
  logoDataUrl?: string | null;
  bannerDataUrl?: string | null;
  mobileBannerDataUrl?: string | null;
};

export type PublicProfile = {
  subtitle?: string | null;
  address?: string | null;
  phone?: string | null;
  googleMapsUrl?: string | null;
  googleReviewsUrl?: string | null;
  instagramUrl?: string | null;
  linktreeUrl?: string | null;
  googlePlaceId?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
};

export type PaymentSettings = {
  cashEnabled?: boolean;
  advancePaymentEnabled?: boolean;
  advanceMode?: 'deposit' | 'full';
  advanceType?: 'percent' | 'fixed';
  advanceValue?: number;
  bookingSlotIntervalMinutes?: 15 | 30 | 60;
  mercadoPagoConnectionStatus?: 'disconnected' | 'pending' | 'connected';
  mercadoPagoSellerId?: string | null;
  mercadoPagoPublicKey?: string | null;
  bookingCoupons?: BookingCouponSettings[];
};

export type BookingCouponSettings = {
  code: string;
  name: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  serviceIds: string[];
  isActive: boolean;
};

export type MercadoPagoConnectionInfo = {
  connectionStatus: 'disconnected' | 'pending' | 'connected';
  sellerId?: string | null;
  publicKey?: string | null;
  linkedAt?: string | null;
  expiresAt?: string | null;
  hasRefreshToken?: boolean;
};

export type NotificationSettings = {
  adminInstantBookingEnabled?: boolean;
  barberInstantBookingEnabled?: boolean;
  barberReminderEnabled?: boolean;
  barberReminderMinutesBefore?: 15 | 30 | 60 | 120 | 180 | 1440;
  customerSameDayEmailEnabled?: boolean;
};

export type BarberProfileSettings = {
  barberSelfEditEnabled?: boolean;
};

export type ShopClosedDay = {
  date: string;
  message?: string | null;
};

export type ShopClosureInfo = {
  isClosed: boolean;
  date: string;
  message: string;
};

export type SubscriptionSettings = {
  renewalMode?: 'manual' | 'automatic';
  provider?: 'mercadopago' | 'astropay' | 'apple' | 'google' | null;
  mercadoPagoPreapprovalId?: string | null;
  mercadoPagoPreapprovalStatus?: string | null;
  nextBillingAt?: string | null;
  storeProductId?: string | null;
  storeCurrentPlanId?: string | null;
  storePurchaseToken?: string | null;
  storeTransactionId?: string | null;
  storeOriginalTransactionId?: string | null;
  storeEnvironment?: string | null;
  storeLastSyncedAt?: string | null;
  storeAutoRenewing?: boolean;
  storeStatus?: string | null;
};

export type StoreSubscriptionSyncPayload = {
  provider: 'apple' | 'google';
  plan?: 'basic' | 'pro';
  productId: string;
  currentPlanId?: string | null;
  purchaseToken?: string | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  environment?: string | null;
  autoRenewing?: boolean;
  status?: 'active' | 'past_due' | 'cancelled';
  expiresAt?: string | null;
};

export type AccountDeletionRequestPayload = {
  reason?: string;
};

export type PlanPricingResponse = {
  pricing: {
    basic: { ars: number; usdReference: number };
    pro: { ars: number; usdReference: number };
    custom: { ars: null; usdReference: null };
    updatedAt?: string | null;
  };
};

export function createSubscriptionCheckout(plan: 'basic' | 'pro') {
  return request<{
    checkoutUrl: string | null;
    sandboxCheckoutUrl?: string | null;
  }>('/api/auth/subscription/checkout', {
    method: 'POST',
    body: { plan },
    auth: true,
  });
}

export function getPlanPricing() {
  return request<PlanPricingResponse>('/api/public/plans');
}

export function updateThemeConfig(payload: ThemeConfig) {
  return request<{ message: string; user: any }>('/api/auth/theme', {
    method: 'PUT',
    body: payload,
    auth: true,
  });
}

export function updatePublicProfile(payload: PublicProfile) {
  return request<{ message: string; user: any }>('/api/auth/public-profile', {
    method: 'PUT',
    body: payload,
    auth: true,
  });
}

export function searchGooglePlaces(query: string) {
  return request<{
    results: {
      placeId: string;
      name: string;
      address?: string | null;
      googleRating?: number | null;
      googleReviewCount?: number | null;
    }[];
  }>(
    `/api/auth/public-profile/google-places/search?query=${encodeURIComponent(
      query,
    )}`,
    {
      auth: true,
    },
  );
}

export function selectGooglePlace(placeId: string) {
  return request<{ message: string; user: any }>(
    '/api/auth/public-profile/google-places/select',
    {
      method: 'POST',
      body: { placeId },
      auth: true,
    },
  );
}

export function updatePaymentSettings(payload: PaymentSettings) {
  return request<{ message: string; user: any }>('/api/auth/payment-settings', {
    method: 'PUT',
    body: payload,
    auth: true,
  });
}

export function updateNotificationSettings(payload: NotificationSettings) {
  return request<{ message: string; user: any }>(
    '/api/auth/notification-settings',
    {
      method: 'PUT',
      body: payload,
      auth: true,
    },
  );
}

export function updateBarberProfileSettings(payload: BarberProfileSettings) {
  return request<{ message: string; user: any }>(
    '/api/auth/barber-profile-settings',
    {
      method: 'PUT',
      body: payload,
      auth: true,
    },
  );
}

export function updateShopClosedDays(payload: {
  shopClosedDays: ShopClosedDay[];
}) {
  return request<{ message: string; user: any }>('/api/auth/shop-closed-days', {
    method: 'PUT',
    body: payload,
    auth: true,
  });
}

export function updateSubscriptionSettings(payload: SubscriptionSettings) {
  return request<{ message: string; user: any }>(
    '/api/auth/subscription-settings',
    {
      method: 'PUT',
      body: payload,
      auth: true,
    },
  );
}

export function syncStoreSubscription(payload: StoreSubscriptionSyncPayload) {
  return request<{ message: string; user: any }>(
    '/api/auth/subscription/platform/sync',
    {
      method: 'POST',
      body: payload,
      auth: true,
    },
  );
}

export type ShopOption = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  address?: string;
  phone?: string;
  isDefault?: boolean;
  isActive?: boolean;
};

export function fetchOwnShops() {
  return request<{
    shops: ShopOption[];
    activeShop?: ShopOption | null;
    businessLimit: number;
  }>('/api/auth/shops', { auth: true });
}

export function createOwnShop(payload: {
  name: string;
  slug?: string;
  address?: string;
  phone?: string;
}) {
  return request<{
    shop: ShopOption;
    shops: ShopOption[];
    businessLimit: number;
  }>('/api/auth/shops', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}

export function requestAccountDeletion(payload: AccountDeletionRequestPayload) {
  return request<{ message: string; user: any }>(
    '/api/auth/account-deletion-request',
    {
      method: 'POST',
      body: payload,
      auth: true,
    },
  );
}

export function getMercadoPagoStatus() {
  return request<{ mercadoPago: MercadoPagoConnectionInfo }>(
    '/api/auth/mercadopago/status',
    {
      auth: true,
    },
  );
}

export function getMercadoPagoConnectUrl() {
  return request<{ authUrl: string }>('/api/auth/mercadopago/connect', {
    auth: true,
  });
}

export function disconnectMercadoPago() {
  return request<{ message: string; user: any }>(
    '/api/auth/mercadopago/connect',
    {
      method: 'DELETE',
      auth: true,
    },
  );
}

export function updatePassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  return request<{ message: string }>('/api/auth/password', {
    method: 'PUT',
    body: payload,
    auth: true,
  });
}

export function requestPasswordRecovery(payload: { email: string }) {
  return request<{ message: string }>('/api/auth/password/recovery/request', {
    method: 'POST',
    body: payload,
  });
}

export function confirmPasswordRecovery(payload: {
  email: string;
  code: string;
  newPassword: string;
}) {
  return request<{ message: string }>('/api/auth/password/recovery/confirm', {
    method: 'POST',
    body: payload,
  });
}

export function savePushTokenApi(token: string) {
  return request('/api/auth/save-push-token', {
    method: 'POST',
    body: { token },
    auth: true,
  });
}

export type Barber = {
  _id: string;
  fullName: string;
  email?: string;
  phone?: string;
  photoUrl?: string | null;
  serviceIds?: string[];
  scheduleRange?: string;
  scheduleRanges?: { label: string; start: string; end: string }[];
  bookingBufferMinutes?: number;
  bookingSlotIntervalMinutes?: 15 | 30 | 60;
  commissionPercent?: number;
  barberTimeBlocks?: {
    date: string;
    start: string;
    end: string;
    message?: string | null;
  }[];
  barberClosedDays?: {
    date: string;
    message?: string | null;
  }[];
  dayScheduleOverrides?: {
    day: number;
    validFrom?: string | null;
    useBase?: boolean;
    scheduleRange?: string | null;
    scheduleRanges?: { label: string; start: string; end: string }[];
  }[];
  workDays?: number[];
  loginAccess?: {
    enabled: boolean;
    userId?: string | null;
    email?: string | null;
    lastLoginAt?: string | null;
  };
};

export type ServiceOption = {
  _id: string;
  name: string;
  durationMinutes: number;
  price?: number;
  commissionPercent?: number | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type PaymentMethod = 'cash' | 'transfer';

export type Appointment = {
  _id: string;
  barber: { _id: string; fullName: string } | string;
  customerName: string;
  service: string;
  startTime: string;
  durationMinutes: number;
  bufferAfterMinutesApplied?: number;
  servicePrice?: number;
  paymentMethod?: PaymentMethod;
  paymentMethodCollected?: PaymentMethod | 'mixed' | null;
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'refunded';
  cashAmount?: number;
  transferAmount?: number;
  amountTotal?: number;
  amountPaid?: number;
  amountPending?: number;
  status: 'awaiting_payment' | 'pending' | 'completed' | 'cancelled' | string;
  notes?: string;
  email: string;
  walkIn?: boolean;
};

export type AppointmentMetricMonth = {
  key: string;
  label: string;
  appointmentsCount: number;
  totalRevenue: number;
  cashCount: number;
  cashRevenue: number;
  transferCount: number;
  transferRevenue: number;
  commission: number;
  localRevenue: number;
};

export type AppointmentMetricsResponse = {
  barber: { _id: string; fullName: string } | null;
  period: {
    mode: 'monthly' | 'annual';
    key: string;
    label: string;
    year: number;
    month: number | null;
    from: string;
    to: string;
  };
  totals: Omit<AppointmentMetricMonth, 'key' | 'label'>;
  monthly: AppointmentMetricMonth[];
};

export type MonthOverviewBarber = {
  barberId: string;
  barberName: string;
  appointmentsCount: number;
  totalRevenue: number;
  cashCount: number;
  cashRevenue: number;
  transferCount: number;
  transferRevenue: number;
  commission: number;
  localRevenue: number;
};

export type CurrentMonthOverviewResponse = {
  period: {
    mode: MetricsRangeMode;
    key: string;
    label: string;
    year: number;
    month: number | null;
    from: string;
    to: string;
  };
  byBarber: MonthOverviewBarber[];
  totals: Omit<MonthOverviewBarber, 'barberId' | 'barberName'>;
};

export type CustomerHistoryItem = {
  _id: string;
  startTime: string;
  customerName: string;
  service: string;
  barberName: string;
  phone?: string;
  paymentMethod: PaymentMethod;
  price: number;
  status: string;
};

export type CustomerHistoryResponse = {
  period: {
    mode: 'monthly' | 'annual';
    key: string;
    label: string;
    year: number;
    month: number | null;
    from: string;
    to: string;
  };
  summary: {
    servicesCount: number;
    uniqueClients: number;
    totalRevenue: number;
  };
  items: CustomerHistoryItem[];
};

export type CustomerContact = {
  id: string;
  customerName: string;
  phone: string;
  normalizedPhone?: string;
  lastAppointmentAt?: string;
  lastService?: string;
  appointmentsCount: number;
};

export function fetchBarbers() {
  return request<{ barbers: Barber[] }>('/api/barbers', { auth: true });
}

export function fetchServices() {
  return request<{ services: ServiceOption[] }>('/api/appointments/services', {
    auth: true,
  });
}

export function createService(payload: {
  name: string;
  durationMinutes: number;
  price: number;
  commissionPercent?: number | null;
}) {
  return request<{ service: ServiceOption }>('/api/appointments/services', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}

export function updateService(
  serviceId: string,
  payload: {
    name: string;
    durationMinutes: number;
    price: number;
    commissionPercent?: number | null;
  },
) {
  return request<{ service: ServiceOption }>(
    `/api/appointments/services/${serviceId}`,
    {
      method: 'PUT',
      body: payload,
      auth: true,
    },
  );
}

export function deleteService(serviceId: string) {
  return request<{ service: ServiceOption }>(
    `/api/appointments/services/${serviceId}`,
    {
      method: 'DELETE',
      auth: true,
    },
  );
}

export function reorderServices(serviceIds: string[]) {
  return request<{ message: string; services: ServiceOption[] }>(
    '/api/appointments/services/reorder',
    {
      method: 'PATCH',
      body: { serviceIds },
      auth: true,
    },
  );
}

export function createBarber(payload: {
  fullName: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  serviceIds?: string[];
  scheduleRange?: string;
  scheduleRanges?: { label: string; start: string; end: string }[];
  bookingBufferMinutes?: number;
  bookingSlotIntervalMinutes?: 15 | 30 | 60;
  commissionPercent?: number;
  barberTimeBlocks?: {
    date: string;
    start: string;
    end: string;
    message?: string | null;
  }[];
  barberClosedDays?: { date: string; message?: string | null }[];
  dayScheduleOverrides?: {
    day: number;
    validFrom?: string | null;
    useBase?: boolean;
    scheduleRange?: string | null;
    scheduleRanges?: { label: string; start: string; end: string }[];
  }[];
  workDays: number[];
}) {
  return request<{ barber: Barber }>('/api/barbers', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}

export function updateBarber(
  barberId: string,
  payload: {
    fullName: string;
    email?: string;
    phone?: string;
    photoUrl?: string;
    serviceIds?: string[];
    scheduleRange?: string;
    scheduleRanges?: { label: string; start: string; end: string }[];
    bookingBufferMinutes?: number;
    bookingSlotIntervalMinutes?: 15 | 30 | 60;
    commissionPercent?: number;
    barberTimeBlocks?: {
      date: string;
      start: string;
      end: string;
      message?: string | null;
    }[];
    barberClosedDays?: { date: string; message?: string | null }[];
    dayScheduleOverrides?: {
      day: number;
      validFrom?: string | null;
      useBase?: boolean;
      scheduleRange?: string | null;
      scheduleRanges?: { label: string; start: string; end: string }[];
    }[];
    workDays: number[];
  },
) {
  return request<{ barber: Barber }>(`/api/barbers/${barberId}`, {
    method: 'PUT',
    body: payload,
    auth: true,
  });
}

export function upsertBarberAccess(payload: {
  barberId: string;
  email: string;
  password?: string;
}) {
  return request<{
    message: string;
    barberAccess: {
      enabled: boolean;
      userId?: string | null;
      email?: string | null;
      barberId: string;
    };
  }>('/api/auth/barber-access', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}

export function disableBarberAccess(barberId: string) {
  return request<{
    message: string;
    barberAccess: {
      enabled: false;
      barberId: string;
    };
  }>(`/api/auth/barber-access/${barberId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function deleteBarber(barberId: string) {
  return request<{ barber: Barber }>(`/api/barbers/${barberId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function fetchAppointments(params?: { date?: string }) {
  const query = params?.date ? `?date=${encodeURIComponent(params.date)}` : '';
  return request<{ appointments: Appointment[] }>(`/api/appointments${query}`, {
    auth: true,
  });
}

export function fetchBarberAppointments(barberId: string, date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return request<{
    barber: Barber;
    resolvedSchedule?: {
      scheduleRange?: string | null;
      scheduleRanges?: { label: string; start: string; end: string }[];
      source?: string;
    };
    shopClosure?: ShopClosureInfo | null;
    barberClosure?: ShopClosureInfo | null;
    shopSettings?: {
      paymentSettings?: PaymentSettings | null;
    } | null;
    barberTimeBlocks?: {
      date: string;
      start: string;
      end: string;
      message?: string | null;
    }[];
    appointments: Appointment[];
  }>(`/api/barbers/${barberId}/appointments${query}`, { auth: true });
}

export function createAppointment(payload: {
  barberId: string;
  customerName: string;
  service: string;
  startTime: string;
  durationMinutes?: number;
  servicePrice?: number;
  notes?: string;
  email: string;
  paymentMethod?: PaymentMethod;
  walkIn?: boolean;
}) {
  return request<{ appointment: Appointment }>('/api/appointments', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}

export function updateAppointmentStatus(
  appointmentId: string,
  status: 'pending' | 'completed' | 'cancelled',
  extras?: {
    paymentMethodCollected?: PaymentMethod | 'mixed';
    paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'refunded';
    amountPaid?: number;
    cashAmount?: number;
    transferAmount?: number;
  },
) {
  return request<{ appointment: Appointment }>(
    `/api/appointments/${appointmentId}`,
    {
      method: 'PATCH',
      body: {
        status,
        ...extras,
      },
      auth: true,
    },
  );
}

export function deleteAppointment(appointmentId: string) {
  return request<{ success: boolean }>(`/api/appointments/${appointmentId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function fetchAppointmentMetrics(params?: {
  barberId?: string;
  year?: number;
  month?: number;
  annual?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.barberId) searchParams.set('barberId', params.barberId);
  if (params?.year) searchParams.set('year', String(params.year));
  if (params?.month) searchParams.set('month', String(params.month));
  if (params?.annual) searchParams.set('annual', 'true');
  const query = searchParams.toString();

  return request<AppointmentMetricsResponse>(
    `/api/appointments/metrics${query ? `?${query}` : ''}`,
    { auth: true },
  );
}

export function fetchCurrentMonthOverview() {
  return request<CurrentMonthOverviewResponse>(
    '/api/appointments/month-overview',
    { auth: true },
  );
}

export function fetchOwnerMetricsOverview(params?: {
  range?: MetricsRangeMode;
  date?: string;
  year?: number;
  month?: number;
  annual?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.range) searchParams.set('range', params.range);
  if (params?.date) searchParams.set('date', params.date);
  if (params?.year) searchParams.set('year', String(params.year));
  if (params?.month) searchParams.set('month', String(params.month));
  if (params?.annual) searchParams.set('annual', 'true');
  const query = searchParams.toString();

  return request<CurrentMonthOverviewResponse>(
    `/api/appointments/month-overview${query ? `?${query}` : ''}`,
    { auth: true },
  );
}

export function fetchCustomerHistory(params?: {
  year?: number;
  month?: number;
  annual?: boolean;
  search?: string;
  paymentMethod?: 'cash' | 'transfer';
  barberId?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.year) searchParams.set('year', String(params.year));
  if (params?.month) searchParams.set('month', String(params.month));
  if (params?.annual) searchParams.set('annual', 'true');
  if (params?.search) searchParams.set('search', params.search);
  if (params?.paymentMethod)
    searchParams.set('paymentMethod', params.paymentMethod);
  if (params?.barberId) searchParams.set('barberId', params.barberId);
  const query = searchParams.toString();

  return request<CustomerHistoryResponse>(
    `/api/appointments/history${query ? `?${query}` : ''}`,
    { auth: true },
  );
}

export function fetchCustomerContacts(params?: {
  search?: string;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();

  return request<{ contacts: CustomerContact[] }>(
    `/api/appointments/customers${query ? `?${query}` : ''}`,
    { auth: true },
  );
}

// ──────────────────────────────────────────────────────────────────────────
// CAJA (movimientos de ingreso/egreso + resumen)
// ──────────────────────────────────────────────────────────────────────────

export type MetricsRangeMode = 'daily' | 'weekly' | 'monthly' | 'annual';

export type CashEntry = {
  _id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  date: string;
};

export type CashSummaryResponse = {
  period: {
    mode: MetricsRangeMode;
    key: string;
    label: string;
    year: number;
    month: number | null;
    from: string;
    to: string;
  };
  serviceIncome: number;
  localServiceIncome: number;
  commissions: number;
  manualIncome: number;
  totalIncome: number;
  expenses: number;
  profit: number;
  servicesCount: number;
  entriesCount: number;
  services?: CashServiceItem[];
};

export type CashServiceItem = {
  _id: string;
  customerName: string;
  service: string;
  amount: number;
  method: string | null;
  startTime: string | null;
};

export type CashEntriesResponse = {
  period: CashSummaryResponse['period'];
  entries: CashEntry[];
};

export function fetchCashSummary(params?: {
  range?: MetricsRangeMode;
  date?: string;
  year?: number;
  month?: number;
  annual?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.range) searchParams.set('range', params.range);
  if (params?.date) searchParams.set('date', params.date);
  if (params?.year) searchParams.set('year', String(params.year));
  if (params?.month) searchParams.set('month', String(params.month));
  if (params?.annual) searchParams.set('annual', 'true');
  const query = searchParams.toString();
  return request<CashSummaryResponse>(
    `/api/cash/summary${query ? `?${query}` : ''}`,
    { auth: true },
  );
}

export function fetchCashEntries(params?: {
  range?: MetricsRangeMode;
  date?: string;
  year?: number;
  month?: number;
  annual?: boolean;
  type?: 'income' | 'expense';
}) {
  const searchParams = new URLSearchParams();
  if (params?.range) searchParams.set('range', params.range);
  if (params?.date) searchParams.set('date', params.date);
  if (params?.year) searchParams.set('year', String(params.year));
  if (params?.month) searchParams.set('month', String(params.month));
  if (params?.annual) searchParams.set('annual', 'true');
  if (params?.type) searchParams.set('type', params.type);
  const query = searchParams.toString();
  return request<CashEntriesResponse>(
    `/api/cash/entries${query ? `?${query}` : ''}`,
    { auth: true },
  );
}

export function createCashEntry(payload: {
  type: 'income' | 'expense';
  amount: number;
  description?: string;
  category?: string;
  date?: string;
}) {
  return request<{ entry: CashEntry }>('/api/cash/entries', {
    method: 'POST',
    auth: true,
    body: payload,
  });
}

export function updateCashEntry(
  id: string,
  payload: {
    type?: 'income' | 'expense';
    amount?: number;
    description?: string;
    category?: string;
    date?: string;
  },
) {
  return request<{ entry: CashEntry }>(`/api/cash/entries/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  });
}

export function deleteCashEntry(id: string) {
  return request<{ ok: boolean }>(`/api/cash/entries/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

// ===== Membresías =====
export type MembershipPlan = {
  _id: string;
  name: string;
  color: string;
  freeTurns: number;
  durationDays: number; // 0 = sin límite de tiempo
  giftText: string;
  priceArs: number;
  isActive: boolean;
};

export type Membership = {
  _id: string;
  plan?: string | null;
  planName: string;
  customerName: string;
  customerEmail: string;
  turnsTotal: number;
  turnsUsed: number;
  turnsRemaining: number;
  startedAt: string | null;
  expiresAt: string | null;
  pricePaidArs: number;
  status: 'active' | 'expired' | 'depleted' | 'cancelled';
  createdAt: string;
};

export function fetchMembershipPlans() {
  return request<{ plans: MembershipPlan[] }>('/api/memberships/plans', {
    auth: true,
  });
}

export function upsertMembershipPlan(payload: {
  id?: string;
  name: string;
  color?: string;
  freeTurns: number;
  durationDays?: number;
  giftText?: string;
  priceArs: number;
}) {
  return request<{ plan: MembershipPlan }>('/api/memberships/plans', {
    method: 'POST',
    auth: true,
    body: payload,
  });
}

export function deleteMembershipPlan(id: string) {
  return request<{ ok: boolean }>(`/api/memberships/plans/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function fetchMembers() {
  return request<{ members: Membership[] }>('/api/memberships/members', {
    auth: true,
  });
}

export function createMember(payload: {
  planId: string;
  customerName: string;
  customerEmail: string;
}) {
  return request<{ member: Membership }>('/api/memberships/members', {
    method: 'POST',
    auth: true,
    body: payload,
  });
}
