import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let serviceAccount;

// 1. Intentamos primero con la Variable de Entorno (Producción)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("✅ Usando Firebase desde Variable de Entorno");
  } catch (error) {
    console.error("❌ Error parseando JSON de FIREBASE_SERVICE_ACCOUNT:", error);
  }
} 

// 2. Si no funcionó lo anterior, probamos el archivo local (Desarrollo)
if (!serviceAccount) {
  try {
    serviceAccount = require("./firebase-key.json");
    console.log("🏠 Usando Firebase desde archivo local");
  } catch (error) {
    console.error("⚠️ No se encontró firebase-key.json y tampoco hay Variable de Entorno.");
  }
}

// 3. Inicializamos si logramos conseguir la credencial
if (serviceAccount && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;