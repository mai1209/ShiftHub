import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  TrendingUp,
  ClipboardList,
  Wallet,
  ShoppingBag,
  CreditCard,
  Scissors,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { hasProAccess } from './subscription';
import PlanBanner from './components/PlanBanner';
import ProGate from './components/ProGate';
import { SHIFT_APP_BRAND_NAME } from '../utils/businessCopy';
import styles from './Panel.module.css';

// Título + subtítulo que se muestra en la barra superior por sección.
const SECTION_META = {
  '/': { title: 'Resumen', subtitle: '' },
  '/turnos': { title: 'Turnos', subtitle: 'Agenda del negocio' },
  '/pedir-turno': { title: 'Pedir turno', subtitle: 'Alta rápida' },
  '/empleados': { title: 'Empleados', subtitle: 'Tu equipo' },
  '/servicios': { title: 'Servicios', subtitle: 'Catálogo y precios' },
  '/metricas': { title: 'Métricas', subtitle: 'Ingresos y turnos' },
  '/historial': { title: 'Historial', subtitle: 'Servicios y cobros' },
  '/caja': { title: 'Caja', subtitle: 'Ingresos y egresos' },
  '/productos': { title: 'Productos', subtitle: 'Catálogo y ventas' },
  '/plan': { title: 'Mi plan', subtitle: 'Suscripción y pago' },
};

// Ítems del menú. ownerOnly => solo dueño.
const NAV_ITEMS = [
  { to: '/', label: 'Resumen', Icon: LayoutDashboard, end: true },
  { to: '/turnos', label: 'Turnos', Icon: CalendarDays },
  { to: '/empleados', label: 'Empleados', Icon: Users, ownerOnly: true },
  { to: '/servicios', label: 'Servicios', Icon: Scissors, ownerOnly: true },
  { to: '/metricas', label: 'Métricas', Icon: TrendingUp },
  { to: '/historial', label: 'Historial', Icon: ClipboardList, ownerOnly: true },
  { to: '/caja', label: 'Caja', Icon: Wallet, ownerOnly: true },
  { to: '/productos', label: 'Productos', Icon: ShoppingBag, ownerOnly: true },
  { to: '/plan', label: 'Mi plan', Icon: CreditCard, ownerOnly: true },
];

function PanelLayout() {
  const { user, isOwner, activeShop, shops, selectShop, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const section =
    SECTION_META[location.pathname] ||
    (location.pathname.startsWith('/empleados')
      ? { title: 'Empleados', subtitle: 'Detalle del empleado' }
      : { title: '', subtitle: '' });

  // El panel web es solo para plan Pro activo (el profesional hereda el del dueño).
  if (!hasProAccess(user?.subscription)) {
    return <ProGate />;
  }

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const items = NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner);

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}
      >
        <div className={styles.brand}>
          <img
            className={styles.brandLogo}
            src={`${process.env.PUBLIC_URL}/shift-mark.svg`}
            alt={SHIFT_APP_BRAND_NAME}
          />
          <span className={styles.brandName}>{SHIFT_APP_BRAND_NAME}</span>
        </div>

        <nav className={styles.nav}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
              onClick={() => setMenuOpen(false)}
            >
              <item.Icon size={18} strokeWidth={2} className={styles.navIcon} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userBox}>
            <span className={styles.userName}>{user?.fullName || user?.email}</span>
            <span className={styles.userRole}>
              {isOwner ? 'Dueño' : 'Profesional'}
            </span>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Salir
          </button>
        </div>
      </aside>

      {menuOpen ? (
        <div
          className={styles.backdrop}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Main */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            className={styles.burger}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menú"
          >
            ☰
          </button>

          <div className={styles.topbarTitle}>
            <span className={styles.topbarTitleMain}>{section.title}</span>
            {section.subtitle ? (
              <span className={styles.topbarTitleSub}>{section.subtitle}</span>
            ) : null}
          </div>

          <div className={styles.topbarSpacer} />

          <div className={styles.topbarShop}>
            {shops && shops.length > 1 && isOwner ? (
              <select
                className={styles.shopSelect}
                value={activeShop?._id || ''}
                onChange={(e) => {
                  const next = shops.find((s) => String(s._id) === e.target.value);
                  if (next) {
                    selectShop(next);
                    // Recargamos para refrescar los datos scopeados al local.
                    window.location.reload();
                  }
                }}
              >
                {shops.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className={styles.shopName}>
                {activeShop?.name || 'Mi negocio'}
              </span>
            )}
          </div>
        </header>

        <main className={styles.content}>
          <PlanBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default PanelLayout;
