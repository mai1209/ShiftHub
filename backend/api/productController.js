import mongoose from "mongoose";
import { ProductModel } from "../models/Product.js";
import { CashEntryModel } from "../models/CashEntry.js";
import { applyShopScope } from "../utils/shopContext.js";

function serializeProduct(doc) {
  return {
    _id: String(doc._id),
    name: doc.name,
    price: Number(doc.price || 0),
    stock: Number(doc.stock || 0),
    photoUrl: doc.photoUrl || "",
    isActive: doc.isActive !== false,
  };
}

export async function listProducts(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const products = await ProductModel.find(
      applyShopScope({ owner: ownerId }, req),
    )
      .sort({ isActive: -1, name: 1 })
      .lean();
    return res.json({ products: products.map(serializeProduct) });
  } catch (err) {
    return next(err);
  }
}

export async function createProduct(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) {
      return res.status(400).json({ error: "El nombre es obligatorio." });
    }
    const price = Number(req.body?.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Precio inválido." });
    }
    const stock = Math.max(0, Math.floor(Number(req.body?.stock) || 0));

    const product = await ProductModel.create({
      owner: ownerId,
      shop: req.activeShopId || null,
      name,
      price: Number(price.toFixed(2)),
      stock,
      photoUrl: String(req.body?.photoUrl || "").trim(),
      isActive: req.body?.isActive !== false,
    });

    return res.status(201).json({ product: serializeProduct(product) });
  } catch (err) {
    return next(err);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const id = String(req.params?.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Producto inválido." });
    }

    const product = await ProductModel.findOne({
      _id: id,
      owner: ownerId,
      ...(req.activeShopId ? { shop: req.activeShopId } : {}),
    });
    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado." });
    }

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim().slice(0, 120);
      if (!name) return res.status(400).json({ error: "El nombre es obligatorio." });
      product.name = name;
    }
    if (req.body?.price !== undefined) {
      const price = Number(req.body.price);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: "Precio inválido." });
      }
      product.price = Number(price.toFixed(2));
    }
    if (req.body?.stock !== undefined) {
      product.stock = Math.max(0, Math.floor(Number(req.body.stock) || 0));
    }
    if (req.body?.photoUrl !== undefined) {
      product.photoUrl = String(req.body.photoUrl || "").trim();
    }
    if (req.body?.isActive !== undefined) {
      product.isActive = Boolean(req.body.isActive);
    }

    await product.save();
    return res.json({ product: serializeProduct(product) });
  } catch (err) {
    return next(err);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const id = String(req.params?.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Producto inválido." });
    }
    const deleted = await ProductModel.findOneAndDelete({
      _id: id,
      owner: ownerId,
      ...(req.activeShopId ? { shop: req.activeShopId } : {}),
    });
    if (!deleted) {
      return res.status(404).json({ error: "Producto no encontrado." });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// Registrar una venta: descuenta stock y crea un ingreso en la Caja (categoría Producto).
export async function registerSale(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: "Agregá al menos un producto." });
    }

    // Normalizamos y validamos.
    const normalized = [];
    for (const item of items) {
      const id = String(item?.productId || "");
      const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 0));
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Producto inválido en la venta." });
      }
      normalized.push({ id, quantity });
    }

    const ids = normalized.map((n) => n.id);
    const products = await ProductModel.find({
      _id: { $in: ids },
      owner: ownerId,
      ...(req.activeShopId ? { shop: req.activeShopId } : {}),
    });
    const byId = new Map(products.map((p) => [String(p._id), p]));

    let total = 0;
    const lines = [];
    for (const n of normalized) {
      const product = byId.get(n.id);
      if (!product) {
        return res.status(404).json({ error: "Un producto de la venta no existe." });
      }
      if (product.stock < n.quantity) {
        return res
          .status(400)
          .json({ error: `Sin stock suficiente de "${product.name}".` });
      }
      const lineTotal = Number((product.price * n.quantity).toFixed(2));
      total += lineTotal;
      lines.push({ product, quantity: n.quantity, lineTotal });
    }
    total = Number(total.toFixed(2));

    // Descontamos stock.
    for (const line of lines) {
      line.product.stock = Math.max(0, line.product.stock - line.quantity);
      await line.product.save();
    }

    // Registramos el ingreso en la Caja.
    const description = lines
      .map((l) => `${l.quantity}x ${l.product.name}`)
      .join(", ")
      .slice(0, 200);

    const entry = await CashEntryModel.create({
      owner: ownerId,
      shop: req.activeShopId || null,
      type: "income",
      amount: total,
      description: `Venta: ${description}`,
      category: "Producto",
      date: new Date(),
      createdBy: req.user.id || null,
    });

    return res.status(201).json({
      sale: {
        total,
        items: lines.map((l) => ({
          productId: String(l.product._id),
          name: l.product.name,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
        })),
      },
      cashEntryId: String(entry._id),
    });
  } catch (err) {
    return next(err);
  }
}
