import React from "react";
import { ConfigProvider, Empty } from "antd";
import useI18n from "../../hooks/useI18n";

/**
 * Wraps the app with Ant Design's ConfigProvider so that all tables,
 * selects, and lists show translated empty-state text automatically.
 */
const AntdConfigProvider = ({ children }) => {
    const { t } = useI18n();

    return (
        <ConfigProvider
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
