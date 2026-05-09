import { SHIFT_APP_BRAND_NAME } from './businessCopy';

export const PUBLIC_WEB_BASE_URL = 'https://shifthubycodex.com';
export const SUPPORT_EMAIL = 'barberappbycodex@gmail.com';
export const SUPPORT_WHATSAPP_NUMBER = '543425543308';

export function buildPublicWebUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${PUBLIC_WEB_BASE_URL}${normalizedPath}`;
}

export function buildSupportMailUrl(subject?: string) {
  if (!subject) {
    return `mailto:${SUPPORT_EMAIL}`;
  }
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export function buildWhatsAppUrl(message: string) {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function buildPlanUrl(plan: 'basic' | 'pro', email?: string) {
  const url = new URL(buildPublicWebUrl('/planes'));
  url.searchParams.set('plan', plan);
  if (email) {
    url.searchParams.set('email', email.trim().toLowerCase());
  }
  return url.toString();
}

export const SUPPORT_URL = buildPublicWebUrl('/soporte');
export const PRIVACY_POLICY_URL = buildPublicWebUrl('/politica-de-privacidad');
export const ACCOUNT_DELETION_URL = buildPublicWebUrl('/eliminacion-de-cuenta');
export const REGISTER_ACCOUNT_URL = buildPublicWebUrl('/registro');
export const PLANS_WEBSITE_URL = buildPublicWebUrl('/planes');
export const BASIC_PLAN_URL = buildPlanUrl('basic');
export const PRO_PLAN_URL = buildPlanUrl('pro');
export const CUSTOM_PLAN_URL = buildWhatsAppUrl(
  `Hola, quiero consultar por el plan personalizable de ${SHIFT_APP_BRAND_NAME}`,
);
export const ACCOUNT_SUPPORT_WHATSAPP_URL = buildWhatsAppUrl(
  `Hola, necesito ayuda con mi cuenta de ${SHIFT_APP_BRAND_NAME}`,
);
