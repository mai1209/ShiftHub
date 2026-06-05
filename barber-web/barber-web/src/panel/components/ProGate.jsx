import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { planInfo } from '../subscription';
import styles from '../Panel.module.css';

function ProGate() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const info = planInfo(user?.subscription);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const checkoutUrl = `/planes?plan=pro${
    user?.email ? `&email=${encodeURIComponent(user.email)}` : ''
  }`;

  return (
    <div className={styles.gateScreen}>
      <div className={styles.gateCard}>
        <div className={styles.gateBadge}>PLAN PRO</div>
        <h1 className={styles.gateTitle}>El panel web es una función Pro</h1>
        <p className={styles.gateText}>
          Tu plan actual es <strong>{info?.planLabel || '—'}</strong>. Para usar
          el panel web (agenda, métricas, caja, productos y más) necesitás el
          plan <strong>Pro</strong> activo.
        </p>

        {info?.isStore ? (
          <p className={styles.muted}>
            Gestioná tu plan desde la App Store / Google Play en tu teléfono.
          </p>
        ) : (
          <a
            className={styles.primaryBtn}
            href={checkoutUrl}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
            }}
          >
            Mejorar a Pro
          </a>
        )}

        <button className={styles.gateLogout} onClick={handleLogout}>
          Salir
        </button>
      </div>
    </div>
  );
}

export default ProGate;
