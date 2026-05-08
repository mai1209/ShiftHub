import { Router } from "express";
import { requireAuth, requireProSubscription } from "../middlewares/authMiddlewares.js";
import {
  createAppointment,
  listAppointments,
  runAppointmentReminders,
  updateAppointmentStatus,
  listServices,
  createService,
  updateService,
  deleteService,
  deleteAppointment,
  getAppointmentMetrics,
  getCurrentMonthOverview,
  getCustomerHistory,
  listCustomerContacts,
} from "../api/appointmentController.js";

const router = Router();

router.get("/reminders/run", runAppointmentReminders);
router.post("/reminders/run", runAppointmentReminders);

router.use(requireAuth);

router.get("/services", listServices);
router.post("/services", createService);
router.put("/services/:serviceId", updateService);
router.delete("/services/:serviceId", deleteService);
router.get("/metrics", requireProSubscription, getAppointmentMetrics);
router.get("/month-overview", requireProSubscription, getCurrentMonthOverview);
router.get("/history", requireProSubscription, getCustomerHistory);
router.get("/customers", requireProSubscription, listCustomerContacts);
router.get("/", listAppointments);
router.post("/", createAppointment);
router.delete('/:appointmentId',  deleteAppointment);

router.patch("/:appointmentId", updateAppointmentStatus);

export default router;
