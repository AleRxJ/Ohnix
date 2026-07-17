import { Card, Input, Select, DatePicker, InputNumber, Button } from "antd";
import {
    SearchOutlined,
    FilterOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { ORDER_STATUSES } from "../../utils/orderHelpers";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;
const { RangePicker } = DatePicker;

const OrderFilters = ({
    filters = {},
    customers = [],
    onFilterChange,
    onApplyFilters,
    onResetFilters,
}) => {
    const { t } = useI18n();
    const totalRange = filters.total_range || {};

    return (
        <Card className="mb-6 border-2 rounded-lg">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                        placeholder={t("orders.search_by_invoice")}
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={filters.search || ""}
                        onChange={(e) =>
                            onFilterChange("search", e.target.value)
                        }
                        allowClear
                        className="h-10"
                    />

                    <Select
                        placeholder={t("customers.select_customer")}
                        onChange={(value) =>
                            onFilterChange("customer_id", value)
                        }
                        allowClear
                        showSearch
                        optionFilterProp="children"
                        className="w-full h-10"
                    >
                        {customers.map((customer) => (
                            <Option key={customer._id} value={customer._id}>
                                {customer.name}
                            </Option>
                        ))}
                    </Select>

                    <Select
                        placeholder={t("common.status")}
                        onChange={(value) =>
                            onFilterChange("order_status", value)
                        }
                        allowClear
                        className="w-full h-10"
                    >
                        {ORDER_STATUSES.map((status) => (
                            <Option key={status.value} value={status.value}>
                                {status.label}
                            </Option>
                        ))}
                    </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <RangePicker
                        placeholder={[t("common.start_date"), t("common.end_date")]}
                        value={filters.date_range}
                        onChange={(dates) =>
                            onFilterChange("date_range", dates)
                        }
                        className="w-full h-10"
                        format="MMM DD, YYYY"
                    />

                    <InputNumber
                        placeholder={t("orders.min_total")}
                        value={totalRange.min}
                        onChange={(value) =>
                            onFilterChange("total_range", {
                                ...totalRange,
                                min: value,
                            })
                        }
                        className="w-full h-10"
                        min={0}
                        prefix="₹"
                        formatter={(value) =>
                            value
                                ? `${value}`.replace(
                                      /\B(?=(\d{3})+(?!\d))/g,
                                      ","
                                  )
                                : ""
                        }
                        parser={(value) => value.replace(/₹\s?|(,*)/g, "")}
                    />

                    <InputNumber
                        placeholder={t("orders.max_total")}
                        value={totalRange.max}
                        onChange={(value) =>
                            onFilterChange("total_range", {
                                ...totalRange,
                                max: value,
                            })
                        }
                        className="w-full h-10"
                        min={0}
                        prefix="₹"
                        formatter={(value) =>
                            value
                                ? `${value}`.replace(
                                      /\B(?=(\d{3})+(?!\d))/g,
                                      ","
                                  )
                                : ""
                        }
                        parser={(value) => value.replace(/₹\s?|(,*)/g, "")}
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-100">
                    <Button
                        type="primary"
                        icon={<FilterOutlined />}
                        onClick={onApplyFilters}
                        className="h-10 font-medium"
                    >
                        {t("common.apply_filters")}
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={onResetFilters}
                        className="h-10"
                    >
                        {t("common.reset")}
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default OrderFilters;
