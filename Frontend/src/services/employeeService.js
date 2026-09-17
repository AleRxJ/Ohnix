import { api } from "../api/api";
import { idempotencyHeaders } from "../utils/idempotency";

// Mirrors Backend/routes/employee.routes.js one to one.
export const employeeService = {
    async list(status) {
        const params = new URLSearchParams();
        if (status) params.append("status", status);
        const response = await api.get(`/employees?${params.toString()}`);
        return response.data;
    },
    async create(fields) {
        const response = await api.post("/employees", fields, idempotencyHeaders());
        return response.data;
    },
    async update(id, fields) {
        const response = await api.patch(`/employees/${id}`, fields, idempotencyHeaders());
        return response.data;
    },
    async remove(id) {
        const response = await api.delete(`/employees/${id}`, idempotencyHeaders());
        return response.data;
    },
};
