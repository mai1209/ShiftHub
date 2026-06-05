import { Router } from "express";
import {
  requireAuth,
  requireProSubscription,
} from "../middlewares/authMiddlewares.js";
import {
  createCashEntry,
  listCashEntries,
  updateCashEntry,
  deleteCashEntry,
  getCashSummary,
} from "../api/appointmentController.js";

const router = Router();

router.use(requireAuth);

router.get("/summary", requireProSubscription, getCashSummary);
router.get("/entries", requireProSubscription, listCashEntries);
router.post("/entries", requireProSubscription, createCashEntry);
router.patch("/entries/:id", requireProSubscription, updateCashEntry);
router.delete("/entries/:id", requireProSubscription, deleteCashEntry);

export default router;
