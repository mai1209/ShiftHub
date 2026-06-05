const PLAN_LABELS = {
  free: 'Gratis',
  basic: 'Básico',
  pro: 'Pro',
  custom: 'Personalizado',
};

const STATUS_LABELS = {
  active: 'Activo',
  trial: 'Prueba',
  expired: 'Vencido',
  past_due: 'Pago pendiente',
  cancelled: 'Cancelado',
  paused: 'Pausado',
};

// Calcula la info de plan a partir de user.subscription (viene del login).
export function planInfo(sub) {
  if (!sub) return null;
  const plan = (sub.plan || 'free').toLowerCase();
  const status = (sub.status || '').toLowerCase();
  const provider = (sub.provider || '').toLowerCase();
  const isStore = provider === 'apple' || provider === 'google';
  const automatic = sub.renewalMode === 'automatic';

  const expiryRaw = automatic
    ? sub.nextBillingAt || sub.expiresAt
    : sub.expiresAt || sub.nextBillingAt;
  const expiry = expiryRaw ? new Date(expiryRaw) : null;
  const days =
    expiry && !Number.isNaN(expiry.getTime())
      ? Math.ceil((expiry.getTime() - Date.now()) / 86400000)
      : null;

  return {
    plan,
    planLabel: PLAN_LABELS[plan] || plan,
    status,
    statusLabel: STATUS_LABELS[status] || status || '—',
    provider,
    isStore,
    automatic,
    expiry,
    days,
    locales: 1 + Number(sub.additionalBusinesses || 0),
  };
}

// ¿Tiene acceso Pro? (espeja requireProSubscription del backend)
export function hasProAccess(sub) {
  const plan = (sub?.plan || '').toLowerCase();
  const status = (sub?.status || '').toLowerCase();
  return (plan === 'pro' || plan === 'custom') && status === 'active';
}

// ¿Mostrar el aviso de pago arriba del panel?
export function shouldNudge(info) {
  if (!info || info.plan === 'free') return false;
  if (info.days == null) return false;
  if (info.days < 0) return true; // vencido
  if (!info.automatic && info.days <= 5) return true; // por vencer (renovación manual)
  return false;
}

export function expiryText(info) {
  if (!info || info.days == null) return '';
  if (info.days < 0) return `venció hace ${Math.abs(info.days)} día${Math.abs(info.days) === 1 ? '' : 's'}`;
  if (info.days === 0) return 'vence hoy';
  return `${info.automatic ? 'se renueva' : 'vence'} en ${info.days} día${info.days === 1 ? '' : 's'}`;
}

// Link al checkout con el plan/email/modo precargados (renovar en 1 clic).
export function renewUrl(user, info) {
  const params = new URLSearchParams();
  if (info?.plan && info.plan !== 'free') params.set('plan', info.plan);
  if (user?.email) params.set('email', user.email);
  if (info?.automatic) params.set('mode', 'automatic');
  const q = params.toString();
  return `/planes${q ? `?${q}` : ''}`;
}

export function formatDate(d) {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}
