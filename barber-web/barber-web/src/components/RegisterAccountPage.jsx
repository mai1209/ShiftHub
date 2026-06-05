import { useMemo, useState } from 'react';
import { registerPublicAccount } from '../services/api';
import styles from '../styles/RegisterAccountPage.module.css';
import {
  BUSINESS_TYPE_OPTIONS,
  SHIFT_APP_BRAND_NAME,
} from '../utils/businessCopy';

const APP_STORE_URL = 'https://apps.apple.com/ar/app/shifthub/id6767229780';

function EyeIcon({ visible }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={styles.passwordToggleIcon}
    >
      <path
        d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {!visible && (
        <path
          d="M4 4l16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function buildPlansUrl(email) {
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const target = new URL('/planes', window.location.origin);
  if (trimmedEmail) target.searchParams.set('email', trimmedEmail);
  return target.toString();
}

export default function RegisterAccountPage() {
  const [fullName, setFullName]               = useState('');
  const [email, setEmail]                     = useState('');
  const [phone, setPhone]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessType, setBusinessType]       = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [successOpen, setSuccessOpen]         = useState(false);

  const isFormValid = useMemo(
    () =>
      fullName.trim().length >= 3 &&
      email.trim().length > 0 &&
      phone.trim().length >= 6 &&
      password.length >= 8 &&
      confirmPassword.length >= 8 &&
      businessType.trim().length > 0,
    [businessType, confirmPassword.length, email, fullName, phone, password.length],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (!isFormValid) {
      setError('Completá nombre, rubro, email, teléfono y una contraseña de al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await registerPublicAccount({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        businessType,
        registrationSource: 'web',
      });
      setSuccessOpen(true);
    } catch (err) {
      setError(err.message || 'No pudimos crear la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  const goToPlans = () => {
    window.location.assign(buildPlansUrl(email));
  };

  return (
    <main className={styles.screen}>
      {/* Background orbs */}
      <div className={styles.orbTop}    aria-hidden="true" />
      <div className={styles.orbBottom} aria-hidden="true" />
      <div className={styles.meshGrid}  aria-hidden="true" />

      {/* ── HEADER STRIP ── */}
      <header className={styles.topBar}>
        <a href="/" className={styles.backBtn}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Volver al inicio
        </a>
        <div className={styles.topBarBrand}>
          <div className={styles.topBarMark}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.9"/>
              <rect x="8" y="1" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="1" y="8" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="8" y="8" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <span className={styles.topBarName}>{SHIFT_APP_BRAND_NAME}</span>
        </div>
      </header>

      {/* ── LAYOUT ── */}
      <div className={styles.layout}>

        {/* LEFT PANEL */}
        <aside className={styles.leftPanel}>
          <div className={styles.leftPanelInner}>
            <p className={styles.eyebrow}>Alta de cuenta</p>
            <h1 className={styles.title}>
              Creá tu cuenta<br />
              <span className={styles.titleAccent}>y elegí tu plan.</span>
            </h1>
            <p className={styles.subtitle}>
              Registrá tu negocio en menos de 2 minutos. Después elegís el plan y activás desde la web.
            </p>

            {/* Helper card */}
            <div className={styles.helperCard}>
              <div className={styles.helperIcon}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p className={styles.helperTitle}>Que pasa despues</p>
                <p className={styles.helperText}>
                  Al crear la cuenta te redirigimos a la pantalla de planes con tu email precargado para que actives sin friccion.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT PANEL — FORM */}
        <section className={styles.formCard}>
          <div className={styles.formCardHeader}>
            <span className={styles.formCardTag}>Registro gratuito</span>
            <p className={styles.formCardCaption}>Completá los datos de tu negocio</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>

            {/* Nombre */}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Nombre de tu negocio</span>
              <div className={styles.inputWrap}>
                <div className={styles.inputIcon}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </div>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Saiko Cuts"
                  autoComplete="organization"
                  required
                  className={fullName.trim().length >= 3 ? styles.inputValid : ''}
                />
                {fullName.trim().length >= 3 && (
                  <div className={styles.inputCheck}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            </label>

            {/* Rubro */}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Rubro principal</span>
              <div className={styles.inputWrap}>
                <div className={styles.inputIcon}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6L8 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  </svg>
                </div>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  required
                  className={businessType ? styles.inputValid : ''}
                >
                  <option value="" disabled>Elegi un rubro</option>
                  {BUSINESS_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className={styles.selectChevron}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {businessType && (
                  <div className={styles.inputCheck}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            </label>

            <div className={styles.fieldDivider}>
              <span>Datos de acceso</span>
            </div>

            {/* Email */}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email de acceso</span>
              <div className={styles.inputWrap}>
                <div className={styles.inputIcon}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@negocio.com"
                  autoComplete="email"
                  required
                  className={email.trim().length > 5 && email.includes('@') ? styles.inputValid : ''}
                />
                {email.trim().length > 5 && email.includes('@') && (
                  <div className={styles.inputCheck}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            </label>

            {/* Teléfono */}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Teléfono</span>
              <div className={styles.inputWrap}>
                <div className={styles.inputIcon}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 2.5h2.2l1 2.6-1.4 1A8 8 0 0 0 8.4 9.2l1-1.4 2.6 1V11c0 .8-.7 1.5-1.5 1.4A10 10 0 0 1 1.6 4 1.4 1.4 0 0 1 3 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  </svg>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: 11 2345 6789"
                  autoComplete="tel"
                  required
                  className={phone.trim().length >= 6 ? styles.inputValid : ''}
                />
                {phone.trim().length >= 6 && (
                  <div className={styles.inputCheck}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            </label>

            {/* Passwords */}
            <div className={styles.passwordGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Contrasena</span>
                <div className={styles.inputWrap}>
                  <div className={styles.inputIcon}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      <circle cx="8" cy="10.5" r="1" fill="currentColor"/>
                    </svg>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 caracteres"
                    autoComplete="new-password"
                    required
                    className={password.length >= 8 ? styles.inputValid : ''}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  >
                    <EyeIcon visible={showPassword} />
                  </button>
                </div>
                {password.length > 0 && (
                  <div className={styles.strengthBar}>
                    <div
                      className={styles.strengthFill}
                      style={{
                        width: password.length >= 12 ? '100%' : password.length >= 8 ? '65%' : '30%',
                        background: password.length >= 12 ? 'var(--emerald)' : password.length >= 8 ? 'var(--indigo)' : 'var(--amber)',
                      }}
                    />
                  </div>
                )}
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Repetir contrasena</span>
                <div className={styles.inputWrap}>
                  <div className={styles.inputIcon}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      <path d="M6.5 10.5l1 1 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeti la contrasena"
                    autoComplete="new-password"
                    required
                    className={
                      confirmPassword.length >= 8 && confirmPassword === password
                        ? styles.inputValid
                        : confirmPassword.length > 0 && confirmPassword !== password
                        ? styles.inputError
                        : ''
                    }
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Ocultar confirmacion' : 'Mostrar confirmacion'}
                  >
                    <EyeIcon visible={showConfirm} />
                  </button>
                </div>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className={styles.fieldHint}>Las contrasenas no coinciden</p>
                )}
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading || !isFormValid}
            >
              {loading ? (
                <>
                  <span className={styles.spinner} />
                  Creando cuenta...
                </>
              ) : (
                <>
                  Crear cuenta y seguir
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          {error && (
            <div className={styles.errorBox} role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.errorIcon}>
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5M8 11v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <p className={styles.formFooterNote}>
            Al registrarte aceptas los terminos de uso de{' '}
            <strong>{SHIFT_APP_BRAND_NAME}</strong>.
          </p>
        </section>
      </div>

      {successOpen ? (
        <div
          className={styles.successOverlay}
          onClick={() => setSuccessOpen(false)}
        >
          <div
            className={styles.successModal}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.successClose}
              aria-label="Cerrar"
              onClick={() => setSuccessOpen(false)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className={styles.successBadge}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 12.5l5 5 11-11"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h2 className={styles.successTitle}>¡Tu cuenta ya está lista!</h2>
            <p className={styles.successText}>
              Bienvenido a <strong>{SHIFT_APP_BRAND_NAME}</strong>. Descargá la
              app y empezá a usarla <strong>gratis</strong> ahora mismo, o activá
              un plan para desbloquear todas las funciones (métricas, equipo,
              caja, cupones y más).
            </p>

            <div className={styles.successActions}>
              <a
                className={styles.successPrimaryBtn}
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Descargar la app gratis
              </a>
              <button
                type="button"
                className={styles.successSecondaryBtn}
                onClick={goToPlans}
              >
                Activar un plan ahora
              </button>
            </div>

            <p className={styles.successFootnote}>
              Podés empezar gratis y pasar a un plan cuando quieras.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
