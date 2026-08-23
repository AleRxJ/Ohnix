import React, { useEffect, useState } from "react";
import { Modal, Select, Button, Typography } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

// Reassigns an existing customer/supplier's home location - see
// Backend/controllers/customer.controller.js#reassignCustomerPointOfSale
// (and its supplier twin). Deliberately its own small modal instead of a
// field inside CustomerForm/SupplierForm: unlike creation, this is an
// occasional administrative correction, gated server-side to full-scope
// actors only, so it gets a separate, explicit action rather than living
// inside a form most editors can already open.
const MoveToPointOfSaleModal = ({ visible, record, pointsOfSale, loading, onSubmit, onCancel }) => {
    const { t } = useI18n();
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        if (visible) setSelected(null);
    }, [visible]);

    if (!record) return null;

    const currentId = record.point_of_sale?._id;
    const options = (pointsOfSale || []).filter((pos) => pos.id !== currentId);

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <ShopOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {t("pointOfSale.move_modal_title")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={420}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "20px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            <div className="mb-5 p-4 rounded-xl bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)]">
                <p className="text-sm font-semibold text-[var(--ohnix-text-primary)] m-0 truncate">{record.name}</p>
                <Text className="text-xs text-[var(--ohnix-text-dim)]">
                    {t("pointOfSale.move_current_label")}: {record.point_of_sale?.name || "—"}
                </Text>
            </div>

            <span className="font-medium text-[var(--ohnix-text-muted)] text-sm block mb-2">
                {t("pointOfSale.move_select_label")}
            </span>
            <Select
                size="large"
                className="w-full"
                placeholder={t("pointOfSale.move_select_placeholder")}
                value={selected}
                onChange={setSelected}
                options={options.map((pos) => ({ value: pos.id, label: pos.name }))}
            />

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 mt-5 border-t border-[var(--ohnix-line-4)]">
                <Button
                    onClick={onCancel}
                    disabled={loading}
                    className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                >
                    {t("common.cancel")}
                </Button>
                <Button
                    type="primary"
                    disabled={!selected}
                    loading={loading}
                    onClick={() => onSubmit(selected)}
                    className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                >
                    {t("pointOfSale.move_cta")}
                </Button>
            </div>
        </Modal>
    );
};

export default MoveToPointOfSaleModal;
