import { Router } from "express";
import { createEmployee, getEmployees, getEmployee, updateEmployee, deleteEmployee, getLinkableUsers } from "../controllers/employee.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission, requireCapability } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT);

router
    .route("/")
    .post(requireModulePermission("payroll", "edit"), idempotent("employee.create"), createEmployee)
    .get(requireModulePermission("payroll", "view"), getEmployees);

// Declared before "/:id" so it isn't read as an employee id.
router.get("/linkable-users", requireModulePermission("payroll", "edit"), getLinkableUsers);

router
    .route("/:id")
    .get(requireModulePermission("payroll", "view"), getEmployee)
    .patch(requireModulePermission("payroll", "edit"), idempotent("employee.update"), updateEmployee)
    .delete(requireModulePermission("payroll", "edit"), requireCapability("deleteRecords", "Tu rol no tiene permiso para eliminar registros."), idempotent("employee.delete"), deleteEmployee);

export default router;
