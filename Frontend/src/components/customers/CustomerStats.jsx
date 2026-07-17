import React from "react";
import { Card, Row, Col, Statistic } from "antd";
import {
    UserOutlined,
    TeamOutlined,
    ShopOutlined,
    AppstoreOutlined,
} from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";

const CustomerStats = ({ stats }) => {
    const { t } = useI18n();

    return (
        <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title={t("customers.total_customers")}
                    value={stats.total}
                    icon={
                        <UserOutlined className="text-xl sm:text-2xl text-blue" />
                    }
                    valueStyle={{ color: "#1890ff" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title={t("customers.regular_customers")}
                    value={stats.regular}
                    icon={
                        <TeamOutlined className="text-xl sm:text-2xl text-green" />
                    }
                    valueStyle={{ color: "#52c41a" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title={t("customers.wholesale_customers")}
                    value={stats.wholesale}
                    icon={
                        <AppstoreOutlined className="text-xl sm:text-2xl text-yellow" />
                    }
                    valueStyle={{ color: "#faad14" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title={t("customers.retail_customers")}
                    value={stats.retail}
                    icon={
                        <ShopOutlined className="text-xl sm:text-2xl text-red" />
                    }
                    valueStyle={{ color: "#f5222d" }}
                    className="dashboard-stat-card"
                />
            </Col>
        </Row>
    );
};

export default CustomerStats;
