import { useEffect, useMemo, useState } from 'react';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
import {
  createPublicRecurringSubscription,
  createPublicSubscriptionCheckout,
  createPublicSubscriptionPayment,
  fetchPlanPricing,
  fetchPublicSubscriptionQuote,
} from '../services/api';
import styles from '../styles/SubscriptionCheckoutPage.module.css';
import { SHIFT_APP_BRAND_NAME } from '../utils/businessCopy';
import { buildWhatsAppUrl } from '../utils/publicLinks';

const MP_PUBLIC_KEY = process.env.REACT_APP_MERCADO_PAGO_PUBLIC_KEY || '';

// Inicializamos el SDK al importar el modulo, antes de cualquier render,
// para que el CardPayment Brick nunca monte sin el SDK listo (evita problemas
// con React StrictMode montando el brick antes de inicializar).
if (MP_PUBLIC_KEY) {
  try {
    initMercadoPago(MP_PUBLIC_KEY, { locale: 'es-AR' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('No se pudo inicializar Mercado Pago:', err);
  }
}

const APP_STORE_URL = 'https://apps.apple.com/ar/app/shifthub/id6767229780';
/* const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.shifthub.pro'; */

const PLAN_META = {
  basic: {
    label: 'Basico',
    variant: 'basic',
    title: 'Plan Basico',
    description:
      'Turnos online, cobro online y automatizacion base para tu negocio.',
    features: ['Turnos ilimitados', 'Vinculacion Mercado Pago', 'Recordatorios automaticos'],
  },
  pro: {
    label: 'Pro',
    variant: 'pro',
    title: 'Plan Pro',
    description:
      'Metricas, historial y herramientas avanzadas para el negocio.',
    features: ['Todo lo del Basico', 'Metricas e historial', 'Exportacion PDF y Excel'],
  },
};

function getInitialPlan() {
  const url = new URL(window.location.href);
  const plan = String(url.searchParams.get('plan') || '').trim().toLowerCase();
  return plan === 'pro' ? 'pro' : 'basic';
}

function getInitialEmail() {
  const url = new URL(window.location.href);
  return String(url.searchParams.get('email') || '').trim();
}

function getInitialPaymentMode() {
  const url = new URL(window.location.href);
  return String(url.searchParams.get('mode') || '').trim().toLowerCase() === 'automatic'
    ? 'automatic'
    : 'manual';
}

function getInitialPaymentProvider() {
  return 'mercadopago';
}

function CardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="1.75" y="4" width="16.5" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.75 8h16.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6.5L4.8 9.2L10 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export default function SubscriptionCheckoutPage() {
  const [selectedPlan, setSelectedPlan] = useState(getInitialPlan);
  const [paymentMode, setPaymentMode] = useState(getInitialPaymentMode);
  const [paymentProvider, setPaymentProvider] = useState(getInitialPaymentProvider);
  const [email, setEmail] = useState(getInitialEmail);
  const [couponCode, setCouponCode] = useState('');
  const [pricing, setPricing] = useState({
    basic: { ars: 25000, usdReference: 25 },
    pro: { ars: 35000, usdReference: 35 },
    additionalBusiness: { ars: 10000, usdReference: 10 },
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showCardForm, setShowCardForm] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [extraLocals, setExtraLocals] = useState(0);
  const [localNames, setLocalNames] = useState([]);

  useEffect(() => {
    let mounted = true;
    fetchPlanPricing()
      .then((response) => {
        if (!mounted) return;
        setPricing({
          basic: {
            ars: Number(response.pricing?.basic?.ars || 25000),
            usdReference: Number(response.pricing?.basic?.usdReference || 25),
          },
          pro: {
            ars: Number(response.pricing?.pro?.ars || 35000),
            usdReference: Number(response.pricing?.pro?.usdReference || 35),
          },
          additionalBusiness: {
            ars: Number(response.pricing?.additionalBusiness?.ars || 10000),
            usdReference: Number(
              response.pricing?.additionalBusiness?.usdReference || 10,
            ),
          },
        });
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('plan', selectedPlan);
    if (email.trim()) url.searchParams.set('email', email.trim());
    else url.searchParams.delete('email');
    if (paymentMode === 'automatic') url.searchParams.set('mode', paymentMode);
    else url.searchParams.delete('mode');
    url.searchParams.delete('provider');
    window.history.replaceState({}, '', url.toString());
  }, [selectedPlan, email, paymentMode, paymentProvider]);

  const planCards = useMemo(
    () => [
      {
        key: 'basic',
        ...PLAN_META.basic,
        price: `ARS ${pricing.basic.ars.toLocaleString('es-AR')}`,
        note: `ref. USD ${pricing.basic.usdReference}`,
      },
      {
        key: 'pro',
        ...PLAN_META.pro,
        price: `ARS ${pricing.pro.ars.toLocaleString('es-AR')}`,
        note: `ref. USD ${pricing.pro.usdReference}`,
      },
    ],
    [pricing],
  );

  const buildFreeCouponMessage = (response) =>
    (response.message ||
      `Se aplico el cupon ${response.couponApplied || ''} y el plan quedo activo gratis hasta ${new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(response.expiresAt))}.`) +
    ' Ahora abri la app e inicia sesion con esta misma cuenta para empezar a usarla.';

  const closeCardForm = () => {
    setShowCardForm(false);
    setQuote(null);
  };

  // Autoservicio de locales adicionales: el usuario elige cuántos locales extra
  // (con su nombre) y se cobran +USD 10 c/u. El server recalcula el precio real.
  const changeExtraLocals = (next) => {
    const count = Math.max(0, Math.min(10, Number(next) || 0));
    setExtraLocals(count);
    setLocalNames((prev) => {
      const arr = prev.slice(0, count);
      while (arr.length < count) arr.push('');
      return arr;
    });
    closeCardForm();
  };

  const setLocalName = (index, value) => {
    setLocalNames((prev) => {
      const arr = [...prev];
      arr[index] = value;
      return arr;
    });
  };

  // Abre el form de tarjeta y cotiza el total real (plan + recargo por locales
  // adicionales + cupón). Si falla, el brick cae al precio base del plan.
  const openCardForm = async () => {
    setShowCardForm(true);
    setError('');
    setQuote(null);
    if (!email.includes('@')) return;
    setQuoteLoading(true);
    try {
      const q = await fetchPublicSubscriptionQuote({
        email,
        plan: selectedPlan,
        couponCode,
        additionalBusinesses: extraLocals,
      });
      setQuote(q);
    } catch (err) {
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  // Cobro con TARJETA embebido (Bricks): el cliente carga la tarjeta acá mismo
  // y el server hace la activación sincrónica. El redirect a Mercado Pago queda
  // como fallback (boton primario "Completar pago").
  const handleBrickSubmit = async (formData) => {
    setError('');
    setMessage('');

    const cleanNames = localNames.map((n) => (n || '').trim()).filter(Boolean);
    if (extraLocals > 0 && cleanNames.length < extraLocals) {
      const msg = 'Completá el nombre de cada local adicional antes de pagar.';
      setError(msg);
      throw new Error(msg);
    }

    try {
      const response = await createPublicSubscriptionPayment({
        email,
        plan: selectedPlan,
        couponCode,
        additionalBusinesses: extraLocals,
        businessNames: cleanNames,
        payment: formData,
      });

      if (response.activatedDirectly) {
        setMessage(buildFreeCouponMessage(response));
        return;
      }

      const status = String(response.status || '').toLowerCase();
      if (status === 'approved') {
        setMessage(
          `¡Pago aprobado! Cobramos ARS ${Number(response.amount || 0).toLocaleString('es-AR')} y tu plan ya queda activo. Abri la app e inicia sesion con esta misma cuenta.`,
        );
      } else if (status === 'in_process' || status === 'pending') {
        setMessage(
          'Tu pago quedo en revision de Mercado Pago. Apenas se acredite (suele ser unos minutos) activamos tu plan automaticamente.',
        );
      } else {
        throw new Error(
          response.statusDetail
            ? `El pago no se pudo completar (${response.statusDetail}). Proba con otra tarjeta.`
            : 'El pago fue rechazado. Proba con otra tarjeta o usa el pago en la pagina de Mercado Pago.',
        );
      }
    } catch (err) {
      setError(err.message || 'No pudimos procesar el pago.');
      throw err;
    }
  };

  const handleBrickError = (brickError) => {
    // eslint-disable-next-line no-console
    console.error('MercadoPago Brick error:', brickError);
    const detail =
      brickError?.message ||
      brickError?.cause ||
      (typeof brickError?.type === 'string' ? brickError.type : '');
    setError(
      `No se pudo cargar el formulario de pago${detail ? ` (${detail})` : ''}. ` +
        'Revisa la consola del navegador (F12) o usa el pago en la pagina de Mercado Pago.',
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const cleanNames = localNames.map((n) => (n || '').trim()).filter(Boolean);
    if (paymentMode === 'manual' && extraLocals > 0 && cleanNames.length < extraLocals) {
      setError('Completá el nombre de cada local adicional antes de pagar.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (!PLAN_META[selectedPlan]) {
        throw new Error('Seleccioná un plan válido para continuar.');
      }

      if (!isValidEmail(email)) {
        throw new Error('Ingresá el email válido de la cuenta que querés activar.');
      }

      if (paymentProvider !== 'mercadopago') {
        throw new Error('Seleccioná Mercado Pago para continuar. Es el procesador disponible por ahora.');
      }

      const response =
        paymentMode === 'automatic'
          ? await createPublicRecurringSubscription({ email, plan: selectedPlan, couponCode })
          : await createPublicSubscriptionCheckout({
              email,
              plan: selectedPlan,
              couponCode,
              provider: paymentProvider,
              additionalBusinesses: extraLocals,
              businessNames: cleanNames,
            });

      if (response.activatedDirectly) {
        setMessage(
          (response.message ||
            `Se aplico el cupon ${response.couponApplied || ''} y el plan quedo activo gratis hasta ${new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(response.expiresAt))}.`) +
            ' Ahora abri la app e inicia sesion con esta misma cuenta para empezar a usarla.',
        );
        return;
      }

      if (paymentMode === 'automatic') {
        setMessage(
          `Vas a autorizar la renovacion automatica mensual del plan. El valor actual es ARS ${Number(response.amount || 0).toLocaleString('es-AR')}.`,
        );
      } else if (response.discountApplied) {
        setMessage(
          `${response.couponApplied ? `Se aplico el cupon ${response.couponApplied}. ` : 'A esta cuenta se le aplico un precio diferencial. '}Vas a pagar ARS ${Number(response.amount || 0).toLocaleString('es-AR')}.`,
        );
      }

      const targetUrl = response.checkoutUrl || response.sandboxCheckoutUrl;
      if (!targetUrl) throw new Error('No pudimos generar el link de pago del plan.');
      window.location.assign(targetUrl);
    } catch (err) {
      setError(err.message || 'No pudimos iniciar el pago del plan. Intentá nuevamente en unos segundos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.screen}>
      {/* BG */}
      <div className={styles.meshGrid} aria-hidden="true" />
      <div className={styles.orbTop} aria-hidden="true" />
      <div className={styles.orbBottom} aria-hidden="true" />

      {/* TOP BAR */}
      <header className={styles.topBar}>
        <a href="/" className={styles.backBtn}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Volver al inicio
        </a>
        <div className={styles.topBarBrand}>
          <div className={styles.topBarMark}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 5v6L8 14 2 11V5L8 2z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          <span className={styles.topBarName}>{SHIFT_APP_BRAND_NAME}</span>
        </div>
      </header>

      {/* LAYOUT */}
      <div className={styles.layout}>

        {/* ── LEFT: hero + plan selector ── */}
        <div className={styles.leftCol}>
          <div className={styles.heroBlock}>
            <p className={styles.eyebrow}>{`PLANES ${SHIFT_APP_BRAND_NAME.toUpperCase()}`}</p>
            <h1 className={styles.title}>
              Alta o renovacion<br />
              <span className={styles.titleAccent}>de plan.</span>
            </h1>
            <p className={styles.subtitle}>
              Completa el email de la cuenta y elegí el plan.
              Si tu cuenta tiene precio especial, se aplica automaticamente en el checkout.
            </p>
          </div>

          {/* Plan cards */}
          <div className={styles.planGrid}>
            {planCards.map((plan) => (
              <button
                key={plan.key}
                type="button"
                className={`${styles.planCard} ${styles[`planCard_${plan.variant}`]} ${selectedPlan === plan.key ? styles.planCardActive : styles.planCardInactive}`}
                onClick={() => {
                  setSelectedPlan(plan.key);
                  closeCardForm();
                }}
                aria-pressed={selectedPlan === plan.key}
              >
                <div className={styles.planCardTop}>
                  <span className={`${styles.planBadge} ${styles[`planBadge_${plan.variant}`]}`}>
                    {plan.label}
                  </span>
                  <span
                    className={`${styles.planSelectedDot} ${
                      selectedPlan === plan.key ? styles.planSelectedDotActive : ''
                    }`}
                  />
                </div>
                <h2 className={styles.planTitle}>{plan.title}</h2>
                <div className={styles.planPricingRow}>
                  <strong className={`${styles.planPrice} ${styles[`planPrice_${plan.variant}`]}`}>
                    {plan.price}
                  </strong>
                  <span className={styles.planNote}>/ mes · {plan.note}</span>
                </div>
                <p className={styles.planDesc}>{plan.description}</p>
                <ul className={styles.planFeatures}>
                  {plan.features.map((f) => (
                    <li key={f}>
                      <span className={`${styles.planCheck} ${styles[`planCheck_${plan.variant}`]}`}>
                        <CheckIcon />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          {/* Trust card */}
          <div className={styles.trustCard}>
            {[
              'Pago 100% seguro procesado por Mercado Pago',
              'Activación inmediata apenas se acredita el pago',
              'Sin permanencia: cancelás cuando quieras',
            ].map((item) => (
              <div key={item} className={styles.trustItem}>
                <span className={styles.trustCheck}>
                  <CheckIcon />
                </span>
                {item}
              </div>
            ))}
          </div>

          {/* Consultas / WhatsApp (columna izquierda, como barberApp) */}
          <div className={styles.consultCard}>
            <div className={styles.cardDivider}>
              <span>Consultas</span>
            </div>
            <div className={styles.whatsappRow}>
              <p className={styles.whatsappHelper}>
                ¿Dudas con el plan o queres un presupuesto especial?
              </p>
              <a
                href={buildWhatsAppUrl(`Hola quiero consultar por mi plan de ${SHIFT_APP_BRAND_NAME}`)}
                className={styles.whatsappBtn}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsAppIcon />
                Hablar por WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* ── RIGHT: form card ── */}
        <div className={styles.rightCol}>
          {/* Procesador de pago (card separada, arriba de la formCard) */}
          <div className={styles.processorCard} aria-label="Procesador de pago">
            <div className={styles.processorIcon}>
              <img src="/mercadopago.png" alt="" />
            </div>
            <div className={styles.processorCopy}>
              <span className={styles.processorLabel}>Procesador de pago</span>
              <strong className={styles.processorName}>Mercado Pago</strong>
            </div>
          </div>

          <div className={styles.formCard}>
            <div className={styles.formCardHeader}>
              <span className={styles.formCardTag}>Checkout</span>
              <span className={styles.formCardCaption}>Seleccionaste: {PLAN_META[selectedPlan].title}</span>
            </div>

            <div className={styles.modeToggleGroup}>
              <p className={styles.modeGroupLabel}>Modalidad de pago</p>
              <div className={styles.modeToggle}>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${paymentMode === 'manual' ? styles.modeBtnActive : ''}`}
                  onClick={() => setPaymentMode('manual')}
                >
                  <span className={styles.modeBtnDot} />
                  Pago mensual manual
                  <span className={styles.modeBtnReco}>recomendado</span>
                </button>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${styles.modeBtnAuto} ${paymentMode === 'automatic' ? styles.modeBtnAutoActive : ''}`}
                  onClick={() => {
                    setPaymentProvider('mercadopago');
                    setPaymentMode('automatic');
                  }}
                >
                  <span className={styles.modeBtnDot} />
                  Renovacion automatica
                </button>
              </div>
              <p className={styles.modeHelper}>
                {paymentMode === 'automatic'
                  ? 'Autorizas una vez el cobro mensual y Mercado Pago renueva solo cada mes.'
                  : 'Pagas cada mes manualmente desde la web cuando toque renovar.'}
              </p>
            </div>

            {paymentMode === 'automatic' && (
              <div className={styles.warningBanner}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.warningIcon}>
                  <path d="M8 1.5L14.5 13H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M8 6v3.5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>
                  Mercado Pago puede rechazar tarjetas prepagas en renovacion automatica.
                  Si falla, usa pago mensual manual.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              {/* Email */}
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="checkout-email">
                  Email de la cuenta
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                      <path d="M3 5h14a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M2 6l8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    id="checkout-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@negocio.com"
                    required
                  />
                </div>
              </div>

              {/* Coupon */}
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="checkout-coupon">
                  Cupon de descuento
                  <span className={styles.fieldOptional}>opcional</span>
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                      <path d="M10.5 3l6.5 6.5-7.5 7.5L3 10.5 3 4a1 1 0 011-1h6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      <circle cx="6" cy="6.5" r="1" fill="currentColor" />
                    </svg>
                  </span>
                  <input
                    id="checkout-coupon"
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      closeCardForm();
                    }}
                    placeholder="CODIGO"
                    className={styles.inputMono}
                  />
                </div>
              </div>

              {/* Locales adicionales (autoservicio) — solo en modo manual */}
              {paymentMode === 'manual' ? (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>¿Tenés varios locales?</span>
                  <div className={styles.localsStepper}>
                    <button
                      type="button"
                      className={styles.stepBtn}
                      onClick={() => changeExtraLocals(extraLocals - 1)}
                      disabled={extraLocals <= 0}
                      aria-label="Quitar local"
                    >
                      −
                    </button>
                    <span className={styles.stepCount}>{extraLocals}</span>
                    <button
                      type="button"
                      className={styles.stepBtn}
                      onClick={() => changeExtraLocals(extraLocals + 1)}
                      disabled={extraLocals >= 10}
                      aria-label="Agregar local"
                    >
                      +
                    </button>
                    <span className={styles.stepHint}>locales extra · +USD 10 c/u</span>
                  </div>
                  {Array.from({ length: extraLocals }).map((_, i) => (
                    <input
                      // eslint-disable-next-line react/no-array-index-key
                      key={i}
                      type="text"
                      className={styles.localNameInput}
                      value={localNames[i] || ''}
                      onChange={(event) => setLocalName(i, event.target.value)}
                      placeholder={`Nombre del local ${i + 2}`}
                    />
                  ))}
                </div>
              ) : null}

              {/* Resumen de cobro */}
              {(() => {
                const planArs = Number(pricing[selectedPlan]?.ars || 0);
                const unitArs = Number(pricing.additionalBusiness?.ars || 0);
                const unitUsd = Number(pricing.additionalBusiness?.usdReference || 10);
                const locals = paymentMode === 'manual' ? extraLocals : 0;
                const localsArs = locals * unitArs;
                const total = planArs + localsArs;
                return (
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryRow}>
                      <span>{PLAN_META[selectedPlan].title}</span>
                      <span>ARS {planArs.toLocaleString('es-AR')}</span>
                    </div>
                    {locals > 0 ? (
                      <div className={styles.summaryRow}>
                        <span>
                          {locals} local(es) · +USD {unitUsd} c/u
                        </span>
                        <span>ARS {localsArs.toLocaleString('es-AR')}</span>
                      </div>
                    ) : null}
                    <div className={styles.summaryTotalRow}>
                      <span>Total a pagar</span>
                      <span>ARS {total.toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Submit */}
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner} />
                    {paymentMode === 'automatic' ? 'Generando autorizacion...' : 'Generando pago...'}
                  </>
                ) : (
                  <>
                    {paymentMode === 'automatic' ? 'Activar renovacion automatica' : 'Completar pago'}
                    <ArrowIcon />
                  </>
                )}
              </button>

              {paymentMode === 'automatic' && (
                <p className={styles.submitNote}>
                  Si tu tarjeta es prepaga, usa pago mensual manual para evitar rechazos.
                </p>
              )}
            </form>

            {/* Pago con tarjeta embebido (Bricks) — solo en modo manual */}
            {paymentMode === 'manual' && MP_PUBLIC_KEY ? (
              <div className={styles.brickWrap}>
                <div className={styles.cardDivider}>
                  <span>o paga con tarjeta</span>
                </div>

                {!showCardForm ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={openCardForm}
                  >
                    <CardIcon />
                    Pagar con tarjeta (sin cuenta de Mercado Pago)
                  </button>
                ) : !email.includes('@') ? (
                  <p className={styles.brickHint}>
                    Ingresa el email de tu cuenta arriba para cargar la tarjeta.
                  </p>
                ) : quoteLoading ? (
                  <p className={styles.brickHint}>Calculando el precio final…</p>
                ) : (
                  <>
                    {quote && quote.additionalBusinessesCount > 0 ? (
                      <div className={styles.messageBox}>
                        Incluye {quote.additionalBusinessesCount} local(es) adicional(es): +USD{' '}
                        {quote.additionalBusinessesUsdReference} (ARS{' '}
                        {Number(quote.additionalBusinessesArs || 0).toLocaleString('es-AR')}). Total a
                        cobrar: ARS {Number(quote.amount || 0).toLocaleString('es-AR')}.
                      </div>
                    ) : null}
                    <div className={styles.brickBox}>
                      <CardPayment
                        key={`${selectedPlan}-${Number(
                          quote?.amount ?? pricing[selectedPlan]?.ars ?? 0,
                        )}`}
                        initialization={{
                          amount: Number(
                            quote?.amount ?? pricing[selectedPlan]?.ars ?? 0,
                          ),
                        }}
                        customization={{
                          paymentMethods: { maxInstallments: 1 },
                        }}
                        onSubmit={handleBrickSubmit}
                        onError={handleBrickError}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {/* Feedback */}
            {message && (
              <div className={styles.messageBox}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.feedbackIcon}>
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{message}</span>
              </div>
            )}
            {error && (
              <div className={styles.errorBox}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.feedbackIcon}>
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{error}</span>
              </div>
            )}

          </div>

          {/* Despues del alta: descarga la app (card separada, fuera de la formCard) */}
          <div className={styles.downloadCard}>
            <div className={styles.downloadCardIcon}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M10 2a8 8 0 100 16A8 8 0 0010 2z" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.downloadCardBody}>
              <p className={styles.downloadTitle}>Despues del alta, descarga la app</p>
              <p className={styles.downloadText}>
                {`Cuando completes la activacion, entra a la app con esta misma cuenta para empezar a usar ${SHIFT_APP_BRAND_NAME}.`}
              </p>
              <div className={styles.storeButtons}>
                <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className={styles.storeBtn}>
                  <AppleIcon />
                  App Store
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
