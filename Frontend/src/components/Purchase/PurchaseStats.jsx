import { Row, Col } from "antd";
import { ClockCircleOutlined, CheckCircleOutlined, UndoOutlined, ShoppingOutlined } from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";
import PropTypes from "prop-types";

const PurchaseStats = ({ stats }) => {
    const { t } = useI18n();
    return (
        <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24} sm={12} md={6}>
                <StatCard title={t("purchases.total_purchases")} value={stats.total} icon={<ShoppingOutlined className="text-xl sm:text-2xl text-blue" />} valueStyle={{ color: "#1890ff" }} className="dashboard-stat-card" />
            </Col>
            <Col xs={24} sm={12} md={6}>
                <StatCard title={t("purchases.pending_purchases")} value={stats.pending} icon={<ClockCircleOutlined className="text-xl sm:text-2xl text-yellow" />} valueStyle={{ color: "#faad14" }} className="dashboard-stat-card" />
            </Col>
            <Col xs={24} sm={12} md={6}>
                <StatCard title={t("purchases.completed_purchases")} value={stats.completed} icon={<CheckCircleOutlined className="text-xl sm:text-2xl text-green" />} valueStyle={{ color: "#52c41a" }} className="dashboard-stat-card" />
            </Col>
            <Col xs={24} sm={12} md={6}>
                <StatCard title={t("purchases.returned_purchases")} value={stats.returned} icon={<UndoOutlined className="text-xl sm:text-2xl text-red" />} valueStyle={{ color: "#ff4d4f" }} className="dashboard-stat-card" />
            </Col>
        </Row>
    );
};

PurchaseStats.propTypes = {
    stats: PropTypes.shape({
        total: PropTypes.number,
        pending: PropTypes.number,
        completed: PropTypes.number,
        returned: PropTypes.number,
    }).isRequired,
};

export default PurchaseStats;
