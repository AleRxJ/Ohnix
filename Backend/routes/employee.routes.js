import { Router } from "express";
import { createEmployee, getEmployees, getEmployee, updateEmployee, deleteEmployee } from "../controllers/employee.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT);

router
    .route("/")
    .post(requireModulePermission("payroll", "edit"), idempotent("employee.create"), createEmployee)
    .get(requireModulePermission("payroll", "view"), getEmployees);

router
    .route("/:id")
    .get(requireModulePermission("payroll", "view"), getEmployee)
    .patch(requireModulePermission("payroll", "edit"), idempotent("employee.update"), updateEmployee)
    .delete(requireModulePermission("payroll", "edit"), idempotent("employee.delete"), deleteEmployee);

export default router;
