import jwt from "jsonwebtoken";

// Duración por defecto del token (antes 1h). Podés sobreescribir con JWT_EXPIRES_IN.
// Formatos válidos: "365d", "12h", "3600" (segundos).
const DEFAULT_EXP = "365d";



//se crea clave secreta para firmar el token
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta JWT_SECRET en variables de entorno");
  return secret;
}


//genera un token FIRMADO (LA FIRMA ES LA CLAVE SECRETA DE LA FUNCION DE ARRIBA), se usa cuando el login fue exitoso y expira en el tiempo q yo elija.
export function signAccessToken(payload, options = {}) {
  const secret = getSecret();

  // options.expiresIn puede ser "1h" o número en segundos
  const expiresIn =
    options.expiresIn ??
    process.env.JWT_EXPIRES_IN ?? // ej: "1h"
    DEFAULT_EXP;

  return jwt.sign(payload, secret, { expiresIn });
}


//verifica que este firmado por mi clave, que no este vencido ni alterado.
export function verifyAccessToken(token) {
  try {
    const secret = getSecret();
    return jwt.verify(token, secret); // devuelve payload si OK
  } catch {
    return null; // inválido o expirado
  }
}
