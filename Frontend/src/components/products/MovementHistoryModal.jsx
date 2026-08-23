import React from "react";
import { Modal, Typography } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import MovementRow from "./MovementRow";

const { Text } = Typography;

// The compact preview in ProductDetailsDrawer is capped at a few visible
// rows (max-h-80) on purpose - this is where the rest of it lives. Reuses
// the exact same `movements` array already fetched for the preview (the
// backend caps at 200 rows - see product.controller.js#getProductStockMovements
// - so there's nothing more to fetch yet; a paginated endpoint is a later
// problem for whenever an account's history genuinely outgrows that).
const MovementHistoryModal = ({ visible, movements, productName, currentLanguage, onCancel }) => {
    const { t } = useI18n();

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <HistoryOutlined className="text-[#29D8D5]" />
                    </div>
                    <div className="min-w-0">
                        <span className="text-lg font-bold text-[var(--ohnix-text-primary)] block">
                            {t("products.movement_history")}
                        </span>
                        {productName && (
                            <span className="text-xs text-[var(--ohnix-text-dim)] block truncate">{productName}</span>
                        )}
                    </div>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={560}
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
                body: { padding: "20px 24px 24px", maxHeight: "75vh", overflowY: "auto" },
            }}
        >
            {movements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                    <HistoryOutlined className="text-2xl text-[var(--ohnix-text-dim)]" />
                    <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.no_movements")}</Text>
                </div>
            ) : (
                <div className="space-y-3">
                    {movements.map((m) => (
                        <MovementRow key={m._id} movement={m} currentLanguage={currentLanguage} />
                    ))}
                </div>
            )}
        </Modal>
    );
};

export default MovementHistoryModal;
