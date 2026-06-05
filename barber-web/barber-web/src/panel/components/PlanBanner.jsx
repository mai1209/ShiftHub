import React from 'react';
import { useAuth } from '../AuthContext';
import { planInfo, shouldNudge, expiryText, renewUrl } from '../subscription';
import styles from '../Panel.module.css';

// Aviso arriba del panel cuando el plan está por vencer o vencido.
function PlanBanner() {
  const { user, isOwner } = useAuth();
  if (!isOwner) return null;

  const info = planInfo(user?.subscription);
  if (!shouldNudge(info)) return null;

  const expired = info.days < 0;

  return (
    <div className={`${styles.planBanner} ${expired ? styles.planBannerDanger : ''}`}>
      <span className={styles.planBannerText}>
        {expired ? '⚠️ ' : '⏳ '}
        Tu plan {info.planLabel} {expiryText(info)}.
        {info.isStore ? ' Gestionalo desde la tienda (App Store / Google Play).' : ''}
      </span>
      {!info.isStore ? (
        <a className={styles.planBannerBtn} href={renewUrl(user, info)}>
          Renovar / pagar
        </a>
      ) : null}
    </div>
  );
}

export default PlanBanner;
