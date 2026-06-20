import { MembershipPlanModel } from "../models/MembershipPlan.js";
import { MembershipModel } from "../models/Membership.js";
import { CashEntryModel } from "../models/CashEntry.js";

const MAX_ACTIVE_PLANS = 4;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

function serializePlan(doc) {
  if (!doc) return null;
  return {
    _id: String(doc._id),
    name: doc.name,
    color: doc.color || "#2FAA1F",
    freeTurns: Number(doc.freeTurns || 0),
    durationDays: Number(doc.durationDays || 0),
    giftText: doc.giftText || "",
    priceArs: Number(doc.priceArs || 0),
    isActive: doc.isActive !== false,
  };
}

function serializeMember(doc) {
  if (!doc) return null;
  const total = Number(doc.turnsTotal || 0);
  const used = Number(doc.turnsUsed || 0);
  return {
    _id: String(doc._id),
    plan: doc.plan ? String(doc.plan) : null,
    planName: doc.planName || "",
    customerName: doc.customerName || "",
    customerEmail: doc.customerEmail || "",
    turnsTotal: total,
    turnsUsed: used,
    turnsRemaining: Math.max(0, total - used),
    startedAt: doc.startedAt,
    expiresAt: doc.expiresAt || null,
    pricePaidArs: Number(doc.pricePaidArs || 0),
    status: doc.status || "active",
  };
}

// ===== Helpers reutilizables (también desde los controllers de turnos) =====

// Membresía usable: activa, con saldo y no vencida.
export async function findUsableMembership({ ownerId, shopId, email }) {
  const cleanEmail = normalizeEmail(email);
  if (!ownerId || !cleanEmail) return null;
  const filter = {
    owner: ownerId,
    customerEmail: cleanEmail,
    status: "active",
    $expr: { $lt: ["$turnsUsed", "$turnsTotal"] },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  };
  // La membresía vale en TODO el negocio del dueño: la buscamos por dueño + email
  // sin atarla a una sucursal puntual (evita que no matchee por desajuste de shop).
  void shopId;
  // La más próxima a vencer primero (las sin vencimiento al final).
  return MembershipModel.findOne(filter).sort({ expiresAt: 1, createdAt: 1 });
}

// Descuenta 1 turno; si llega a 0 → depleted. Recibe el doc de Membership.
export async function consumeMembershipTurn(membership) {
  if (!membership) return null;
  membership.turnsUsed = Number(membership.turnsUsed || 0) + 1;
  if (membership.turnsUsed >= Number(membership.turnsTotal || 0)) {
    membership.status = "depleted";
  }
  await membership.save();
  return membership;
}

// Devuelve 1 turno (cuando se cancela/elimina el turno) y reactiva si corresponde.
export async function refundMembershipTurn(membershipId) {
  if (!membershipId) return null;
  const membership = await MembershipModel.findById(membershipId);
  if (!membership) return null;
  membership.turnsUsed = Math.max(0, Number(membership.turnsUsed || 0) - 1);
  const notExpired =
    !membership.expiresAt || new Date(membership.expiresAt) > new Date();
  if (
    membership.status === "depleted" &&
    membership.turnsUsed < Number(membership.turnsTotal || 0) &&
    notExpired
  ) {
    membership.status = "active";
  }
  await membership.save();
  return membership;
}

// ===== Endpoints planes =====

export async function listMembershipPlans(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const filter = { owner: ownerId, isActive: true };
    if (req.activeShopId) filter.shop = req.activeShopId;
    const plans = await MembershipPlanModel.find(filter)
      .sort({ createdAt: 1 })
      .lean();
    return res.json({ plans: plans.map(serializePlan) });
  } catch (err) {
    return next(err);
  }
}

export async function upsertMembershipPlan(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const shopId = req.activeShopId || null;
    const planId = req.body?._id || req.params?.id || null;

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "El nombre es obligatorio." });
    const freeTurns = Math.max(1, Math.floor(Number(req.body?.freeTurns) || 0));
    if (!freeTurns) {
      return res.status(400).json({ error: "Definí cuántos turnos gratis da." });
    }
    const payload = {
      name: name.slice(0, 60),
      color: String(req.body?.color || "#2FAA1F").trim().slice(0, 20),
      freeTurns,
      durationDays: Math.max(0, Math.floor(Number(req.body?.durationDays) || 0)),
      giftText: String(req.body?.giftText || "").trim().slice(0, 120),
      priceArs: Math.max(0, Number(req.body?.priceArs) || 0),
    };

    if (planId) {
      const plan = await MembershipPlanModel.findOneAndUpdate(
        { _id: planId, owner: ownerId },
        { $set: payload },
        { new: true },
      );
      if (!plan) return res.status(404).json({ error: "No encontramos la membresía." });
      return res.json({ plan: serializePlan(plan) });
    }

    // Crear: máximo 4 activas por local.
    const countFilter = { owner: ownerId, isActive: true };
    if (shopId) countFilter.shop = shopId;
    const activeCount = await MembershipPlanModel.countDocuments(countFilter);
    if (activeCount >= MAX_ACTIVE_PLANS) {
      return res.status(400).json({
        error: `Solo podés tener ${MAX_ACTIVE_PLANS} membresías activas.`,
      });
    }

    const plan = await MembershipPlanModel.create({
      ...payload,
      owner: ownerId,
      shop: shopId,
      isActive: true,
    });
    return res.status(201).json({ plan: serializePlan(plan) });
  } catch (err) {
    return next(err);
  }
}

export async function deleteMembershipPlan(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const plan = await MembershipPlanModel.findOneAndUpdate(
      { _id: req.params.id, owner: ownerId },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!plan) return res.status(404).json({ error: "No encontramos la membresía." });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// ===== Endpoints miembros =====

export async function createMember(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const shopId = req.activeShopId || null;

    const customerName = String(req.body?.customerName || "").trim();
    if (!customerName) {
      return res.status(400).json({ error: "El nombre del cliente es obligatorio." });
    }
    const customerEmail = normalizeEmail(req.body?.customerEmail);

    const plan = await MembershipPlanModel.findOne({
      _id: req.body?.planId,
      owner: ownerId,
      isActive: true,
    });
    if (!plan) return res.status(404).json({ error: "Elegí una membresía válida." });

    const turnsTotal = Number(plan.freeTurns || 0);
    const expiresAt =
      Number(plan.durationDays || 0) > 0
        ? new Date(Date.now() + Number(plan.durationDays) * 24 * 60 * 60 * 1000)
        : null;

    const membership = await MembershipModel.create({
      owner: ownerId,
      shop: shopId,
      plan: plan._id,
      planName: plan.name,
      customerName: customerName.slice(0, 120),
      customerEmail,
      turnsTotal,
      turnsUsed: 0,
      startedAt: new Date(),
      expiresAt,
      pricePaidArs: Number(plan.priceArs || 0),
      status: "active",
      createdBy: req.user.id,
    });

    // El valor de la membresía entra a la caja como ingreso.
    if (Number(plan.priceArs || 0) > 0) {
      await CashEntryModel.create({
        owner: ownerId,
        shop: shopId,
        type: "income",
        amount: Number(Number(plan.priceArs).toFixed(2)),
        description: `Membresía ${plan.name} · ${customerName}`,
        category: "Membresía",
        date: new Date(),
        createdBy: req.user.id,
      });
    }

    return res.status(201).json({ member: serializeMember(membership) });
  } catch (err) {
    return next(err);
  }
}

export async function listMembers(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const filter = { owner: ownerId };
    if (req.activeShopId) filter.shop = req.activeShopId;
    const members = await MembershipModel.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ members: members.map(serializeMember) });
  } catch (err) {
    return next(err);
  }
}
