import { UserModel } from "../models/User.js";

export async function resolveAssignedBarberPushTarget({
  ownerId,
  barberId,
} = {}) {
  if (!ownerId || !barberId) return null;

  const barberUser = await UserModel.findOne({
    shopOwnerId: ownerId,
    barberId,
    role: "barber",
    isActive: true,
  })
    .select({ pushToken: 1, fcmToken: 1, fullName: 1, email: 1 })
    .lean();

  const token = String(barberUser?.pushToken || barberUser?.fcmToken || "").trim();
  if (!token) return null;

  return {
    token,
    barberUser,
  };
}
