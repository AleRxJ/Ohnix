// Frontend/src/components/billing/BusinessInfoPrompt.jsx
//
// "¿Es tu cuenta de una empresa?" - asked once, right after a plan
// activates (see PaymentSuccess.jsx), not during signup. Signup never asks
// this at all today (registerUser only collects email/username/password/
// desiredPlan - see Backend/controllers/user.controller.js), and company
// creation was otherwise entirely admin-only until companySelf.controller.js
// added a self-service branding-only path. This reuses that same endpoint,
// extended to also accept taxIdentification/countryCode, so the admin
// admin subscriptions ledger (see AdminSubscriptions.jsx) can show which
// accounts are businesses without a human manually assigning every one.
//
// Deliberately optional and asked at most once per browser: "Omitir" (or
// closing the modal) sets a localStorage flag and this never appears again,
// regardless of how many times the person lands back on a payment-success
// page (renewals included) - nagging on every renewal would be worse than
// just never capturing the data for someone who plainly doesn't want to.
import React, { useContext, useEffect, useState } from "react";
import { Modal, Form, Input, Select, Button } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../../context/AuthContext";
import { companyService } from "../../services/companyService";

const PROMPTED_STORAGE_KEY = "ohnix:business_info_prompted";

const COUNTRY_OPTIONS = [
    { value: "CO", label: "Colombia" },
    { value: "ES", label: "España" },
    { value: "MX", label: "México" },
    { value: "OTHER", label: "Otro país" },
];

const BusinessInfoPrompt = () => {
    const { user, refreshUser } = useContext(AuthContext);
    const [form] = Form.useForm();
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!user || user.companyId) return;
        let prompted = false;
        try {
            prompted = window.localStorage.getItem(PROMPTED_STORAGE_KEY) === "true";
        } catch {
            // Best-effort - if localStorage is unavailable, default to
            // showing it once rather than silently never asking.
        }
        if (!prompted) {
            setOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.companyId]);

    const markPrompted = () => {
        try {
            window.localStorage.setItem(PROMPTED_STORAGE_KEY, "true");
        } catch {
            // Best-effort - worst case this asks again next session.
        }
    };

    const handleSkip = () => {
        markPrompted();
        setOpen(false);
    };

    const handleSubmit = async (values) => {
        try {
            setSubmitting(true);
            await companyService.updateMyCompany({
                name: values.name?.trim(),
                taxIdentification: values.taxIdentification?.trim() || undefined,
                countryCode: values.countryCode === "OTHER" ? undefined : values.countryCode,
            });
            toast.success("Datos de empresa guardados.");
            markPrompted();
            setOpen(false);
            await refreshUser?.();
        } catch (error) {
            toast.error(error.response?.data?.message || "No se pudo guardar. Intenta de nuevo.");
        } finally {
            setSubmitting(false);
        }
    };

    if (!user || user.companyId) return null;

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <ShopOutlined className="text-[#29D8D5]" />
                    <span>¿Tu cuenta es de una empresa?</span>
                </div>
            }
            open={open}
            onCancel={handleSkip}
            footer={null}
            destroyOnClose
        >
            <p className="mb-4 text-sm text-[var(--ohnix-text-muted)]">
                Si Ohnix lo vas a usar a nombre de un negocio, cuéntanos el nombre y el NIT ahora - te ahorra
                tener que hacerlo después cuando actives facturación electrónica. Es completamente opcional.
            </p>
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Form.Item
                    name="name"
                    label="Nombre de la empresa"
                    rules={[{ required: true, message: "Escribe el nombre de tu empresa." }]}
                >
                    <Input placeholder="Ej. Mi Negocio SAS" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item name="countryCode" label="País" initialValue="CO">
                    <Select options={COUNTRY_OPTIONS} />
                </Form.Item>
                <Form.Item name="taxIdentification" label="NIT / tax ID (opcional)">
                    <Input placeholder="Ej. 900123456" className="auth-ohnix-input" />
                </Form.Item>
                <div className="mt-2 flex justify-end gap-2">
                    <Button onClick={handleSkip}>Omitir por ahora</Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        loading={submitting}
                        className="!border-0 !bg-[#29D8D5] !text-[#041316] hover:!bg-[#44F3F0]"
                    >
                        Guardar
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

export default BusinessInfoPrompt;
