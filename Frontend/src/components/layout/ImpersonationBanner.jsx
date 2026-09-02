import React, { useContext } from "react";
import { Button } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import useI18n from "../../hooks/useI18n";

// Persistent top strip shown for the whole duration of an admin's
// impersonation session (see AuthContext's endImpersonation and Backend's
// impersonateUser/endImpersonation) - always visible regardless of scroll so
// it's never mistaken for the admin's own session.
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
            className="no-print fixed inset-x-0 top-0 z-[1200] flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm font-medium"
            style={{ background: "linear-gradient(90deg, #f59e0b, #f97316)", color: "#1a1200" }}
        >
            <span>
                {t("admin.impersonating_banner", {
                    username: user.username,
                    admin: user.impersonatedByUsername || "",
                })}
            </span>
            <Button
                size="small"
                icon={<LogoutOutlined />}
                onClick={handleEnd}
                className="!border-[#1a1200] !text-[#1a1200] hover:!bg-[#1a1200] hover:!text-white"
            >
                {t("admin.end_impersonation_cta")}
            </Button>
        </div>
    );
};

export default ImpersonationBanner;
