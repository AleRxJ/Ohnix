// Registers every full-mirror entity (Etapa 1: Products, Categories, Units,
// Customers, Suppliers; Etapa 3: Purchases) with the sync engine's pull
// step, so their mirror stays fresh in the background on every reconnect -
// even for a module the user doesn't currently have open. None of these
// list endpoints paginate or support an `updatedSince` filter today
// (confirmed against the real controllers), so "pull" here is a full
// refetch + mirror replace, not a true incremental diff - correct and
// simple at the catalog sizes an SMB account has. This only needs
// revisiting if a `pull` here ever becomes slow enough to matter.
// Orders is deliberately NOT registered here - GET /orders paginates with
// no "everything" mode, so it uses a page-cache write-through instead (see
// useOrders.js and db.js's comment on it).
//
// Importing this module is what registers the handlers (side effect) - see
// DashboardLayout.jsx, imported once alongside starting the sync engine.
import { api } from "../api/api.js";
import { registerEntitySync } from "./syncEngine.js";
import { mirrorReplaceAll } from "./entityQueue.js";

function registerFullResync(entity, url) {
    registerEntitySync(entity, {
        pull: async () => {
            const response = await api.get(url);
            const records = response?.data?.data;
            if (Array.isArray(records)) {
                await mirrorReplaceAll(entity, records);
            }
            return new Date().toISOString();
        },
    });
}

registerFullResync("products", "/products");
registerFullResync("categories", "/categories/user");
registerFullResync("units", "/units");
registerFullResync("customers", "/customers");
registerFullResync("suppliers", "/suppliers");
registerFullResync("purchases", "/purchases");
registerFullResync("cashAccounts", "/finance/cash-accounts");
registerFullResync("pointsOfSale", "/points-of-sale");
registerFullResync("stockTransfers", "/stock-transfers");
registerFullResync("purchaseQuotations", "/purchase-quotations");
registerFullResync("salesQuotations", "/sales-quotations");
registerFullResync("productionOrders", "/production-orders");
registerFullResync("employees", "/employees");
registerFullResync("payrollPeriods", "/payroll/periods");
