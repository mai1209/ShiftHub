import { Router } from "express";
import {
  requireActiveSubscription,
  requireAdminRole,
  requireAuth,
} from "../middlewares/authMiddlewares.js";
import {
  createBarber,
  deactivateBarber,
  reactivateBarber,
  listBarbers,
  listBarberAppointments,
  updateBarber,
} from "../api/barberController.js";

const router = Router();

// Rutas privadas (la web pública usa /api/public/shops/:slug/*)
router.use(requireAuth);
router.use(requireActiveSubscription);
router.get("/", requireAdminRole, listBarbers);
router.get("/:barberId/appointments", listBarberAppointments);
router.post("/", requireAdminRole, createBarber);
router.put("/:barberId", updateBarber);
router.delete("/:barberId", requireAdminRole, deactivateBarber);
router.patch("/:barberId/reactivate", requireAdminRole, reactivateBarber);

export default router;
