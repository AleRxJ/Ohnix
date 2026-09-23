import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const serialize = (method) => ({
    id: method.id,
    name: method.name,
    fee_percent: Number(method.feePercent),
    fee_fixed_amount: Number(method.feeFixedAmount),
    expense_account: method.expenseAccount ? {
        id: method.expenseAccount.id,
        code: method.expenseAccount.code,
        name: method.expenseAccount.name,
    } : null,
    is_active: method.isActive,
});

export const listPaymentMethods = async (accountId, { activeOnly = false } = {}) => {
    const methods = await prisma.paymentMethod.findMany({
        where: { accountId, ...(activeOnly ? { isActive: true } : {}) },
        include: { expenseAccount: { select: { id: true, code: true, name: true } } },
        orderBy: { name: "asc" },
    });
    return methods.map(serialize);
};

export const createPaymentMethod = async (accountId, payload) => {
    const name = String(payload.name || "").trim();
    const feePercent = payload.fee_percent === undefined || payload.fee_percent === null || payload.fee_percent === "" ? 0 : Number(payload.fee_percent);
    const feeFixedAmount = payload.fee_fixed_amount === undefined || payload.fee_fixed_amount === null || payload.fee_fixed_amount === "" ? 0 : Number(payload.fee_fixed_amount);

    if (!name) throw new ApiError(400, "El nombre del método de pago es obligatorio.", [], "", "payment_method_name_required");
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 15) {
        throw new ApiError(400, "La tarifa debe estar entre 0% y 15%.", [], "", "payment_method_fee_percent_invalid");
    }
    if (!Number.isFinite(feeFixedAmount) || feeFixedAmount < 0) {
        throw new ApiError(400, "El cargo fijo no puede ser negativo.", [], "", "payment_method_fee_fixed_invalid");
    }

    const expenseAccount = await prisma.chartAccount.findFirst({
        where: { id: payload.expense_account_id, createdById: accountId, accountType: "expense", isActive: true },
    });
    if (!expenseAccount) throw new ApiError(400, "La cuenta de gasto debe ser una cuenta activa del tipo gasto.", [], "", "payment_method_expense_account_invalid");

    const existing = await prisma.paymentMethod.findUnique({ where: { accountId_name: { accountId, name } } });
    if (existing) throw new ApiError(409, `Ya existe un método de pago llamado "${name}".`, [], "", "payment_method_name_duplicate");

    const created = await prisma.paymentMethod.create({
        data: { accountId, name, feePercent: round2(feePercent), feeFixedAmount: round2(feeFixedAmount), expenseAccountId: expenseAccount.id },
        include: { expenseAccount: { select: { id: true, code: true, name: true } } },
    });
    return serialize(created);
};

export const updatePaymentMethod = async (accountId, id, payload) => {
    const method = await prisma.paymentMethod.findFirst({ where: { id, accountId } });
    if (!method) throw new ApiError(404, "Payment method not found.", [], "", "payment_method_not_found");

    const data = {};
    if (payload.name !== undefined) {
        const name = String(payload.name || "").trim();
        if (!name) throw new ApiError(400, "El nombre del método de pago es obligatorio.", [], "", "payment_method_name_required");
        data.name = name;
    }
    if (payload.fee_percent !== undefined) {
        const feePercent = Number(payload.fee_percent);
        if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 15) {
            throw new ApiError(400, "La tarifa debe estar entre 0% y 15%.", [], "", "payment_method_fee_percent_invalid");
        }
        data.feePercent = round2(feePercent);
    }
    if (payload.fee_fixed_amount !== undefined) {
        const feeFixedAmount = Number(payload.fee_fixed_amount);
        if (!Number.isFinite(feeFixedAmount) || feeFixedAmount < 0) {
            throw new ApiError(400, "El cargo fijo no puede ser negativo.", [], "", "payment_method_fee_fixed_invalid");
        }
        data.feeFixedAmount = round2(feeFixedAmount);
    }
    if (payload.expense_account_id !== undefined) {
        const expenseAccount = await prisma.chartAccount.findFirst({
            where: { id: payload.expense_account_id, createdById: accountId, accountType: "expense", isActive: true },
        });
        if (!expenseAccount) throw new ApiError(400, "La cuenta de gasto debe ser una cuenta activa del tipo gasto.", [], "", "payment_method_expense_account_invalid");
        data.expenseAccountId = expenseAccount.id;
    }

    const updated = await prisma.paymentMethod.update({
        where: { id },
        data,
        include: { expenseAccount: { select: { id: true, code: true, name: true } } },
    });
    return serialize(updated);
};

export const setPaymentMethodActive = async (accountId, id, isActive) => {
    const method = await prisma.paymentMethod.findFirst({ where: { id, accountId } });
    if (!method) throw new ApiError(404, "Payment method not found.", [], "", "payment_method_not_found");

    const updated = await prisma.paymentMethod.update({
        where: { id },
        data: { isActive: isActive === true },
        include: { expenseAccount: { select: { id: true, code: true, name: true } } },
    });
    return serialize(updated);
};

// Read-only lookup for orderPayment.service.js/purchasePayment.service.js -
// must be active AND belong to the tenant, same guard as any other
// tenant-scoped config lookup in this codebase.
export const getActivePaymentMethod = async (accountId, paymentMethodId) => {
    if (!paymentMethodId) return null;
    const method = await prisma.paymentMethod.findFirst({ where: { id: paymentMethodId, accountId, isActive: true } });
    if (!method) throw new ApiError(404, "El método de pago seleccionado no existe o está inactivo.", [], "", "payment_method_not_found");
    return method;
};
