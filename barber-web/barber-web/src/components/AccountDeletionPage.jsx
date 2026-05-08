import styles from '../styles/PrivacyPolicyPage.module.css';
import { SHIFT_APP_BRAND_NAME } from '../utils/businessCopy';
import {
  SUPPORT_EMAIL,
  SUPPORT_URL,
  buildSupportMailUrl,
} from '../utils/publicLinks';

const ACCOUNT_DELETION_MAIL_URL = buildSupportMailUrl(
  `Solicitud de eliminación de cuenta ${SHIFT_APP_BRAND_NAME}`,
);

export default function AccountDeletionPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{SHIFT_APP_BRAND_NAME}</p>
        <h1>Eliminación de cuenta y datos</h1>
        <p className={styles.updated}>Última actualización: 21 de abril de 2026</p>

        <p>
          {`En esta página explicamos cómo los usuarios de ${SHIFT_APP_BRAND_NAME} pueden `}
          solicitar la eliminación de su cuenta y de los datos asociados.
        </p>

        <h2>Cómo solicitar la eliminación</h2>
        <p>
          Para pedir la eliminación de tu cuenta, enviá un email a{' '}
          <a href={ACCOUNT_DELETION_MAIL_URL}>{SUPPORT_EMAIL}</a>{' '}
          {`con el asunto `}
          <strong>{`Solicitud de eliminación de cuenta ${SHIFT_APP_BRAND_NAME}`}</strong>.
        </p>
        <p>
          Si ya ingresaste en la app, también podés iniciar el pedido desde{' '}
          <strong>Ajustes &gt; Eliminar cuenta</strong>. Dejamos ambas vías para
          cumplir el flujo exigido por tienda y para que el titular elija la más cómoda.
        </p>
        <p>Incluí en el mensaje:</p>
        <ul>
          <li>Nombre de la barbería o cuenta.</li>
          <li>{`Email con el que te registraste en ${SHIFT_APP_BRAND_NAME}.`}</li>
          <li>URL pública o slug de tu negocio, si lo tenés disponible.</li>
          <li>Confirmación escrita de que querés eliminar la cuenta y los datos asociados.</li>
        </ul>

        <h2>Qué datos se eliminan</h2>
        <ul>
          <li>Cuenta de usuario de la barbería.</li>
          <li>Datos del negocio: nombre, slug, logo, portada, colores y configuración.</li>
          <li>Servicios, precios, horarios, barberos y accesos de barberos.</li>
          <li>Turnos asociados a la cuenta, incluyendo datos de clientes registrados en esos turnos.</li>
          <li>Tokens de notificaciones push y configuraciones operativas de la cuenta.</li>
          <li>Datos técnicos de conexión con proveedores de pago, cuando correspondan.</li>
        </ul>

        <h2>Datos que pueden conservarse temporalmente</h2>
        <p>
          Podemos conservar algunos registros mínimos cuando sea necesario por
          obligaciones legales, seguridad, prevención de fraude, soporte, respaldo
          técnico o resolución de disputas.
        </p>
        <ul>
          <li>Registros de pagos, facturación o suscripción: hasta 10 años si la normativa aplicable lo requiere.</li>
          <li>Backups técnicos: hasta 90 días antes de su rotación o eliminación automática.</li>
          <li>Registros de seguridad o auditoría: hasta 180 días, salvo que exista una investigación o requerimiento legal.</li>
        </ul>

        <h2>Plazo de procesamiento</h2>
        <p>
          Revisaremos la solicitud y responderemos al email de contacto. Una vez
          verificada la titularidad de la cuenta, procesaremos la eliminación en
          un plazo razonable, normalmente dentro de los 30 días.
        </p>

        <h2>Clientes finales de una barbería</h2>
        <p>
          {`Si reservaste un turno en un negocio que usa ${SHIFT_APP_BRAND_NAME} y querés `}
          eliminar tus datos de esa reserva, escribinos a{' '}
          <a href={ACCOUNT_DELETION_MAIL_URL}>{SUPPORT_EMAIL}</a>{' '}
          indicando el nombre de la barbería, fecha del turno y email o WhatsApp
          usado en la reserva.
        </p>

        <h2>Contacto</h2>
        <p>
          Para consultas sobre eliminación de datos o privacidad, escribinos a{' '}
          <a href={ACCOUNT_DELETION_MAIL_URL}>{SUPPORT_EMAIL}</a>. También podés
          revisar el <a href={SUPPORT_URL}>centro de soporte</a>.
        </p>
      </section>
    </main>
  );
}
