import { Row, Col } from "antd";
import {
    ShoppingCartOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    DollarOutlined,
} from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";

const OrderStats = ({ stats }) => {
    const { t } = useI18n();
    return (
        <div className="mb-6">
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title={t("orders.total_orders")}
                        value={stats.total}
                        icon={<ShoppingCartOutlined className="text-2xl" />}
                        valueStyle={{ color: "#1890ff" }}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title={t("orders.pending_orders")}
                        value={stats.pending}
                        icon={<ClockCircleOutlined className="text-2xl" />}
                        valueStyle={{ color: "#fa8c16" }}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title={t("orders.completed_orders")}
                        value={stats.completed}
                        icon={<CheckCircleOutlined className="text-2xl" />}
                        valueStyle={{ color: "#52c41a" }}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title={t("orders.total_revenue")}
                        value={stats.revenue}
                        icon={<DollarOutlined className="text-2xl" />}
                        valueStyle={{ color: "#389e0d" }}
                        formatter={(value) => `₹${value.toLocaleString()}`}
                        precision={2}
                    />
                </Col>
            </Row>
        </div>
    );
};

export default OrderStats;
