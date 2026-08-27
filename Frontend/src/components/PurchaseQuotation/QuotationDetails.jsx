import PropTypes from "prop-types";
import { Modal, Table, Descriptions, Tag } from "antd";
import dayjs from "dayjs";
import { getQuotationStatusColor } from "../../utils/quotationUtils";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";

// Deliberately simpler than PurchaseDetails.jsx - no payments, no live
// presence tracking. A quotation isn't money owed to anyone yet, so those
// concerns only apply once it's converted into a real Purchase.
const QuotationDetails = ({ visible, onCancel, quotation }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();

    const columns = [
        {
            title: t("products.product"),
            key: "product",
            render: (_, record) => record.product_id?.product_name || t("common.na"),
        },
        {
            title: t("products.product_code"),
            key: "product_code",
            render: (_, record) => record.product_id?.product_code || t("common.na"),
        },
        { title: t("common.quantity"), dataIndex: "quantity", key: "quantity", align: "center" },
        { title: t("purchases.unit_price"), dataIndex: "unitcost", key: "unitcost", align: "right", render: (v) => formatCurrency(v) },
        { title: t("common.total"), dataIndex: "total", key: "total", align: "right", render: (v) => formatCurrency(v) },
    ];

    return (
        <Modal
            title={quotation ? `${t("quotations.quotation")} #${quotation.quotation_no}` : ""}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={760}
            centered
        >
            {quotation && (
                <>
                    <Descriptions column={2} size="small" className="mb-4">
                        <Descriptions.Item label={t("purchases.supplier")}>{quotation.supplier_id?.name || t("common.na")}</Descriptions.Item>
                        <Descriptions.Item label={t("common.status")}>
                            <Tag color={getQuotationStatusColor(quotation.status)}>{t(`quotations.status_${quotation.status}`)}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("quotations.valid_until")}>
                            {quotation.valid_until ? dayjs(quotation.valid_until).format("DD/MM/YYYY") : "—"}
                        </Descriptions.Item>
                        <Descriptions.Item label={t("common.created_by")}>{quotation.created_by?.username || t("common.na")}</Descriptions.Item>
                        {quotation.notes && (
                            <Descriptions.Item label={t("quotations.notes")} span={2}>
                                {quotation.notes}
                            </Descriptions.Item>
                        )}
                    </Descriptions>
                    <Table
                        columns={columns}
                        dataSource={quotation.details || []}
                        rowKey="_id"
                        pagination={false}
                        size="small"
                        className="module-dark-table"
                    />
                </>
            )}
        </Modal>
    );
};

QuotationDetails.propTypes = {
    visible: PropTypes.bool.isRequired,
    onCancel: PropTypes.func.isRequired,
    quotation: PropTypes.object,
};

export default QuotationDetails;
