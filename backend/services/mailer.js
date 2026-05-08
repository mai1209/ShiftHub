import nodemailer from "nodemailer";

const MAIL_USER = String(process.env.MAIL_USER ?? "").trim();
const MAIL_APP_PASSWORD = String(process.env.MAIL_APP_PASSWORD ?? "").trim();
const MAIL_FROM_NAME = String(process.env.MAIL_FROM_NAME ?? "Shift App by CODEX®").trim();

let transporter;

function maskEmail(value) {
  const email = String(value ?? "").trim();
  const [user, domain] = email.split("@");
  if (!user || !domain) return email || "(vacio)";
  if (user.length <= 2) return `${user[0] || "*"}***@${domain}`;
  return `${user.slice(0, 2)}***@${domain}`;
}

function logMailer(event, extra = {}) {
  console.log(
    `[MAILER] ${event}`,
    JSON.stringify(
      {
        mailUser: maskEmail(MAIL_USER),
        hasAppPassword: Boolean(MAIL_APP_PASSWORD),
        fromName: MAIL_FROM_NAME,
        ...extra,
      },
      null,
      2,
    ),
  );
}

function buildTransporter() {
  if (transporter) return transporter;

  logMailer("buildTransporter");

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: MAIL_USER,
      pass: MAIL_APP_PASSWORD,
    },
  });

  return transporter;
}

export function getMailerConfigError() {
  if (!MAIL_USER) {
    return "Falta configurar MAIL_USER en backend/.env.";
  }
  if (!MAIL_APP_PASSWORD) {
    return "Falta configurar MAIL_APP_PASSWORD en backend/.env.";
  }
  return null;
}

export function getMailerDebugInfo() {
  return {
    mailUser: maskEmail(MAIL_USER),
    hasAppPassword: Boolean(MAIL_APP_PASSWORD),
    fromName: MAIL_FROM_NAME,
  };
}

export async function verifyMailerConnection() {
  const configError = getMailerConfigError();
  if (configError) {
    return {
      ok: false,
      stage: "config",
      error: configError,
      ...getMailerDebugInfo(),
    };
  }

  try {
    const activeTransporter = buildTransporter();
    const result = await activeTransporter.verify();
    logMailer("verify:success", { result });
    return {
      ok: true,
      stage: "verify",
      result: Boolean(result),
      ...getMailerDebugInfo(),
    };
  } catch (err) {
    const message = String(err?.message ?? err ?? "Error desconocido");
    logMailer("verify:error", {
      message,
      code: err?.code ?? null,
      command: err?.command ?? null,
      response: err?.response ?? null,
      responseCode: err?.responseCode ?? null,
      stack: err?.stack ?? null,
    });
    return {
      ok: false,
      stage: "verify",
      error: message,
      code: err?.code ?? null,
      command: err?.command ?? null,
      response: err?.response ?? null,
      responseCode: err?.responseCode ?? null,
      ...getMailerDebugInfo(),
    };
  }
}

export async function sendAppMail({
  to,
  subject,
  html,
  text,
}) {
  const configError = getMailerConfigError();
  if (configError) {
    logMailer("configError", {
      to: maskEmail(to),
      subject,
      error: configError,
    });
    throw new Error(configError);
  }

  try {
    logMailer("send:start", {
      to: maskEmail(to),
      subject,
      hasHtml: Boolean(html),
      hasText: Boolean(text),
    });
    const activeTransporter = buildTransporter();
    const info = await activeTransporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_USER}>`,
      to,
      subject,
      html,
      text,
    });
    logMailer("send:success", {
      to: maskEmail(to),
      subject,
      messageId: info?.messageId ?? null,
      accepted: info?.accepted ?? [],
      rejected: info?.rejected ?? [],
      response: info?.response ?? null,
    });
    return info;
  } catch (err) {
    const message = String(err?.message ?? err ?? "Error desconocido");
    logMailer("send:error", {
      to: maskEmail(to),
      subject,
      message,
      code: err?.code ?? null,
      command: err?.command ?? null,
      response: err?.response ?? null,
      responseCode: err?.responseCode ?? null,
      stack: err?.stack ?? null,
    });

    if (/Invalid login/i.test(message)) {
      throw new Error(
        "Gmail rechazo el login del correo. Revisa MAIL_USER y MAIL_APP_PASSWORD en backend/.env.",
      );
    }

    throw new Error(`No se pudo enviar el mail: ${message}`);
  }
}
