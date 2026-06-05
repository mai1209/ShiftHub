import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../AuthContext';
import styles from '../Panel.module.css';

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Completá email y contraseña.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await login(email.trim().toLowerCase(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err?.message || 'No pudimos iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginScreen}>
      <form className={styles.loginCard} onSubmit={handleSubmit}>
        <div className={styles.loginBadge}>PANEL · EXCLUSIVO PRO</div>
        <h1 className={styles.loginTitle}>Ingresá al panel</h1>
        <p className={styles.loginSubtitle}>
          Usá el mismo email y contraseña que en la app. El panel web es
          exclusivo para cuentas con <strong>plan Pro</strong> activo.
        </p>

        <label className={styles.fieldLabel}>Email</label>
        <input
          className={styles.input}
          type="email"
          autoComplete="username"
          placeholder="tucorreo@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className={styles.fieldLabel}>Contraseña</label>
        <div className={styles.passwordWrap}>
          <input
            className={styles.input}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            title={showPassword ? 'Ocultar' : 'Ver'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error ? <p className={styles.loginError}>{error}</p> : null}

        <button className={styles.loginButton} type="submit" disabled={loading}>
          {loading ? 'Ingresando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
