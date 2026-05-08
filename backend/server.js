import "dotenv/config";
import express from "express";
import helmet from 'helmet';
import cors from "cors";
import { connectMongo } from "./database/connectMongo.js";
import authRoutes from "./routes/authRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import barberRoutes from "./routes/barberRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";

const app = express();

// Activamos todas las protecciones escudo de seguridad
app.use(helmet());

function getEnvAllowedOrigins() {
  const entries = String(process.env.ALLOWED_WEB_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const exactOrigins = [];
  const allowedHosts = [];

  for (const entry of entries) {
    try {
      const parsed = new URL(entry);
      exactOrigins.push(parsed.origin);
    } catch (_error) {
      allowedHosts.push(entry.replace(/^https?:\/\//i, "").replace(/\/+$/, ""));
    }
  }

  return { exactOrigins, allowedHosts };
}

function isPrivateDevOrigin(origin) {
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }

    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }

    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }
  } catch (_error) {
    return false;
  }

  return false;
}

function isAllowedWebOrigin(origin) {
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    const { hostname, protocol } = parsed;
    const normalizedOrigin = parsed.origin;
    const { exactOrigins, allowedHosts } = getEnvAllowedOrigins();

    if (exactOrigins.includes(normalizedOrigin)) {
      return true;
    }

    if (allowedHosts.includes(hostname)) {
      return true;
    }

    if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return true;
    }

    if (protocol === "https:" && (hostname === "barberappbycodex.com" || hostname === "www.barberappbycodex.com")) {
      return true;
    }

    if (protocol === "https:" && hostname.endsWith(".vercel.app")) {
      return true;
    }

    if (isPrivateDevOrigin(origin)) {
      return true;
    }
  } catch (_error) {
    return false;
  }

  return false;
}

// --- CONFIGURACIÓN DE CORS ---
// Esto permite que tu Frontend en Vercel pueda hablar con este Backend
app.use(cors({
  origin: function (origin, callback) {
    // Si el origin está permitido O si no hay origin (App móvil), permitimos.
    // Si no está permitido, no agregamos cabeceras CORS pero evitamos romper el backend con 500.
    if (isAllowedWebOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-secret"],
  credentials: true,
  optionsSuccessStatus: 204,
}));

app.use(express.json({ limit: "8mb" }));

// 1. Middleware de Conexión
app.use(async (req, res, next) => {
  try {
    await connectMongo();
    next();
  } catch (err) {
    res.status(500).json({ error: "Error de conexión a la base de datos" });
  }
});

// 2. Ruta de Bienvenida
app.get('/', (req, res) => {
  res.status(200).json({
    message: "🚀 BarberApp Backend Online - Powered by CODEX®",
    status: "Ready",
    database: "Connected"
  });
});

// 3. Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/payments', paymentRoutes);

// 4. Manejadores de errores
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

// En Oracle/VM necesitamos abrir un puerto HTTP real.
// En Vercel solo exportamos `app` para que lo maneje la plataforma.
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT ?? 3002);
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
  });
}
