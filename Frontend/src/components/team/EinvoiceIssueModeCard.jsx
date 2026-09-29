import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Card, Radio } from "antd";
import { SendOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";
import { resolveApiErrorMessage } from "../../utils/apiError";

// When a completed sale goes to DIAN: always right away, or asked per sale
// ("Emitir ahora" preselected; "Emitir después" needs the deferEinvoice
// capability and leaves the sale in "Ventas sin documento").
const EinvoiceIssueModeCard = ({ company, onCompanyChanged }) => {
    const { t } = useI18n();
    const [mode, setMode] = useState(company?.einvoiceIssueMode || "ask");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setMode(company?.einvoiceIssueMode || "ask");
    }, [company?.einvoiceIssueMode]);

    const change = async (next) => {
        const previous = mode;
        setMode(next);
        setSaving(true);
        try {
            const response = await companyService.updateMyCompany({ einvoiceIssueMode: next });
            onCompanyChanged?.(response?.data);
            toast.success(t("einvoice_mode.saved"));
        } catch (error) {
            setMode(previous);
            toast.error(resolveApiErrorMessage(error, t, {}, "einvoice_mode.save_failed"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
            <div className="mb-3 flex items-center gap-2 font-semibold text-[var(--ohnix-text-primary)]">
                <SendOutlined className="text-[var(--ohnix-accent)]" /> {t("einvoice_mode.title")}
            </div>
            <Radio.Group value={mode} onChange={(e) => change(e.target.value)} disabled={saving} className="flex flex-col gap-3">
                <Radio value="ask">
                    <span className="font-medium">{t("einvoice_mode.ask")}</span>
                    <span className="block text-xs text-[var(--ohnix-text-muted)]">{t("einvoice_mode.ask_hint")}</span>
                </Radio>
                <Radio value="automatic">
                    <span className="font-medium">{t("einvoice_mode.automatic")}</span>
                    <span className="block text-xs text-[var(--ohnix-text-muted)]">{t("einvoice_mode.automatic_hint")}</span>
                </Radio>
            </Radio.Group>
        </Card>
    );
};

EinvoiceIssueModeCard.propTypes = {
    company: PropTypes.object,
    onCompanyChanged: PropTypes.func,
};

export default EinvoiceIssueModeCard;
