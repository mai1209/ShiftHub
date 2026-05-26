import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PUBLIC_MEDIA_ROUTE = "/api/public/media";
export const PUBLIC_MEDIA_ROOT = path.resolve(__dirname, "../uploads");

const IMAGE_DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/;
const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isPublicMediaUrl(value) {
  return String(value || "").startsWith(`${PUBLIC_MEDIA_ROUTE}/`);
}

export function isImageDataUrl(value) {
  return IMAGE_DATA_URL_RE.test(String(value || ""));
}

export async function saveThemeImageDataUrl({ ownerId, fieldName, dataUrl }) {
  const match = String(dataUrl || "").match(IMAGE_DATA_URL_RE);
  if (!match) {
    throw new Error("La imagen debe ser data:image/...;base64.");
  }

  const mimeType = match[1].toLowerCase();
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) {
    throw new Error("El formato de imagen no está permitido.");
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) {
    throw new Error("La imagen está vacía.");
  }

  const safeOwnerId = String(ownerId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeFieldName = String(fieldName || "image").replace(/[^a-zA-Z0-9_-]/g, "");
  const directory = path.join(PUBLIC_MEDIA_ROOT, "theme", safeOwnerId);
  await fs.mkdir(directory, { recursive: true });

  const fileName = `${safeFieldName}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
  await fs.writeFile(path.join(directory, fileName), buffer);

  return `${PUBLIC_MEDIA_ROUTE}/theme/${safeOwnerId}/${fileName}`;
}

export async function persistThemeMediaUpdates({ ownerId, updates }) {
  const nextUpdates = { ...updates };
  const fields = ["logoDataUrl", "bannerDataUrl", "mobileBannerDataUrl"];

  for (const fieldName of fields) {
    if (!Object.prototype.hasOwnProperty.call(nextUpdates, fieldName)) continue;
    const value = nextUpdates[fieldName];
    if (!value || isPublicMediaUrl(value) || /^https?:\/\//i.test(String(value))) continue;
    if (!isImageDataUrl(value)) {
      throw new Error("La imagen debe ser una URL pública o una imagen válida en base64.");
    }
    nextUpdates[fieldName] = await saveThemeImageDataUrl({
      ownerId,
      fieldName,
      dataUrl: value,
    });
  }

  return nextUpdates;
}
