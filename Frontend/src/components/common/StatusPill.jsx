import useI18n from "../../hooks/useI18n";

export const ELECTRONIC_INVOICE_STATUS_COLORS = {
    accepted: "var(--ohnix-accent-2)",
    submitted: "var(--ohnix-status-purple)",
    issuing: "var(--ohnix-status-purple)",
    rejected: "var(--ohnix-status-rose)",
    error: "var(--ohnix-status-rose)",
    cancelled: "var(--ohnix-text-dim)",
    draft: "var(--ohnix-status-amber)",
    // itcycle-only: DIAN was unreachable, but the document was already built,
    // signed, and delivered to the customer - legally distinct from "error"
    // (nothing to deliver) or "rejected" (DIAN said no). Amber/warning, not
    // rose, on purpose - this isn't a failure state from the customer's side.
    contingency: "var(--ohnix-status-amber)",
};

export const StatusPill = ({ status }) => {
    const { t } = useI18n();
    const color = ELECTRONIC_INVOICE_STATUS_COLORS[status] || "var(--ohnix-text-dim)";
    const label = t(`electronic_invoices.status.${status}`, { defaultValue: status });
    return (
        <span
            className="status-pill"
            style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}
        >
            <span className={`status-dot status-dot--${status}`} />
            {label}
        </span>
    );
};

export default StatusPill;
