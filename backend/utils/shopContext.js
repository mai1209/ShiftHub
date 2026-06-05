import mongoose from "mongoose";
import { ShopModel } from "../models/Shop.js";
import { UserModel } from "../models/User.js";
import { BarberModel } from "../models/Barber.js";
import { AppointmentModel } from "../models/Appointment.js";
import { ServiceModel } from "../models/Services.js";

export function slugifyShop(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeShopSlugCandidate(value) {
  const slug = slugifyShop(value);
  return slug.length >= 3 ? slug : "";
}

export async function buildAvailableShopSlug(baseValue) {
  const base = normalizeShopSlugCandidate(baseValue) || "negocio";
  let candidate = base;
  let suffix = 1;

  while (
    (await ShopModel.exists({ slug: candidate })) ||
    (await UserModel.exists({ shopSlug: candidate }))
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

// Asegura un local "por defecto" para el dueño y completa (backfill) el campo
// `shop` en los datos que aún no lo tengan. Idempotente.
export async function ensureDefaultShopForOwner(ownerDoc) {
  if (!ownerDoc?._id) return null;

  const ownerId = ownerDoc._id;
  let shop = await ShopModel.findOne({
    owner: ownerId,
    isDefault: true,
    isActive: true,
  });

  if (!shop) {
    const ownerSlug = normalizeShopSlugCandidate(ownerDoc.shopSlug);
    const slug =
      ownerSlug && !(await ShopModel.exists({ slug: ownerSlug }))
        ? ownerSlug
        : await buildAvailableShopSlug(ownerDoc.fullName || "negocio");
    shop = await ShopModel.create({
      owner: ownerId,
      name: ownerDoc.fullName || "Mi negocio",
      slug,
      address: ownerDoc.publicProfile?.address || "",
      phone: ownerDoc.publicProfile?.phone || "",
      isDefault: true,
      isActive: true,
    });
  }

  await Promise.all([
    BarberModel.updateMany(
      { owner: ownerId, $or: [{ shop: null }, { shop: { $exists: false } }] },
      { $set: { shop: shop._id } },
    ),
    ServiceModel.updateMany(
      { owner: ownerId, $or: [{ shop: null }, { shop: { $exists: false } }] },
      { $set: { shop: shop._id } },
    ),
    AppointmentModel.updateMany(
      { owner: ownerId, $or: [{ shop: null }, { shop: { $exists: false } }] },
      { $set: { shop: shop._id } },
    ),
  ]);

  return shop;
}

// Crea locales adicionales con nombres dados. Idempotente: no duplica si ya
// existen (cuenta los locales extra activos del owner antes de crear).
export async function createNamedShopsForOwner(ownerDoc, names) {
  if (!Array.isArray(names) || names.length === 0) return;
  await ensureDefaultShopForOwner(ownerDoc);
  const existingExtra = await ShopModel.countDocuments({
    owner: ownerDoc._id,
    isActive: true,
    isDefault: false,
  });
  const pending = names.slice(Math.max(0, existingExtra));
  for (const rawName of pending) {
    const name = String(rawName || "").trim();
    if (!name) continue;
    const slug = await buildAvailableShopSlug(name);
    await ShopModel.create({
      owner: ownerDoc._id,
      name,
      slug,
      isDefault: false,
      isActive: true,
    });
  }
}

export function serializeShop(shop) {
  if (!shop) return null;
  return {
    _id: String(shop._id),
    name: shop.name || "",
    slug: shop.slug || "",
    description: shop.description || "",
    address: shop.address || "",
    phone: shop.phone || "",
    isDefault: Boolean(shop.isDefault),
    isActive: shop.isActive !== false,
  };
}

export function getRequestedShopId(req) {
  const value =
    req.headers?.["x-shop-id"] ||
    req.headers?.["x-active-shop-id"] ||
    req.query?.shopId ||
    req.body?.shopId ||
    "";
  const text = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(text) ? text : null;
}

export function applyShopScope(filter, req) {
  if (!req?.activeShopId) return filter;
  return {
    ...filter,
    shop: req.activeShopId,
  };
}
