import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  login as apiLogin,
  setToken,
  getToken,
  setActiveShopId,
  getActiveShopId,
  clearSession,
} from '../services/panelApi';

const AuthContext = createContext(null);

const USER_KEY = 'panel_user';

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

function writeStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch (_e) {
    /* noop */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? readStoredUser() : null));
  const [activeShop, setActiveShopState] = useState(() => {
    const u = getToken() ? readStoredUser() : null;
    const shops = u?.shops || [];
    const storedId = getActiveShopId();
    return (
      shops.find((s) => String(s._id) === String(storedId)) ||
      u?.activeShop ||
      shops[0] ||
      null
    );
  });

  const isAuthenticated = Boolean(user && getToken());
  const role = user?.role || null;
  const isOwner = role === 'admin' || role === 'owner';

  const login = useCallback(async (email, password) => {
    const res = await apiLogin(email, password);
    setToken(res.token);
    writeStoredUser(res.user);
    setUser(res.user);

    const shops = res.user?.shops || [];
    const initialShop = res.user?.activeShop || shops[0] || null;
    if (initialShop?._id) setActiveShopId(initialShop._id);
    setActiveShopState(initialShop);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    writeStoredUser(null);
    setUser(null);
    setActiveShopState(null);
  }, []);

  const selectShop = useCallback((shop) => {
    if (!shop?._id) return;
    setActiveShopId(shop._id);
    setActiveShopState(shop);
  }, []);

  const value = useMemo(
    () => ({
      user,
      role,
      isOwner,
      isAuthenticated,
      activeShop,
      shops: user?.shops || [],
      login,
      logout,
      selectShop,
    }),
    [user, role, isOwner, isAuthenticated, activeShop, login, logout, selectShop],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
