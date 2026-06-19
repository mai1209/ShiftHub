import { useEffect, useMemo, useState } from 'react';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
import { addBranchesPayment, fetchPlanPricing } from '../services/api';
import styles from '../styles/SubscriptionCheckoutPage.module.css';
import { SHIFT_APP_BRAND_NAME } from '../utils/businessCopy';

const MP_PUBLIC_KEY = process.env.REACT_APP_MERCADO_PAGO_PUBLIC_KEY || '';

if (MP_PUBLIC_KEY) {
  try {
    initMercadoPago(MP_PUBLIC_KEY, { locale: 'es-AR' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('No se pudo inicializar Mercado Pago:', err);
  }
}

const MAX_BRANCHES = 10;

function getInitialEmail() {
  const url = new URL(window.location.href);
  return String(url.searchParams.get('email') || '').trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export default function AddBranchPage() {
  const [email, setEmail] = useState(() => getInitialEmail());
  const [qty, setQty] = useState(1);
  const [names, setNames] = useState(['']);
  const [pricing, setPricing] = useState(null);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchPlanPricing();
        if (!cancelled) setPricing(response?.pricing ?? null);
      } catch {
        if (!cancelled) setError('No pudimos cargar el precio de las sucursales.');
      } finally {
        if (!cancelled) setLoadingPricing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mantener el array de nombres alineado con la cantidad.
  useEffect(() => {
    setNames((current) => {
      const next = current.slice(0, qty);
      while (next.length < qty) next.push('');
      return next;
    });
  }, [qty]);

  const unitArs = Number(pricing?.additionalBusiness?.ars || 0);
  const totalArs = useMemo(() => unitArs * qty, [unitArs, qty]);

  const emailValid = isValidEmail(email);
  const namesComplete = names.every((n) => (n || '').trim().length > 0);
  const canPay = emailValid && namesComplete && unitArs > 0 && !!MP_PUBLIC_KEY;

  const updateName = (index, value) => {
    setNames((current) => current.map((n, i) => (i === index ? value : n)));
  };

  const handleBrickSubmit = async (formData) => {
    setError('');
    setMessage('');

    const cleanNames = names.map((n) => (n || '').trim()).filter(Boolean);
    if (cleanNames.length < qty) {
      const msg = 'Completá el nombre de cada sucursal antes de pagar.';
      setError(msg);
      throw new Error(msg);
    }

    try {
      const response = await addBranchesPayment({
        email: email.trim().toLowerCase(),
        businessNames: cleanNames,
        payment: formData,
      });

      const status = String(response.status || '').toLowerCase();
      if (status === 'approved') {
        setMessage(
          `¡Pago aprobado! Cobramos ARS ${Number(response.amount || 0).toLocaleString(
            'es-AR',
          )} y ya creamos ${cleanNames.length} sucursal${
            cleanNames.length === 1 ? '' : 'es'
          }. Abrí la app, entrá a "Mis locales" y vas a verlas.`,
        );
      } else if (status === 'in_process' || status === 'pending') {
        setMessage(
          'Tu pago quedó en revisión de Mercado Pago. Apenas se acredite (suele ser unos minutos) creamos las sucursales automáticamente.',
        );
      } else {
        throw new Error(
          response.statusDetail
            ? `El pago no se pudo completar (${response.statusDetail}). Probá con otra tarjeta.`
            : 'El pago fue rechazado. Probá con otra tarjeta.',
        );
      }
    } catch (err) {
      const msg =
        err?.details?.error || err?.message || 'No pudimos procesar el pago.';
      setError(msg);
      throw err instanceof Error ? err : new Error(msg);
    }
  };

  const handleBrickError = () => {
    setError('Hubo un problema con el formulario de pago. Recargá la página e intentá de nuevo.');
  };

  return (
    <div className={styles.screen}>
      <div className={styles.layout}>
        <div className={styles.leftCol}>
          <p className={styles.eyebrow}>{SHIFT_APP_BRAND_NAME}</p>
          <h1 className={styles.title}>Agregar sucursal</h1>
          <p className={styles.subtitle}>
            Sumá uno o más locales a tu cuenta. Es un pago único por cada sucursal
            nueva; tu plan mensual y el débito automático no cambian.
          </p>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Email de tu cuenta</label>
            <input
              className={styles.localNameInput}
              type="email"
              placeholder="tucuenta@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {email && !emailValid ? (
              <p className={styles.stepHint}>Revisá el formato del email.</p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>¿Cuántas sucursales querés agregar?</label>
            <div className={styles.localsStepper}>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
              >
                −
              </button>
              <span className={styles.stepCount}>{qty}</span>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => setQty((q) => Math.min(MAX_BRANCHES, q + 1))}
                disabled={qty >= MAX_BRANCHES}
              >
                +
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Nombre de cada sucursal</label>
            {names.map((name, index) => (
              <input
                key={index}
                className={styles.localNameInput}
                type="text"
                placeholder={`Sucursal ${index + 1}`}
                value={name}
                onChange={(e) => updateName(index, e.target.value)}
              />
            ))}
          </div>
        </div>

        <div className={styles.rightCol}>
          <div className={styles.formCard}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryRow}>
                <span>Precio por sucursal</span>
                <span>
                  {loadingPricing
                    ? '—'
                    : `ARS ${unitArs.toLocaleString('es-AR')}`}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Cantidad</span>
                <span>{qty}</span>
              </div>
              <div className={styles.summaryTotalRow}>
                <span>Total a pagar</span>
                <span>
                  {loadingPricing
                    ? '—'
                    : `ARS ${totalArs.toLocaleString('es-AR')}`}
                </span>
              </div>
            </div>

            {canPay ? (
              <div className={styles.brickBox}>
                <CardPayment
                  key={`add-branch-${totalArs}`}
                  initialization={{ amount: Number(totalArs) }}
                  customization={{ paymentMethods: { maxInstallments: 1 } }}
                  onSubmit={handleBrickSubmit}
                  onError={handleBrickError}
                />
              </div>
            ) : (
              <p className={styles.brickHint}>
                {!MP_PUBLIC_KEY
                  ? 'El pago no está disponible en este momento.'
                  : 'Completá tu email y el nombre de cada sucursal para habilitar el pago.'}
              </p>
            )}

            {message && (
              <div className={styles.messageBox}>
                <span>{message}</span>
              </div>
            )}
            {error && (
              <div className={styles.errorBox}>
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
