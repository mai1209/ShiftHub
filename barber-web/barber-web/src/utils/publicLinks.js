import { SHIFT_APP_BRAND_NAME } from './businessCopy';

export const PUBLIC_WEB_BASE_URL =
  process.env.REACT_APP_PUBLIC_WEB_BASE_URL || window.location.origin;
export const SUPPORT_EMAIL = 'barberappbycodex@gmail.com';
export const SUPPORT_WHATSAPP_NUMBER = '543425543308';

export function buildPublicWebUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${PUBLIC_WEB_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`;
}

export function buildSupportMailUrl(subject) {
  if (!subject) return `mailto:${SUPPORT_EMAIL}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export function buildWhatsAppUrl(message) {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const SUPPORT_URL = buildPublicWebUrl('/soporte');
export const PRIVACY_POLICY_URL = buildPublicWebUrl('/politica-de-privacidad');
export const ACCOUNT_DELETION_URL = buildPublicWebUrl('/eliminacion-de-cuenta');
export const REGISTER_ACCOUNT_URL = buildPublicWebUrl('/registro');
export const PLANS_WEBSITE_URL = buildPublicWebUrl('/planes');
export const CUSTOM_PLAN_URL = buildWhatsAppUrl(
  `Hola quiero consultar por el plan personalizable de ${SHIFT_APP_BRAND_NAME}`,
);
