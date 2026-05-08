export function normalizeAppRole(rawRole) {
  return String(rawRole ?? "").trim().toLowerCase() === "barber"
    ? "barber"
    : "admin";
}

export function resolveEffectiveOwnerId(user) {
  const ownerId = user?.shopOwnerId || user?.ownerId || user?._id || user?.id || null;
  return ownerId ? String(ownerId) : null;
}

export function serializeAuthUser(userDoc) {
  const baseUser =
    typeof userDoc?.toJSON === "function" ? userDoc.toJSON() : { ...userDoc };

  return {
    ...baseUser,
    role: normalizeAppRole(baseUser?.role),
    barberId: baseUser?.barberId ? String(baseUser.barberId) : null,
    shopOwnerId: baseUser?.shopOwnerId ? String(baseUser.shopOwnerId) : null,
  };
}
