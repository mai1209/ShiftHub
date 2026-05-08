import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

export async function hashPassword(plainPassword) {
  if (!plainPassword) throw new Error("El password está vacío");
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(plainPassword, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(plainPassword, hashedPassword) {
  if (!plainPassword || !hashedPassword) return false;
  const [salt, key] = hashedPassword.split(":");
  if (!salt || !key) return false;

  const derivedKey = await scrypt(plainPassword, salt, KEY_LENGTH);
  const keyBuffer = Buffer.from(key, "hex");

  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(keyBuffer, derivedKey);
}
