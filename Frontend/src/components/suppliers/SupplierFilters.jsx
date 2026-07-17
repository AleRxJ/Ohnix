import React from "react";
import { Card, Row, Col, Select } from "antd";
import { SearchOutlined, FilterOutlined } from "@ant-design/icons";
import { Input } from "antd";
import useI18n from "../../hooks/useI18n";

const { Search } = Input;
const { Option } = Select;

const SupplierFilters = ({
    searchText,
    setSearchText,
    filterType,
    setFilterType,
}) => {
    const { t } = useI18n();
    return (
        <Card className="mb-4">
            <Row gutter={16} align="middle">
                <Col xs={24} md={12} lg={8}>
                    <Search
                        placeholder={t("suppliers.search_suppliers")}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        prefix={<SearchOutlined />}
                        allowClear
                    />
                </Col>
                <Col xs={24} md={12} lg={6}>
                    <Select
                        style={{ width: "100%" }}
                        placeholder={t("suppliers.filter_by_type")}
                        value={filterType}
                        onChange={setFilterType}
                        suffixIcon={<FilterOutlined />}
                    >
                        <Option value="all">{t("suppliers.all_types")}</Option>
                        <Option value="individual">{t("suppliers.individual")}</Option>
                        <Option value="wholesale">{t("suppliers.wholesale")}</Option>
                        <Option value="retail">{t("suppliers.retail")}</Option>
                        <Option value="company">{t("suppliers.company")}</Option>
                    </Select>
                </Col>
            </Row>
        </Card>
    );
};

export default SupplierFilters;
