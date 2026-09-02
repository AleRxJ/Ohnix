import React from "react";
import { Typography, Tag, Button } from "antd";
import { useNavigate } from "react-router-dom";
import { ArrowUpOutlined, ArrowDownOutlined, WarningOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

const SOURCE_LABEL_KEYS = {
    purchase: "products.movement_purchase",
    purchase_return: "products.movement_purchase_return",
    order: "products.movement_order",
    order_cancellation: "products.movement_order_cancellation",
    order_return: "products.movement_order_return",
    credit_note_restock: "products.movement_credit_note_restock",
    adjustment: "products.movement_adjustment",
    transfer_out: "products.movement_transfer_out",
    transfer_in: "products.movement_transfer_in",
    transfer_discrepancy: "products.movement_transfer_discrepancy",
};

// One row of the movement ledger - shared by ProductDetailsDrawer's compact
// preview list and MovementHistoryModal's full view, so the two never drift
// out of sync (a new source type or styling tweak only needs to change
// here). transfer_discrepancy is a zero-delta audit entry (see
// stockTransfer.service.js#receiveTransfer's comment) - it gets its own
// amber "warning" treatment instead of falling into the delta>0/delta<0
// cyan/red split, since a 0 delta rendered as "red, pointing down" would
// read as a real stock decrease it isn't.
const MovementRow = ({ movement: m, currentLanguage }) => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const isDiscrepancy = m.source_type === "transfer_discrepancy";

    return (
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--ohnix-line-3)] last:border-0 last:pb-0">
            <div className="flex items-start gap-2 min-w-0">
                {isDiscrepancy ? (
                    <WarningOutlined className="text-amber-400 mt-0.5" />
                ) : m.delta > 0 ? (
                    <ArrowUpOutlined className="text-[#44F3F0] mt-0.5" />
                ) : (
                    <ArrowDownOutlined className="text-red-400 mt-0.5" />
                )}
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Tag color={isDiscrepancy ? "gold" : m.delta > 0 ? "cyan" : "red"} className="!m-0">
                            {t(SOURCE_LABEL_KEYS[m.source_type] || m.source_type)}
                        </Tag>
                        <Text className="text-xs text-[var(--ohnix-text-dim)]">
                            {new Date(m.createdAt).toLocaleString(currentLanguage, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </Text>
                    </div>
                    {m.reason && (
                        <Text className="text-xs text-[var(--ohnix-text-muted)] block mt-1">{m.reason}</Text>
                    )}
                    {isDiscrepancy && (
                        <Text className="text-xs text-amber-400/80 block mt-1">
                            {t("products.transfer_discrepancy_accounting_hint")}
                        </Text>
                    )}
                    {isDiscrepancy && m.source_id && (
                        <Button
                            type="link"
                            size="small"
                            className="!px-0 !h-auto text-xs"
                            onClick={() =>
                                navigate("/accounting", {
                                    state: { tab: "journal", sourceType: "transfer_discrepancy", sourceId: m.source_id },
                                })
                            }
                        >
                            {t("products.transfer_view_in_accounting")}
                        </Button>
                    )}
                    {m.created_by?.username && (
                        <Text className="text-xs text-[var(--ohnix-text-dim)] block mt-0.5">{m.created_by.username}</Text>
                    )}
                </div>
            </div>
            <div className="text-right flex-shrink-0">
                <Text
                    className={`text-sm font-bold block ${
                        isDiscrepancy ? "text-amber-400" : m.delta > 0 ? "text-[#44F3F0]" : "text-red-400"
                    }`}
                >
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                </Text>
                <Text className="text-xs text-[var(--ohnix-text-dim)]">
                    {t("products.balance")}: {m.balance_after}
                </Text>
            </div>
        </div>
    );
};

export default MovementRow;
