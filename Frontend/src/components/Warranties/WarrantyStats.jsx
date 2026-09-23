import { Row, Col } from "antd";
import { ExclamationCircleOutlined, CheckCircleOutlined, ToolOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";

const WarrantyStats = ({ dashboard, loading }) => {
    const { t } = useI18n();
    const byStatus = dashboard?.byStatus || {};
    const open = Object.entries(byStatus)
        .filter(([status]) => !["delivered", "closed"].includes(status))
        .reduce((sum, [, count]) => sum + count, 0);

    return (
        <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24} sm={12} md={6}>
                <StatCard
                    title={t("warranties.stat_open")}
                    value={loading ? "—" : open}
                    icon={<SafetyCertificateOutlined className="text-xl sm:text-2xl" />}
                    valueStyle={{ color: "#1890ff" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} md={6}>
                <StatCard
                    title={t("warranties.stat_overdue")}
                    value={loading ? "—" : dashboard?.overdue || 0}
                    icon={<ExclamationCircleOutlined className="text-xl sm:text-2xl" />}
                    valueStyle={{ color: "#ff4d4f" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} md={6}>
                <StatCard
                    title={t("warranties.stat_in_repair")}
                    value={loading ? "—" : byStatus.in_repair || 0}
                    icon={<ToolOutlined className="text-xl sm:text-2xl" />}
                    valueStyle={{ color: "#faad14" }}
                    className="dashboard-stat-card"
                />
            </Col>
            <Col xs={24} sm={12} md={6}>
                <StatCard
                    title={t("warranties.stat_avg_resolution")}
                    value={loading || dashboard?.avgResolutionDays == null ? "—" : `${dashboard.avgResolutionDays} ${t("warranties.days")}`}
                    icon={<CheckCircleOutlined className="text-xl sm:text-2xl" />}
                    valueStyle={{ color: "#52c41a" }}
                    className="dashboard-stat-card"
                />
            </Col>
        </Row>
    );
};

export default WarrantyStats;
