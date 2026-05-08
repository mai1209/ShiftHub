import styles from '../styles/SupportPage.module.css';
import { SHIFT_APP_BRAND_NAME } from '../utils/businessCopy';
import {
  ACCOUNT_DELETION_URL,
  PRIVACY_POLICY_URL,
  SUPPORT_EMAIL,
  buildSupportMailUrl,
  buildWhatsAppUrl,
} from '../utils/publicLinks';

const SUPPORT_MAIL_URL = buildSupportMailUrl(
  `Soporte ${SHIFT_APP_BRAND_NAME}`,
);
const SUPPORT_WHATSAPP_URL = buildWhatsAppUrl(
  `Hola, necesito ayuda con mi cuenta de ${SHIFT_APP_BRAND_NAME}`,
);

export default function SupportPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{SHIFT_APP_BRAND_NAME}</p>
        <h1>Centro de soporte</h1>
        <p className={styles.updated}>Última actualización: 27 de abril de 2026</p>

        <p>
          Esta página reúne los datos públicos de soporte, privacidad y
          eliminación de cuenta requeridos para la app y para la web.
        </p>

        <div className={styles.contactGrid}>
          <a className={styles.contactCard} href={SUPPORT_MAIL_URL}>
            <span>Soporte por email</span>
            <strong>{SUPPORT_EMAIL}</strong>
            <small>Ideal para acceso, facturación, cambios de cuenta y revisión comercial.</small>
          </a>
          <a className={styles.contactCard} href={SUPPORT_WHATSAPP_URL}>
            <span>Soporte por WhatsApp</span>
            <strong>+54 342 554-3308</strong>
            <small>Contacto rápido para orientación operativa y seguimiento de casos.</small>
          </a>
        </div>

        <h2>Tiempos de respuesta</h2>
        <ul>
          <li>Email: normalmente dentro de 1 día hábil.</li>
          <li>WhatsApp: normalmente dentro del mismo día hábil.</li>
          <li>Solicitudes de eliminación de cuenta: revisión inicial dentro de 72 horas hábiles.</li>
        </ul>

        <h2>Altas, renovación y compras</h2>
        <p>
          El registro inicial, la activación de planes y la gestión comercial se
          resuelven por web. La app móvil queda enfocada en operar cuentas ya
          activas y administrar el negocio.
        </p>

        <h2>Privacidad y eliminación de cuenta</h2>
        <p>
          Podés revisar las políticas públicas y los plazos de retención en estas rutas:
        </p>
        <ul>
          <li>
            <a href={PRIVACY_POLICY_URL}>Política de privacidad</a>
          </li>
          <li>
            <a href={ACCOUNT_DELETION_URL}>Eliminación de cuenta y datos</a>
          </li>
        </ul>

        <h2>Cómo eliminar la cuenta</h2>
        <p>
          Si ya ingresaste en la app, podés abrir <strong>Ajustes &gt; Eliminar cuenta</strong> y
          enviar la solicitud desde ahí. También podés escribirnos por email con el
          nombre del negocio, el email registrado y la confirmación de que querés
          eliminar la cuenta y los datos asociados.
        </p>

        <h2>Qué incluir en un pedido de soporte</h2>
        <ul>
          <li>Nombre del negocio o de la cuenta.</li>
          <li>Email registrado.</li>
          <li>Plataforma usada: iPhone, Android o panel web.</li>
          <li>Descripción breve del problema y, si podés, captura de pantalla.</li>
        </ul>
      </section>
    </main>
  );
}
