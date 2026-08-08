import { api } from "../api/api";

// Self-service counterpart to adminService.js's company calls - those hit
// /companies/admin/:id (Ohnix platform-admin only), this hits /company/me
// (the logged-in owner's own account, see Backend/routes/companySelf.routes.js).
export const companyService = {
    async getMyCompany() {
        const response = await api.get("/company/me");
        return response.data;
    },

    async updateMyCompany(payload) {
        const response = await api.patch("/company/me", payload);
        return response.data;
    },

    async updateMyCompanyLogo(file) {
        const formData = new FormData();
        formData.append("logo", file);
        const response = await api.patch("/company/me/logo", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
        return response.data;
    },
};
