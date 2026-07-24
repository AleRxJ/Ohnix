import React from "react";
import { Typography, Button } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

const DashboardHeader = ({ onRefresh }) => {
    const { t, currentLanguage } = useI18n();
    const locale = currentLanguage === "es" ? "es-ES" : "en-US";
    const today = new Date().toLocaleDateString(locale, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <header className="rounded-2xl border border-white/10 bg-[#0B0B0B]/92 px-6 py-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md animate-fade-up">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="mb-1 text-4xl font-bold text-white">{t("common.dashboard")}</h1>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                        <Text className="text-sm text-[#A9B3B8]">
                            {t("dashboard.performance_metrics")}
                        </Text>
                        <Text className="text-xs text-[#A9B3B8] sm:border-l sm:border-white/10 sm:pl-3">
                            {today}
                        </Text>
                    </div>
                </div>
                {onRefresh && (
                    <Button
                        onClick={onRefresh}
                        icon={<ReloadOutlined />}
                        type="default"
                        size="middle"
                        className="shrink-0 border-0 bg-[#29D8D5] text-[#021314] hover:!bg-[#44F3F0] hover:!text-[#021314] font-semibold"
                    >
                        <span className="hidden sm:inline">{t("common.refresh")}</span>
                    </Button>
                )}
            </div>
        </header>
    );
};

export default DashboardHeader;
