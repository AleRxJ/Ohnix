import React from "react";
import { Row, Col } from "antd";
import { TagsOutlined, AppstoreOutlined } from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";

// "Mine" (categoryStats.mine/unitStats.mine) is "records where created_by
// is literally me" - meaningful for a solo account, but not for a team
// account: every team resource is scoped under the owner's id regardless of
// which member actually created it (see the Team model comment in
// schema.prisma), and there's no per-actor authorship tracked yet. Showing
// "Tus categorías: 0" to a member who just created one was confusing/wrong,
// not just imprecise - so callers pass showMineStats={false} for any
// team account (owner or member) and this renders only the honest, always-
// accurate totals instead.
const StatsSection = ({ categoryStats, unitStats, showMineStats = true }) => {
    const { t } = useI18n();
    const span = showMineStats ? 6 : 12;
    return (
        <Row gutter={[16, 16]} className="mb-0">
            <Col xs={24} sm={12} lg={span}>
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
            {showMineStats && (
                <Col xs={24} sm={12} lg={span}>
                    <StatCard
                        title={t("categories_units.your_categories")}
                        value={categoryStats.mine}
                        icon={
                            <TagsOutlined className="text-xl sm:text-2xl text-green" />
                        }
                        valueStyle={{ color: "#52c41a" }}
                        className="dashboard-stat-card"
                    />
                </Col>
            )}
            <Col xs={24} sm={12} lg={span}>
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
            {showMineStats && (
                <Col xs={24} sm={12} lg={span}>
                    <StatCard
                        title={t("categories_units.your_units")}
                        value={unitStats.mine}
                        icon={
                            <AppstoreOutlined className="text-xl sm:text-2xl text-orange" />
                        }
                        valueStyle={{ color: "#fa8c16" }}
                        className="dashboard-stat-card"
                    />
                </Col>
            )}
        </Row>
    );
};

export default StatsSection;
