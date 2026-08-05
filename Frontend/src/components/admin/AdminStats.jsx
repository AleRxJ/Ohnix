import React from "react";
import { Row, Col } from "antd";
import { BankOutlined, CheckCircleOutlined, TeamOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";

const AdminStats = ({ companies, users }) => {
    const { t } = useI18n();

    const totalCompanies = companies.length;
    const activeCompanies = companies.filter((c) => c.isActive).length;
    const totalUsers = users.length;
    const verifiedUsers = users.filter((u) => u.isVerified).length;

    return (
        <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24} sm={12} lg={6} className="stagger-1">
                <StatCard
                    title={t("admin.stats_total_companies")}
                    value={totalCompanies}
                    icon={<BankOutlined className="text-xl sm:text-2xl" />}
                    valueStyle={{ color: "#29D8D5" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6} className="stagger-2">
                <StatCard
                    title={t("admin.stats_active_companies")}
                    value={activeCompanies}
                    icon={<CheckCircleOutlined className="text-xl sm:text-2xl" />}
                    valueStyle={{ color: "#52c41a" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6} className="stagger-3">
                <StatCard
                    title={t("admin.stats_total_users")}
                    value={totalUsers}
                    icon={<TeamOutlined className="text-xl sm:text-2xl" />}
                    valueStyle={{ color: "#1890ff" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} lg={6} className="stagger-4">
                <StatCard
                    title={t("admin.stats_verified_users")}
                    value={verifiedUsers}
                    icon={<SafetyCertificateOutlined className="text-xl sm:text-2xl" />}
                    valueStyle={{ color: "#faad14" }}
                    className="dashboard-stat-card"
                />
            </Col>
        </Row>
    );
};

export default AdminStats;
