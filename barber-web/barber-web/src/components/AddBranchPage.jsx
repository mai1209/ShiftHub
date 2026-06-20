import { useState } from 'react';
import { addBranchesPayment } from '../services/api';

function getQueryEmail() {
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get('email') || '').trim();
  } catch (_e) {
    return '';
  }
}

export default function AddBranchPage() {
  const [email, setEmail] = useState(getQueryEmail);
  const [branchName, setBranchName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canSubmit =
    email.includes('@') && branchName.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const res = await addBranchesPayment({
        email: email.trim().toLowerCase(),
        businessNames: [branchName.trim()],
      });
      setMessage(
        res?.message ||
          'Sucursal agregada. El costo se suma a tu plan y se cobra en tu próxima renovación.',
      );
      setBranchName('');
    } catch (err) {
      setError(err.message || 'No pudimos agregar la sucursal.');
    } finally {
      setSubmitting(false);
    }
  };

  const S = {
    screen: {
      minHeight: '100vh',
      background:
        'radial-gradient(circle at top right, rgba(214,11,123,0.06), transparent 34%), linear-gradient(180deg, #f7f8fc 0%, #eef2f7 100%)',
      color: '#0f172a',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '48px 16px',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    },
    card: {
      width: '100%',
      maxWidth: 460,
      background: '#fff',
      color: '#0f172a',
      borderRadius: 20,
      padding: 24,
      border: '1px solid rgba(15,23,42,.06)',
      boxShadow: '0 24px 60px rgba(15,23,42,.12)',
    },
    eyebrow: { color: '#d60b7b', fontWeight: 800, letterSpacing: 2, fontSize: 12 },
    h1: { fontSize: 24, margin: '6px 0 4px' },
    sub: { color: '#64748b', fontSize: 14, margin: '0 0 18px' },
    label: { display: 'block', fontWeight: 700, fontSize: 13, margin: '14px 0 6px' },
    input: {
      width: '100%',
      padding: '12px 14px',
      borderRadius: 12,
      border: '1px solid rgba(15,23,42,.15)',
      fontSize: 15,
    },
    note: {
      marginTop: 18,
      padding: 14,
      borderRadius: 14,
      background: '#fff0f7',
      border: '1px solid #fbcfe8',
      color: '#9d174d',
      fontSize: 13,
      lineHeight: 1.5,
    },
    btn: {
      marginTop: 18,
      width: '100%',
      padding: '14px',
      borderRadius: 14,
      border: 0,
      background: 'linear-gradient(135deg, #ff1493 0%, #d60b7b 100%)',
      color: '#fff',
      fontWeight: 800,
      fontSize: 15,
      cursor: canSubmit ? 'pointer' : 'not-allowed',
      opacity: canSubmit ? 1 : 0.5,
    },
    msg: { marginTop: 16, padding: 12, borderRadius: 12, background: '#ecfdf5', color: '#065f46' },
    err: { marginTop: 16, padding: 12, borderRadius: 12, background: '#fef2f2', color: '#991b1b' },
  };

  return (
    <main style={S.screen}>
      <div style={S.card}>
        <div style={S.eyebrow}>SHIFTHUB</div>
        <h1 style={S.h1}>Agregar una sucursal</h1>
        <p style={S.sub}>
          Sumá un local más a tu cuenta. Disponible para el plan Pro.
        </p>

        <label style={S.label}>Email de tu cuenta</label>
        <input
          style={S.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@negocio.com"
        />

        <label style={S.label}>Nombre de la nueva sucursal</label>
        <input
          style={S.input}
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          placeholder="Ej. Sucursal Centro"
        />

        <div style={S.note}>
          El costo de la sucursal se <strong>suma a tu plan mensual</strong> y se
          cobra en tu próxima renovación. No es un pago aparte.
        </div>

        <button style={S.btn} disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? 'Agregando…' : 'Agregar sucursal'}
        </button>

        {message ? <div style={S.msg}>{message}</div> : null}
        {error ? <div style={S.err}>{error}</div> : null}
      </div>
    </main>
  );
}
