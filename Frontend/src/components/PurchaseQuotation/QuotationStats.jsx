import { Row, Col } from "antd";
import { FileTextOutlined, CheckCircleOutlined, ShoppingOutlined, CloseCircleOutlined } from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";
import PropTypes from "prop-types";

const QuotationStats = ({ stats }) => {
    const { t } = useI18n();
    return (
        <Row gutter={[16, 16]} className="mb-6">
            <Col xs={12} sm={8} md={6} lg={24 / 5}>
                <StatCard title={t("quotations.total")} value={stats.total} icon={<ShoppingOutlined className="text-xl sm:text-2xl" />} valueStyle={{ color: "#1890ff" }} className="dashboard-stat-card" />
            </Col>
            <Col xs={12} sm={8} md={6} lg={24 / 5}>
                <StatCard title={t("quotations.draft")} value={stats.draft} icon={<FileTextOutlined className="text-xl sm:text-2xl" />} valueStyle={{ color: "#8c8c8c" }} className="dashboard-stat-card" />
            </Col>
            <Col xs={12} sm={8} md={6} lg={24 / 5}>
                <StatCard title={t("quotations.received")} value={stats.received} icon={<CheckCircleOutlined className="text-xl sm:text-2xl" />} valueStyle={{ color: "#1890ff" }} className="dashboard-stat-card" />
            </Col>
            <Col xs={12} sm={8} md={6} lg={24 / 5}>
                <StatCard title={t("quotations.approved")} value={stats.approved} icon={<ShoppingOutlined className="text-xl sm:text-2xl" />} valueStyle={{ color: "#52c41a" }} className="dashboard-stat-card" />
            </Col>
            <Col xs={12} sm={8} md={6} lg={24 / 5}>
                <StatCard title={t("quotations.rejected")} value={stats.rejected} icon={<CloseCircleOutlined className="text-xl sm:text-2xl" />} valueStyle={{ color: "#fb7185" }} className="dashboard-stat-card" />
            </Col>
        </Row>
    );
};

QuotationStats.propTypes = {
    stats: PropTypes.shape({
        total: PropTypes.number,
        draft: PropTypes.number,
        received: PropTypes.number,
        approved: PropTypes.number,
        rejected: PropTypes.number,
    }).isRequired,
};

export default QuotationStats;
