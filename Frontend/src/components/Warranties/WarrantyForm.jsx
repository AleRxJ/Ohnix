import { useEffect, useState } from "react";
import { Modal, Form, Input, InputNumber, Button, AutoComplete, Descriptions, Divider, Empty, Alert } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";

const { TextArea } = Input;

// Registers a new warranty claim (spec sections 2-3). The primary path is
// searching the original sale (invoice/customer/product) so the merchant
// never re-types data Ohnix already has; `prefill` (from OrderDetailsDrawer's
// "Registrar garantía" button) skips straight to a chosen line without a
// search round-trip.
const WarrantyForm = ({ open, onClose, onSubmit, submitting, lookupSale, prefill }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [query, setQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [orders, setOrders] = useState([]);
    const [selectedLine, setSelectedLine] = useState(null);
    // Client-side heads-up only - the account's real configured default
    // duration lives in warranty settings (not fetched here to keep this
    // form lightweight), so 30 is just a reasonable assumption for this
    // preview. The backend's own `already_expired` flag (shown as a toast
    // after saving) is the authoritative check either way.
    const watchedDurationDays = Form.useWatch("warranty_duration_days", form);
    const expiredWarningDate = (() => {
        const purchaseDate = selectedLine?.order?.order_date;
        if (!purchaseDate) return null;
        const days = Number(watchedDurationDays) > 0 ? Number(watchedDurationDays) : 30;
        const estimatedDueDate = dayjs(purchaseDate).add(days, "day");
        return estimatedDueDate.isBefore(dayjs()) ? estimatedDueDate.format("DD/MM/YYYY") : null;
    })();

    useEffect(() => {
        if (!open) {
            form.resetFields();
            setQuery("");
            setOrders([]);
            setSelectedLine(null);
            return;
        }
        if (prefill) {
            setSelectedLine(prefill);
            form.setFieldsValue({ quantity: prefill.line?.quantity || 1 });
        }
    }, [open, prefill]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearch = async (value) => {
        setQuery(value);
        if (!value || value.trim().length < 2) {
            setOrders([]);
            return;
        }
        setSearching(true);
        const results = await lookupSale(value.trim());
        setOrders(results);
        setSearching(false);
    };

    const searchOptions = orders.flatMap((order) =>
        (order.lines || []).map((line) => ({
            value: `${order.order_id}:${line.order_detail_id}`,
            label: `${order.invoice_no} — ${line.product?.product_name} — ${order.customer?.name}`,
            order,
            line,
        }))
    );

    const handleSelectLine = (_, option) => {
        setSelectedLine({ order: option.order, line: option.line });
        form.setFieldsValue({ quantity: option.line.quantity || 1 });
    };

    const handleFinish = async (values) => {
        const payload = {
            reason: values.reason,
            problem_description: values.problem_description,
            serial_number: values.serial_number || undefined,
            quantity: values.quantity || 1,
            observations: values.observations || undefined,
            warranty_duration_days: values.warranty_duration_days || undefined,
        };

        if (selectedLine) {
            payload.customer_id = selectedLine.order.customer?._id;
            payload.product_id = selectedLine.line.product?._id;
            payload.variant_id = selectedLine.line.variant_id || undefined;
            payload.order_id = selectedLine.order.order_id;
            payload.order_detail_id = selectedLine.line.order_detail_id;
        } else {
            payload.customer_id = values.customer_id;
            payload.product_id = values.product_id;
        }

        const ok = await onSubmit(payload);
        if (ok) onClose();
    };

    return (
        <Modal
            title={t("warranties.register_warranty")}
            open={open}
            onCancel={onClose}
            footer={null}
            destroyOnClose
            width={640}
        >
            {!prefill && (
                <div className="mb-4">
                    <AutoComplete
                        value={query}
                        options={searchOptions}
                        onSearch={handleSearch}
                        onSelect={handleSelectLine}
                        className="w-full"
                        notFoundContent={searching ? t("common.loading") : query.length >= 2 ? <Empty description={t("warranties.no_sale_found")} /> : null}
                    >
                        <Input.Search
                            placeholder={t("warranties.search_sale_placeholder")}
                            prefix={<SearchOutlined />}
                            loading={searching}
                        />
                    </AutoComplete>
                </div>
            )}

            {selectedLine && (
                <>
                    <Descriptions size="small" column={2} className="mb-4" bordered>
                        <Descriptions.Item label={t("warranties.field_customer")} span={2}>
                            {selectedLine.order.customer?.name}
                        </Descriptions.Item>
                        <Descriptions.Item label={t("warranties.field_phone")}>{selectedLine.order.customer?.phone || t("common.na")}</Descriptions.Item>
                        <Descriptions.Item label={t("warranties.field_email")}>{selectedLine.order.customer?.email || t("common.na")}</Descriptions.Item>
                        <Descriptions.Item label={t("warranties.field_product")} span={2}>
                            {selectedLine.line.product?.product_name} ({selectedLine.line.product?.sku || t("common.na")})
                        </Descriptions.Item>
                        <Descriptions.Item label={t("warranties.field_invoice")}>{selectedLine.order.invoice_no}</Descriptions.Item>
                        <Descriptions.Item label={t("warranties.field_purchase_date")}>
                            {selectedLine.order.order_date ? dayjs(selectedLine.order.order_date).format("DD/MM/YYYY") : t("common.na")}
                        </Descriptions.Item>
                    </Descriptions>
                    <Divider className="!mt-0" />
                </>
            )}

            {!prefill && !selectedLine && (
                <Form.Item label={t("warranties.field_customer_id")} required>
                    <p className="text-xs text-[var(--ohnix-text-muted)]">{t("warranties.manual_registration_hint")}</p>
                </Form.Item>
            )}

            <Form form={form} layout="vertical" onFinish={handleFinish}>
                {!prefill && !selectedLine && (
                    <>
                        <Form.Item name="customer_id" label={t("warranties.field_customer")} rules={[{ required: true }]}>
                            <Input placeholder={t("warranties.customer_id_placeholder")} />
                        </Form.Item>
                        <Form.Item name="product_id" label={t("warranties.field_product")} rules={[{ required: true }]}>
                            <Input placeholder={t("warranties.product_id_placeholder")} />
                        </Form.Item>
                    </>
                )}
                <Form.Item name="serial_number" label={t("warranties.field_serial")}>
                    <Input />
                </Form.Item>
                <Form.Item name="quantity" label={t("warranties.field_quantity")} initialValue={1}>
                    <InputNumber min={1} className="w-full" />
                </Form.Item>
                <Form.Item name="reason" label={t("warranties.field_reason")} rules={[{ required: true }]}>
                    <Input placeholder={t("warranties.reason_placeholder")} />
                </Form.Item>
                <Form.Item name="problem_description" label={t("warranties.field_problem_description")} rules={[{ required: true }]}>
                    <TextArea rows={3} />
                </Form.Item>
                <Form.Item name="warranty_duration_days" label={t("warranties.field_duration_days")}>
                    <InputNumber min={1} className="w-full" placeholder={t("warranties.duration_placeholder")} />
                </Form.Item>
                <Form.Item name="observations" label={t("warranties.field_observations")}>
                    <TextArea rows={2} />
                </Form.Item>

                {expiredWarningDate && (
                    <Alert
                        type="warning"
                        showIcon
                        className="mb-4"
                        message={t("warranties.already_expired_warning", { date: expiredWarningDate })}
                    />
                )}

                <div className="flex justify-end gap-2 mt-4">
                    <Button onClick={onClose}>{t("common.cancel")}</Button>
                    <Button type="primary" htmlType="submit" loading={submitting} disabled={!prefill && !selectedLine && false}>
                        {t("warranties.register_warranty")}
                    </Button>
                </div>
                <p className="text-xs text-[var(--ohnix-text-muted)] mt-2 mb-0">{t("warranties.register_notify_hint")}</p>
            </Form>
        </Modal>
    );
};

export default WarrantyForm;
