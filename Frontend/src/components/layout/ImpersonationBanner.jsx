import React, { useContext } from "react";
import { Button } from "antd";
import { UserSwitchOutlined, RollbackOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import useI18n from "../../hooks/useI18n";

// Persistent top strip shown for the whole duration of an admin's
// impersonation session (see AuthContext's endImpersonation and Backend's
// impersonateUser/endImpersonation) - always visible regardless of scroll so
// it's never mistaken for the admin's own session. Styled as a dark glass bar
// with an amber accent (not a solid amber fill) so it reads as an Ohnix
// system strip rather than a generic browser warning banner.
const ImpersonationBanner = () => {
    const { user, endImpersonation } = useContext(AuthContext);
    const { t } = useI18n();
    const navigate = useNavigate();

    if (!user?.impersonatedBy) return null;

    const handleEnd = async () => {
        const result = await endImpersonation();
        if (result.success) navigate("/admin");
    };

    return (
        <div
            className="no-print fixed inset-x-0 top-0 z-[1200] flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm backdrop-blur-md"
            style={{
                background: "color-mix(in srgb, var(--ohnix-surface) 90%, var(--ohnix-status-amber) 10%)",
                borderBottom: "1px solid rgba(245, 158, 11, 0.35)",
                boxShadow: "0 6px 24px rgba(0, 0, 0, 0.28)",
            }}
        >
            <span
                className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full"
                style={{
                    background: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: "var(--ohnix-status-amber)",
                }}
            >
                <UserSwitchOutlined style={{ fontSize: 12 }} />
            </span>
            <span className="font-medium" style={{ color: "var(--ohnix-text-soft)" }}>
                {t("admin.impersonating_banner", {
                    username: user.username,
                    admin: user.impersonatedByUsername || "",
                })}
            </span>
            <Button
                size="small"
                icon={<RollbackOutlined />}
                onClick={handleEnd}
                className="!rounded-full !border-[rgba(41,216,213,0.4)] !bg-transparent !text-[var(--ohnix-accent)] hover:!border-[var(--ohnix-accent)] hover:!bg-[var(--ohnix-accent)] hover:!text-[var(--ohnix-accent-contrast)]"
            >
                {t("admin.end_impersonation_cta")}
            </Button>
        </div>
    );
};

export default ImpersonationBanner;
