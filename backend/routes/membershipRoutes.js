import { Router } from "express";
import {
  requireAuth,
  requireProSubscription,
} from "../middlewares/authMiddlewares.js";
import {
  listMembershipPlans,
  upsertMembershipPlan,
  deleteMembershipPlan,
  createMember,
  listMembers,
} from "../api/membershipController.js";

const router = Router();

router.use(requireAuth);

router.get("/plans", requireProSubscription, listMembershipPlans);
router.post("/plans", requireProSubscription, upsertMembershipPlan);
router.delete("/plans/:id", requireProSubscription, deleteMembershipPlan);

router.get("/members", requireProSubscription, listMembers);
router.post("/members", requireProSubscription, createMember);

export default router;
