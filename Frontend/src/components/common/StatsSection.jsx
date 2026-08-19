import React from "react";
import { Row, Col } from "antd";
import { TagsOutlined, AppstoreOutlined } from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";

// "In use" / "unused" is based on whether at least one product references the
// category or unit (products_count from the backend) - this is shared team
// state, not tied to who created the row, so it reads the same for every
// member of a team account (unlike the old "mine" split it replaced).
const StatsSection = ({ categoryStats, unitStats }) => {
    const { t } = useI18n();
    return (
        <Row gutter={[16, 16]} className="mb-0">
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title={t("categories_units.total_categories")}
                    value={categoryStats.total}
                    icon={
                        <TagsOutlined className="text-xl sm:text-2xl text-blue" />
                    }
                    valueStyle={{ color: "#1890ff" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title={t("categories_units.categories_in_use")}
                    value={categoryStats.inUse}
                    suffix={`/ ${categoryStats.total}`}
                    description={t("categories_units.categories_in_use_hint", {
                        count: categoryStats.unused,
                    })}
                    icon={
                        <TagsOutlined className="text-xl sm:text-2xl text-green" />
                    }
                    valueStyle={{ color: "#52c41a" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title={t("categories_units.total_units")}
                    value={unitStats.total}
                    icon={
                        <AppstoreOutlined className="text-xl sm:text-2xl text-purple" />
                    }
                    valueStyle={{ color: "#722ed1" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title={t("categories_units.units_in_use")}
                    value={unitStats.inUse}
                    suffix={`/ ${unitStats.total}`}
                    description={t("categories_units.units_in_use_hint", {
                        count: unitStats.unused,
                    })}
                    icon={
                        <AppstoreOutlined className="text-xl sm:text-2xl text-orange" />
                    }
                    valueStyle={{ color: "#fa8c16" }}
                    className="dashboard-stat-card"
                />
            </Col>
        </Row>
    );
};

export default StatsSection;
