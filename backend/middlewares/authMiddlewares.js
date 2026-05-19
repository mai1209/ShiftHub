import { verifyAccessToken } from "../token/jwtManager.js";
import { UserModel } from "../models/User.js";
import { normalizeAppRole, resolveEffectiveOwnerId } from "../utils/userRoles.js";
import {
  buildFreeSubscriptionPatch,
  hasPaidOperationalAccess,
  hasProAccess,
  shouldNormalizeLegacyTrialToFree,
} from "../utils/subscriptionAccess.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Falta token de autenticación" });
    }

    const payload = verifyAccessToken(token);
    if (!payload?.sub) {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    const user = await UserModel.findById(payload.sub).lean();
    if (!user || user.isActive === false) {
      return res.status(401).json({ error: "Usuario no autorizado" });
    }

    if (shouldNormalizeLegacyTrialToFree(user.subscription)) {
      user.subscription = buildFreeSubscriptionPatch(user.subscription);
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { subscription: user.subscription } },
      );
    }

    let subscription = {
      ...(user.subscription ?? {}),
      plan: user.subscription?.plan || "free",
      status: user.subscription?.status || "active",
    };

    if (normalizeAppRole(user.role) === "barber" && user.shopOwnerId) {
      const ownerUser = await UserModel.findById(user.shopOwnerId)
        .select({ subscription: 1, isActive: 1 })
        .lean();

      if (ownerUser && ownerUser.isActive !== false) {
        if (shouldNormalizeLegacyTrialToFree(ownerUser.subscription)) {
          ownerUser.subscription = buildFreeSubscriptionPatch(ownerUser.subscription);
          await UserModel.updateOne(
            { _id: ownerUser._id },
            { $set: { subscription: ownerUser.subscription } },
          );
        }

        subscription = {
          ...(ownerUser.subscription ?? {}),
          plan: ownerUser.subscription?.plan || subscription.plan,
          status: ownerUser.subscription?.status || subscription.status,
        };
      }
    }

    req.user = {
      id: user._id.toString(),
      ownerId: resolveEffectiveOwnerId(user),
      email: user.email,
      role: normalizeAppRole(user.role),
      fullName: user.fullName,
      barberId: user.barberId ? user.barberId.toString() : null,
      shopOwnerId: user.shopOwnerId ? user.shopOwnerId.toString() : null,
      subscription,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAdminRole(req, res, next) {
  if (normalizeAppRole(req.user?.role) !== "admin") {
    return res.status(403).json({ error: "Solo el administrador puede usar esta función." });
  }

  return next();
}

export function requireActiveSubscription(req, res, next) {
  const status = String(req.user?.subscription?.status || "active").trim();

  if (status !== "active") {
    return res.status(402).json({
      error: "Esta cuenta no tiene una suscripción activa.",
      code: "SUBSCRIPTION_REQUIRED",
      subscriptionStatus: status || "active",
    });
  }

  return next();
}

export function requireProSubscription(req, res, next) {
  if (!hasProAccess(req.user?.subscription)) {
    return res.status(403).json({
      error: "Esta función está disponible solo para cuentas con plan Pro activo.",
      code: "PLAN_UPGRADE_REQUIRED",
    });
  }

  return next();
}

export function requirePaidOperationalSubscription(req, res, next) {
  if (!hasPaidOperationalAccess(req.user?.subscription)) {
    return res.status(403).json({
      error: "Esta función requiere actualizar tu plan.",
      code: "PLAN_UPGRADE_REQUIRED",
      requiredPlan: "basic",
    });
  }

  return next();
}
