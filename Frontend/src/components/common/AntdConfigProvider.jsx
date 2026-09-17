import React from "react";
import { ConfigProvider, Empty, theme as antdTheme } from "antd";
import useI18n from "../../hooks/useI18n";
import { useTheme } from "../../context/ThemeContext";

// Ant Design's algorithm needs real, parseable colors to derive every
// hover/active/disabled/shadow shade it computes internally (TinyColor can't
// resolve a var(--ohnix-*) reference at token-computation time), so these
// mirror the literal values in index.css's :root / [data-ohnix-theme="lite"]
// blocks rather than pointing at the CSS custom properties directly. Keep
// them in sync if that palette changes.
const BRAND_TOKENS = {
    colorPrimary: "#29d8d5",
    colorLink: "#29d8d5",
    colorInfo: "#29d8d5",
    borderRadius: 10,
    fontFamily: "inherit",
};

const DARK_TOKENS = {
    ...BRAND_TOKENS,
    colorBgBase: "#0b0b0b",
    colorTextBase: "#ffffff",
    colorBgContainer: "rgba(11, 11, 11, 0.92)",
    colorBgElevated: "#141517",
    colorBorder: "rgba(255, 255, 255, 0.12)",
    colorBorderSecondary: "rgba(255, 255, 255, 0.08)",
    colorBgMask: "rgba(0, 0, 0, 0.55)",
};

const LITE_TOKENS = {
    ...BRAND_TOKENS,
    colorBgBase: "#ffffff",
    colorTextBase: "#0f1720",
    colorBgContainer: "rgba(255, 255, 255, 0.97)",
    colorBgElevated: "#ffffff",
    colorBorder: "rgba(15, 23, 42, 0.13)",
    colorBorderSecondary: "rgba(15, 23, 42, 0.08)",
    colorBgMask: "rgba(15, 23, 42, 0.38)",
};

/**
 * Wraps the app with Ant Design's ConfigProvider so that all tables,
 * selects, and lists show translated empty-state text automatically, and so
 * antd's own chrome (Modal, Drawer, Select, DatePicker, Table, Popconfirm,
 * Tooltip...) follows the account's Dark/Lite preference instead of always
 * rendering with antd's light-only defaults.
 */
const AntdConfigProvider = ({ children }) => {
    const { t } = useI18n();
    const { theme } = useTheme();
    const isLite = theme === "lite";

    return (
        <ConfigProvider
            theme={{
                algorithm: isLite ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
                token: isLite ? LITE_TOKENS : DARK_TOKENS,
            }}
            renderEmpty={() => (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t("common.no_data")}
                />
            )}
        >
            {children}
        </ConfigProvider>
    );
};

export default AntdConfigProvider;
