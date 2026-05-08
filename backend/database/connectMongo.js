import mongoose from "mongoose";

const DEFAULT_TIMEOUT = 15000;

let mongoReadyPromise;

export async function connectMongo() {
  if (
    mongoReadyPromise &&
    (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2)
  ) {
    return mongoReadyPromise;
  }

  const uri = String(process.env.MONGODB_URI ?? "").trim();
  const dbName = String(process.env.MONGODB_DB_NAME ?? "").trim();
  const timeout = Number(process.env.MONGODB_TIMEOUT_MS ?? DEFAULT_TIMEOUT);

  if (!uri) {
    throw new Error("Falta configurar MONGODB_URI en el backend.");
  }

  if (!dbName) {
    throw new Error("Falta configurar MONGODB_DB_NAME en el backend.");
  }

  mongoose.set("strictQuery", true);

  try {
    mongoReadyPromise = mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: timeout,
    });

    await mongoReadyPromise;
    console.log(`[MongoDB] ✅ Conectado exitosamente a la DB: ${dbName}`);
    return mongoReadyPromise;
  } catch (err) {
    console.error("[MongoDB] ❌ Error de conexión:", err.message);
    mongoReadyPromise = null;
    throw err;
  }
}
