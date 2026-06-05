import React from 'react';
import { useAuth } from '../AuthContext';
import { planInfo, expiryText, formatDate, renewUrl } from '../subscription';
import styles from '../Panel.module.css';

function MiPlanPage() {
  const { user } = useAuth();
  const info = planInfo(user?.subscription);

  if (!info) {
    return <p className={styles.muted}>No pudimos leer la información del plan.</p>;
  }

  const expired = info.days != null && info.days < 0;

  return (
    <div>
      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <h3 className={styles.detailCardTitle}>Tu plan</h3>

          <div className={styles.planRow}>
            <span className={styles.planRowLabel}>Plan</span>
            <strong className={styles.planRowValue}>{info.planLabel}</strong>
          </div>
          <div className={styles.planRow}>
            <span className={styles.planRowLabel}>Estado</span>
            <span
              className={`${styles.statusBadge} ${
                info.status === 'active' || info.status === 'trial'
                  ? styles.statusOn
                  : styles.statusOff
              }`}
            >
              {info.statusLabel}
            </span>
          </div>
          <div className={styles.planRow}>
            <span className={styles.planRowLabel}>Locales incluidos</span>
            <strong className={styles.planRowValue}>{info.locales}</strong>
          </div>
          <div className={styles.planRow}>
            <span className={styles.planRowLabel}>Renovación</span>
            <strong className={styles.planRowValue}>
              {info.automatic ? 'Automática' : 'Manual'}
            </strong>
          </div>
          {info.expiry ? (
            <div className={styles.planRow}>
              <span className={styles.planRowLabel}>
                {info.automatic ? 'Próximo cobro' : 'Vence'}
              </span>
              <strong
                className={styles.planRowValue}
                style={expired ? { color: '#b91c1c' } : undefined}
              >
                {formatDate(info.expiry)}
              </strong>
            </div>
          ) : null}

          {info.days != null && info.plan !== 'free' ? (
            <div
              className={`${styles.planStatusNote} ${
                expired ? styles.planStatusNoteDanger : ''
              }`}
            >
              Tu plan {expiryText(info)}.
            </div>
          ) : null}
        </div>

        <div className={styles.detailCard}>
          <h3 className={styles.detailCardTitle}>Pago</h3>
          {info.isStore ? (
            <p className={styles.muted} style={{ marginTop: 0 }}>
              Tu suscripción se gestiona desde la <strong>tienda</strong> (App Store
              / Google Play). Para cambiar o renovar el plan, hacelo desde la app en
              tu teléfono.
            </p>
          ) : (
            <>
              <p className={styles.muted} style={{ marginTop: 0 }}>
                {info.plan === 'free'
                  ? 'Estás en el plan gratis. Pasá a un plan pago para desbloquear todas las funciones.'
                  : 'Renová o cambiá tu plan cuando quieras. El pago es seguro con Mercado Pago.'}
              </p>
              <a
                className={styles.primaryBtn}
                href={renewUrl(user, info)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  marginTop: 6,
                }}
              >
                {info.plan === 'free' ? 'Ver planes' : 'Renovar / pagar'}
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MiPlanPage;
