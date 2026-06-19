import {  useState } from 'react';
import BookingForm from './BookingForm';
import styles from '../styles/App.module.css';
import { setShopSlug as registerShopSlug } from '../services/api';
import LandingPage from './LandingPage';
import SubscriptionAdmin from './SubscriptionAdmin';
import SubscriptionCouponsPage from './SubscriptionCouponsPage';
import SubscriptionCheckoutPage from './SubscriptionCheckoutPage';
import AddBranchPage from './AddBranchPage';
import NotFoundPage from './NotFoundPage';
import PrivacyPolicyPage from './PrivacyPolicyPage';
import AccountDeletionPage from './AccountDeletionPage';
import RegisterAccountPage from './RegisterAccountPage';
import SupportPage from './SupportPage';
import PanelApp from '../panel/PanelApp';
//import landingStyles from '../styles/LandingPage.module.css';



function sanitizeSlug(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '') || null
  );
}

function resolveInitialSlug() {
  const fromEnv = sanitizeSlug(process.env.REACT_APP_SHOP_SLUG);
  if (fromEnv) return fromEnv;

  const url = new URL(window.location.href);
  const querySlug =
    sanitizeSlug(url.searchParams.get('shop')) ||
    sanitizeSlug(url.searchParams.get('negocio')) ||
    sanitizeSlug(url.searchParams.get('barberia'));
  if (querySlug) return querySlug;

  const [firstSegment] = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  return sanitizeSlug(firstSegment);
}

function resolveInternalPage() {
  const url = new URL(window.location.href);
  const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
  const segments = pathname ? pathname.split('/') : [];

  // Panel de gestión web (con sub-rutas: /panel/login, /panel/turnos, etc.)
  if (segments[0] === 'panel') {
    return 'panel';
  }

  if (pathname === 'admin' || pathname === 'admin/subscriptions') {
    return 'subscription-admin';
  }

  if (pathname === 'admin/subscription-coupons') {
    return 'subscription-coupons';
  }

  if (pathname === 'planes' || pathname === 'suscripcion') {
    return 'subscription-checkout';
  }

  if (pathname === 'agregar-sucursal' || pathname === 'agregar-local') {
    return 'add-branch';
  }

  if (
    pathname === 'soporte' ||
    pathname === 'support'
  ) {
    return 'support';
  }

  if (
    pathname === 'registro' ||
    pathname === 'crear-cuenta' ||
    pathname === 'signup'
  ) {
    return 'register-account';
  }

  if (pathname === 'politica-de-privacidad' || pathname === 'privacy-policy') {
    return 'privacy-policy';
  }

  if (
    pathname === 'eliminacion-de-cuenta' ||
    pathname === 'eliminar-cuenta' ||
    pathname === 'account-deletion'
  ) {
    return 'account-deletion';
  }

  if (
    segments[0] === 'admin' ||
    segments[0] === 'soporte' ||
    segments[0] === 'support' ||
    segments[0] === 'planes' ||
    segments[0] === 'suscripcion' ||
    segments[0] === 'agregar-sucursal' ||
    segments[0] === 'agregar-local' ||
    segments[0] === 'registro' ||
    segments[0] === 'crear-cuenta' ||
    segments[0] === 'signup' ||
    segments[0] === 'politica-de-privacidad' ||
    segments[0] === 'privacy-policy' ||
    segments[0] === 'eliminacion-de-cuenta' ||
    segments[0] === 'eliminar-cuenta' ||
    segments[0] === 'account-deletion'
  ) {
    return 'not-found';
  }

  if (segments.length > 1) {
    return 'not-found';
  }

  return null;
}


function App() {
  const [internalPage] = useState(() => resolveInternalPage());
  const [shopSlug] = useState(() => resolveInitialSlug());
  const [missingShop, setMissingShop] = useState(false);

  if (internalPage === 'panel') {
    return <PanelApp />;
  }

  if (internalPage === 'subscription-admin') {
    return <SubscriptionAdmin />;
  }

  if (internalPage === 'subscription-coupons') {
    return <SubscriptionCouponsPage />;
  }

  if (internalPage === 'subscription-checkout') {
    return <SubscriptionCheckoutPage />;
  }

  if (internalPage === 'add-branch') {
    return <AddBranchPage />;
  }

  if (internalPage === 'register-account') {
    return <RegisterAccountPage />;
  }

  if (internalPage === 'support') {
    return <SupportPage />;
  }

  if (internalPage === 'privacy-policy') {
    return <PrivacyPolicyPage />;
  }

  if (internalPage === 'account-deletion') {
    return <AccountDeletionPage />;
  }

  if (internalPage === 'not-found' || missingShop) {
    return <NotFoundPage />;
  }

  if (shopSlug) registerShopSlug(shopSlug);

  if (!shopSlug) {
    return <LandingPage />;  // ← sin el main wrapper
  }

  return (
    <main className={styles.app}>
      <div className={styles.glow} aria-hidden="true" />
      <BookingForm shopSlug={shopSlug} onNotFound={() => setMissingShop(true)} />
    </main>
  );
}

export default App;
