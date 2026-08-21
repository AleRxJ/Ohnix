import { api } from "../api/api";
import { idempotencyHeaders } from "../utils/idempotency";

// Mirrors Backend/routes/stockTransfer.routes.js one to one. "Traslado
// rápido" (quick) lives here too, alongside the request/approve/ship/
// receive/cancel workflow - both produce the same StockTransfer shape, see
// Backend/controllers/stockTransfer.controller.js#mapStockTransfer.
export const stockTransferService = {
    async list({ status, productId } = {}) {
        const params = new URLSearchParams();
        if (status) params.append("status", status);
        if (productId) params.append("product_id", productId);
        const response = await api.get(`/stock-transfers?${params.toString()}`);
        return response.data;
    },

    async get(id) {
        const response = await api.get(`/stock-transfers/${id}`);
        return response.data;
    },

    async request({ productId, fromPointOfSaleId, toPointOfSaleId, quantity, notes }) {
        const response = await api.post(
            "/stock-transfers",
            {
                product_id: productId,
                from_point_of_sale_id: fromPointOfSaleId,
                to_point_of_sale_id: toPointOfSaleId,
                quantity,
                notes,
            },
            idempotencyHeaders()
        );
        return response.data;
    },

    async approve(id) {
        const response = await api.patch(`/stock-transfers/${id}/approve`);
        return response.data;
    },

    async ship(id) {
        const response = await api.patch(`/stock-transfers/${id}/ship`);
        return response.data;
    },

    async receive(id, { quantityReceived, notes }) {
        const response = await api.patch(`/stock-transfers/${id}/receive`, {
            quantity_received: quantityReceived,
            notes,
        });
        return response.data;
    },

    async cancel(id, reason) {
        const response = await api.patch(`/stock-transfers/${id}/cancel`, { reason });
        return response.data;
    },
};
