import React from "react";
import { Input, Button, Space } from "antd";
import {
    SearchOutlined,
    FilterOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const ProductSearchBar = ({
    searchText,
    onSearchChange,
    onSearch,
    onShowFilters,
    onReset,
}) => {
    const { t } = useI18n();

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 mb-6">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex-1">
                    <Input
                        placeholder={t("products.search_products")}
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={searchText}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onPressEnter={onSearch}
                        size="large"
                        className="w-full"
                    />
                </div>

                <Space size="small" className="w-full sm:w-auto">
                    <Button
                        icon={<FilterOutlined />}
                        onClick={onShowFilters}
                        size="large"
                        className="flex-1 sm:flex-none"
                    >
                        {t("products.filters")}
                    </Button>

                    <Button
                        icon={<ReloadOutlined />}
                        onClick={onReset}
                        size="large"
                        className="flex-1 sm:flex-none"
                    >
                        {t("products.reset")}
                    </Button>

                    <Button
                        type="primary"
                        onClick={onSearch}
                        size="large"
                        className="flex-1 sm:flex-none"
                    >
                        {t("common.search")}
                    </Button>
                </Space>
            </div>
        </div>
    );
};

export default ProductSearchBar;
