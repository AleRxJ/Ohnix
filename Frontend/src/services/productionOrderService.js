import { api } from "../api/api";
import { idempotencyHeaders } from "../utils/idempotency";

// Mirrors Backend/routes/productionOrder.routes.js one to one. See
// Backend/services/productionOrder.service.js#mapOrder for the response
// shape.
export const productionOrderService = {
    async list({ status, productId, pointOfSaleId } = {}) {
        const params = new URLSearchParams();
        if (status) params.append("status", status);
        if (productId) params.append("product_id", productId);
        if (pointOfSaleId) params.append("point_of_sale_id", pointOfSaleId);
        const response = await api.get(`/production-orders?${params.toString()}`);
        return response.data;
    },

    async get(id) {
        const response = await api.get(`/production-orders/${id}`);
        return response.data;
    },

    async create({ productId, quantity, laborCost, overheadCost, batchNumber, batchExpirationDate, notes, pointOfSaleId }) {
        const response = await api.post(
            "/production-orders",
            {
                product_id: productId,
                quantity,
                labor_cost: laborCost,
                overhead_cost: overheadCost,
                batch_number: batchNumber,
                batch_expiration_date: batchExpirationDate,
                notes,
                ...(pointOfSaleId ? { pointOfSaleId } : {}),
            },
            idempotencyHeaders()
        );
        return response.data;
    },

    async complete(id) {
        const response = await api.patch(`/production-orders/${id}/complete`);
        return response.data;
    },

    async cancel(id, reason) {
        const response = await api.patch(`/production-orders/${id}/cancel`, { reason });
        return response.data;
    },
};
