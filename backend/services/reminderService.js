import admin from "../firebase.js";
import { AppointmentModel } from "../models/Appointment.js";
import { BarberModel } from "../models/Barber.js";
import { UserModel } from "../models/User.js";
import { sendAppMail } from "./mailer.js";
import { SHOP_TIME_ZONE, getTimeZoneLabel } from "../utils/timezone.js";
import { resolveAssignedBarberPushTarget } from "../utils/pushRecipients.js";

function getNotificationSettings(userDoc) {
  return {
    barberReminderEnabled:
      userDoc?.notificationSettings?.barberReminderEnabled !== false,
    barberReminderMinutesBefore: Number(
      userDoc?.notificationSettings?.barberReminderMinutesBefore || 60,
    ),
    customerSameDayEmailEnabled:
      userDoc?.notificationSettings?.customerSameDayEmailEnabled !== false,
  };
}

function buildCustomerReminderMailHtml({
  customerName,
  shopName,
  barberName,
  barberPhone,
  service,
  appointmentDate,
}) {
  const dateLabel = appointmentDate.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: SHOP_TIME_ZONE,
  });
  const timeLabel = appointmentDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SHOP_TIME_ZONE,
  });
  const cancelPhone = String(barberPhone || "").replace(/\s+/g, "");

  return `
    <div style="background-color: #121212; color: #ffffff; padding: 30px; font-family: sans-serif; border-radius: 15px; max-width: 500px; margin: auto; border: 1px solid #B89016;">
      <div style="text-align: center; margin-bottom: 25px;">
        <h2 style="color: #B89016; margin: 0; font-size: 24px; letter-spacing: 1px;">RECORDATORIO DE TURNO</h2>
        <p style="color: #888; font-size: 14px; margin-top: 10px;">Hola <strong>${customerName}</strong>, te recordamos que hoy tenés turno en <b>${shopName}</b>.</p>
      </div>

      <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
        <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Barbero:</strong>
        <span style="color: #FF1493; font-weight: bold;">${barberName}${barberPhone ? ` · ${barberPhone}` : ""}</span>
      </p>
      <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
        <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Servicio:</strong>
        <span style="color: #FF1493; font-weight: bold;">${service}</span>
      </p>
      <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
        <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Fecha:</strong>
        <span style="color: #FF1493; font-weight: bold;">${dateLabel}</span>
      </p>
      <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
        <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Hora:</strong>
        <span style="color: #FF1493; font-weight: bold;">${timeLabel}</span>
      </p>

      <div style="text-align: center; margin-top: 16px;">
        ${cancelPhone ? `
        <a href="https://wa.me/${cancelPhone}?text=Hola!%20Soy%20${encodeURIComponent(customerName)},%20te%20escribo%20por%20mi%20turno%20de%20hoy%20${encodeURIComponent(dateLabel)}%20a%20las%20${encodeURIComponent(timeLabel)}%20para%20cancelarlo"
          style="background-color: #FF1493; color: white; padding: 12px 18px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; font-size: 14px; border: 1px solid #ff4d4d; margin-bottom: 8px;">
          CANCELAR TURNO
        </a>
        ` : ""}
      </div>

      <div style="text-align: center; margin-top: 12px;">
        <p style="font-size: 9px; color: #444; letter-spacing: 3px; margin: 0; text-transform: uppercase;">
          POWERED BY CODEX® SYSTEM
        </p>
      </div>
    </div>
  `;
}

function canSendCustomerReminder({ appointment, settings, now }) {
  if (!settings.customerSameDayEmailEnabled) return false;
  if (!appointment.customerEmail || appointment.customerReminderSentAt) return false;
  if (appointment.status !== "pending") return false;
  if (new Date(appointment.startTime).getTime() <= now.getTime()) return false;

  const appointmentLabel = getTimeZoneLabel(appointment.startTime, SHOP_TIME_ZONE);
  const nowLabel = getTimeZoneLabel(now, SHOP_TIME_ZONE);
  const localHour = Number(nowLabel.time.split(":")[0] || 0);

  if (appointmentLabel.date !== nowLabel.date) return false;
  if (localHour < 7) return false;

  return true;
}

function canSendBarberReminder({ appointment, settings, pushToken, now }) {
  if (!settings.barberReminderEnabled) return false;
  if (!pushToken) return false;
  if (appointment.barberReminderSentAt) return false;
  if (appointment.status !== "pending") return false;

  const startMs = new Date(appointment.startTime).getTime();
  const deltaMinutes = Math.floor((startMs - now.getTime()) / 60000);

  return deltaMinutes > 0 && deltaMinutes <= settings.barberReminderMinutesBefore;
}

export function isReminderRunAuthorized(req) {
  const expectedSecret = String(
    process.env.REMINDERS_CRON_SECRET || process.env.CRON_SECRET || "",
  ).trim();
  if (!expectedSecret) return false;

  const authHeader = String(req.headers.authorization || "").trim();
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const providedSecret = String(
    bearerSecret || req.headers["x-reminder-secret"] || req.query?.secret || "",
  ).trim();

  return providedSecret === expectedSecret;
}

export async function processAppointmentReminders({ now = new Date() } = {}) {
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const appointments = await AppointmentModel.find({
    status: "pending",
    startTime: { $gte: now, $lte: windowEnd },
    $or: [
      { barberReminderSentAt: null },
      { customerReminderSentAt: null },
    ],
  })
    .sort({ startTime: 1 })
    .lean();

  let barberPushSent = 0;
  let customerMailSent = 0;
  let processed = 0;

  for (const appointment of appointments) {
    processed += 1;
    const [userDoc, barberDoc, pushTarget] = await Promise.all([
      UserModel.findById(appointment.owner).lean(),
      BarberModel.findById(appointment.barber).select({ fullName: 1, phone: 1 }).lean(),
      resolveAssignedBarberPushTarget({
        ownerId: appointment.owner,
        barberId: appointment.barber,
      }),
    ]);

    if (!userDoc || userDoc.isActive === false) continue;

    const settings = getNotificationSettings(userDoc);
    const appointmentDate = new Date(appointment.startTime);
    const timeLabel = appointmentDate.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: SHOP_TIME_ZONE,
    });
    const dateLabel = appointmentDate.toLocaleDateString("es-AR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: SHOP_TIME_ZONE,
    });

    if (
      canSendBarberReminder({
        appointment,
        settings,
        pushToken: pushTarget?.token,
        now,
      })
    ) {
      try {
        await admin.messaging().send({
          token: pushTarget.token,
          notification: {
            title: "💈Recordatorio de turno",
            body: `${appointment.customerName} tiene ${appointment.service} con ${barberDoc?.fullName || "su barbero"} el ${dateLabel} a las ${timeLabel}.`,
          },
          android: {
            priority: "high",
          },
        });

        await AppointmentModel.updateOne(
          { _id: appointment._id, barberReminderSentAt: null },
          { $set: { barberReminderSentAt: now } },
        );
        barberPushSent += 1;
      } catch (err) {
        console.error("Error enviando recordatorio push:", err?.message || err);
      }
    }

    if (canSendCustomerReminder({ appointment, settings, now })) {
      try {
        await sendAppMail({
          to: appointment.customerEmail,
          subject: `Recordatorio de turno para hoy: ${appointment.service}`,
          html: buildCustomerReminderMailHtml({
            customerName: appointment.customerName,
            shopName: userDoc.fullName || "Tu Barbería",
            barberName: barberDoc?.fullName || "Barbero",
            barberPhone: barberDoc?.phone || "",
            service: appointment.service,
            appointmentDate,
          }),
        });

        await AppointmentModel.updateOne(
          { _id: appointment._id, customerReminderSentAt: null },
          { $set: { customerReminderSentAt: now } },
        );
        customerMailSent += 1;
      } catch (err) {
        console.error("Error enviando recordatorio mail:", err?.message || err);
      }
    }
  }

  return {
    ok: true,
    scanned: appointments.length,
    processed,
    barberPushSent,
    customerMailSent,
    ranAt: now.toISOString(),
  };
}
