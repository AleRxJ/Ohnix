import { Row, Col } from "antd";
import {
    ShoppingCartOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    DollarOutlined,
} from "@ant-design/icons";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";

const OrderStats = ({ stats }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    return (
        <div className="mb-6">
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6} className="stagger-1">
                    <StatCard
                        title={t("orders.total_orders")}
                        value={stats.total}
                        icon={<ShoppingCartOutlined className="text-2xl" />}
                        valueStyle={{ color: "#1890ff" }}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6} className="stagger-2">
                    <StatCard
                        title={t("orders.pending_orders")}
                        value={stats.pending}
                        icon={<ClockCircleOutlined className="text-2xl" />}
                        valueStyle={{ color: "#fa8c16" }}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6} className="stagger-3">
                    <StatCard
                        title={t("orders.completed_orders")}
                        value={stats.completed}
                        icon={<CheckCircleOutlined className="text-2xl" />}
                        valueStyle={{ color: "#52c41a" }}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6} className="stagger-4">
                    <StatCard
                        title={t("orders.total_revenue")}
                        value={stats.revenue}
                        icon={<DollarOutlined className="text-2xl" />}
                        valueStyle={{ color: "#389e0d" }}
                        formatter={(value) => formatCurrency(value)}
                        precision={2}
                    />
                </Col>
            </Row>
        </div>
    );
};

export default OrderStats;
