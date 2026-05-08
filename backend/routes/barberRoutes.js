import { Router } from "express";
import { requireAdminRole, requireAuth } from "../middlewares/authMiddlewares.js";
import {
  createBarber,
  deactivateBarber,
  listBarbers,
  listBarberAppointments,
  updateBarber,
} from "../api/barberController.js";

const router = Router();

// Rutas privadas (la web pública usa /api/public/shops/:slug/*)
router.use(requireAuth);
router.get("/", requireAdminRole, listBarbers);
router.get("/:barberId/appointments", listBarberAppointments);
router.post("/", requireAdminRole, createBarber);
router.put("/:barberId", updateBarber);
router.delete("/:barberId", requireAdminRole, deactivateBarber);

export default router;
