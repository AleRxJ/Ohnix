import { useState } from "react";
import { Drawer, Descriptions, Select, Button, Timeline, Upload, Image, Table, Tag, Modal, Radio, Input, Spin, Divider, Space, Alert } from "antd";
import { UploadOutlined, SendOutlined, DeleteOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";

const { TextArea } = Input;

const STATUS_ORDER = [
    "registered",
    "received",
    "in_review",
    "approved",
    "rejected",
    "in_repair",
    "waiting_part",
    "ready",
    "delivered",
    "closed",
];

const COMMUNICATION_STATUS_COLORS = { pending: "default", sent: "blue", delivered: "green", read: "cyan", failed: "red" };

const WarrantyDetails = ({
    open,
    onClose,
    warranty,
    loading,
    updating,
    notifying,
    preview,
    previewLoading,
    enabledStatuses,
    onChangeStatus,
    onUpdateDetails,
    onAddAttachments,
    onRemoveAttachment,
    onFetchPreview,
    onSendNotification,
}) => {
    const { t } = useI18n();
    const [statusComment, setStatusComment] = useState("");
    const [pendingStatus, setPendingStatus] = useState(null);
    const [notifyModalOpen, setNotifyModalOpen] = useState(false);
    const [notifyChannel, setNotifyChannel] = useState("both");
    const [editingResolution, setEditingResolution] = useState(false);
    const [resolutionValue, setResolutionValue] = useState("");

    if (!warranty) {
        return (
            <Drawer open={open} onClose={onClose} width={640} title={t("warranties.warranty_details")}>
                <div className="text-center py-10">
                    <Spin />
                </div>
            </Drawer>
        );
    }

    const statusOptions = (enabledStatuses?.length ? enabledStatuses : STATUS_ORDER).map((s) => ({
        value: s,
        label: t(`warranties.status_${s}`),
    }));

    // Spec section 11 explicitly asks for a visible in-app alert (not just a
    // buried log line) when a warranty event couldn't reach the customer on
    // any channel. Heuristic: a "no_channel_available" event exists and no
    // communication after it actually succeeded - good enough for Phase 1
    // without a dedicated "resolved" flag on the event itself.
    const hasUnreachedCustomerAlert =
        (warranty.events || []).some((e) => e.event_type === "no_channel_available") &&
        !(warranty.communications || []).some((c) => ["sent", "delivered", "read"].includes(c.status));

    const openNotifyModal = async () => {
        setNotifyModalOpen(true);
        await onFetchPreview(warranty._id, "email", warranty.status);
    };

    const handlePreviewChannelChange = (channel) => {
        setNotifyChannel(channel);
        onFetchPreview(warranty._id, channel === "whatsapp" ? "whatsapp" : "email", warranty.status);
    };

    const handleConfirmStatusChange = async () => {
        const ok = await onChangeStatus(warranty._id, pendingStatus, statusComment);
        if (ok) {
            setPendingStatus(null);
            setStatusComment("");
        }
    };

    const communicationColumns = [
        { title: t("warranties.col_date"), dataIndex: "created_at", key: "created_at", render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm") },
        { title: t("warranties.col_channel"), dataIndex: "channel", key: "channel", render: (v) => t(`warranties.channel_${v}`) },
        {
            title: t("warranties.col_communication_status"),
            dataIndex: "status",
            key: "status",
            render: (v) => <Tag color={COMMUNICATION_STATUS_COLORS[v]}>{t(`warranties.communication_status_${v}`)}</Tag>,
        },
        { title: t("warranties.col_recipient"), dataIndex: "recipient", key: "recipient" },
    ];

    return (
        <Drawer open={open} onClose={onClose} width={680} title={`${t("warranties.warranty_details")} — ${warranty.warranty_number}`} loading={loading}>
            {hasUnreachedCustomerAlert && (
                <Alert
                    className="mb-4"
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={t("warranties.alert_no_channel_title")}
                    description={t("warranties.alert_no_channel_desc")}
                />
            )}
            <Descriptions size="small" column={2} bordered className="mb-4">
                <Descriptions.Item label={t("warranties.field_customer")} span={2}>
                    {warranty.customer_name_snapshot}
                </Descriptions.Item>
                <Descriptions.Item label={t("warranties.field_product")} span={2}>
                    {warranty.product_name_snapshot} {warranty.sku_snapshot ? `(${warranty.sku_snapshot})` : ""}
                </Descriptions.Item>
                <Descriptions.Item label={t("warranties.field_serial")}>{warranty.serial_number || t("common.na")}</Descriptions.Item>
                <Descriptions.Item label={t("warranties.field_invoice")}>{warranty.invoice_no || t("common.na")}</Descriptions.Item>
                <Descriptions.Item label={t("warranties.field_purchase_date")}>
                    {warranty.purchase_date ? dayjs(warranty.purchase_date).format("DD/MM/YYYY") : t("common.na")}
                </Descriptions.Item>
                <Descriptions.Item label={t("warranties.field_due_date")}>{dayjs(warranty.due_date).format("DD/MM/YYYY")}</Descriptions.Item>
                <Descriptions.Item label={t("warranties.field_reason")} span={2}>
                    {warranty.reason}
                </Descriptions.Item>
                <Descriptions.Item label={t("warranties.field_problem_description")} span={2}>
                    {warranty.problem_description}
                </Descriptions.Item>
            </Descriptions>

            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Select
                    className="min-w-[220px]"
                    value={pendingStatus || warranty.status}
                    options={statusOptions}
                    onChange={setPendingStatus}
                />
                {pendingStatus && pendingStatus !== warranty.status && (
                    <>
                        <Input
                            placeholder={t("warranties.status_comment_placeholder")}
                            value={statusComment}
                            onChange={(e) => setStatusComment(e.target.value)}
                            style={{ width: 220 }}
                        />
                        <Button type="primary" loading={updating} onClick={handleConfirmStatusChange}>
                            {t("common.save")}
                        </Button>
                    </>
                )}
                <Button icon={<SendOutlined />} onClick={openNotifyModal}>
                    {t("warranties.send_update")}
                </Button>
            </div>
            <p className="text-xs text-[var(--ohnix-text-muted)] mb-6 min-h-[16px]">
                {pendingStatus && pendingStatus !== warranty.status ? t("warranties.status_change_hint") : ""}
            </p>

            <Divider orientation="left" className="text-base font-semibold">
                {t("warranties.section_resolution")}
            </Divider>
            {editingResolution ? (
                <Space direction="vertical" className="w-full mb-6">
                    <TextArea rows={2} value={resolutionValue} onChange={(e) => setResolutionValue(e.target.value)} />
                    <Space>
                        <Button
                            type="primary"
                            loading={updating}
                            onClick={async () => {
                                const ok = await onUpdateDetails(warranty._id, { resolution: resolutionValue });
                                if (ok) setEditingResolution(false);
                            }}
                        >
                            {t("common.save")}
                        </Button>
                        <Button onClick={() => setEditingResolution(false)}>{t("common.cancel")}</Button>
                    </Space>
                </Space>
            ) : (
                <div className="mb-6">
                    <p className="text-sm text-[var(--ohnix-text-muted)] mb-2">{warranty.resolution || t("warranties.no_resolution_yet")}</p>
                    <Button
                        size="small"
                        onClick={() => {
                            setResolutionValue(warranty.resolution || "");
                            setEditingResolution(true);
                        }}
                    >
                        {t("common.edit")}
                    </Button>
                </div>
            )}

            <Divider orientation="left" className="text-base font-semibold">
                {t("warranties.section_attachments")}
            </Divider>
            <div className="mb-6">
                <Upload
                    multiple
                    listType="picture-card"
                    fileList={[]}
                    beforeUpload={() => false}
                    onChange={({ fileList }) => {
                        const files = fileList.map((f) => f.originFileObj).filter(Boolean);
                        if (files.length) onAddAttachments(warranty._id, files);
                    }}
                >
                    <div>
                        <UploadOutlined />
                        <div className="mt-1 text-xs">{t("warranties.upload_evidence")}</div>
                    </div>
                </Upload>
                {warranty.attachments?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {warranty.attachments.map((attachment) => (
                            <div key={attachment._id} className="relative">
                                <Image src={attachment.url} width={80} height={80} style={{ objectFit: "cover" }} />
                                <Button
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    className="absolute -top-2 -right-2"
                                    onClick={() => onRemoveAttachment(warranty._id, attachment._id)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Divider orientation="left" className="text-base font-semibold">
                {t("warranties.section_timeline")}
            </Divider>
            <Timeline
                className="mb-6"
                items={(warranty.events || []).map((event) => ({
                    children: (
                        <div>
                            <p className="m-0 text-sm">
                                {event.new_status
                                    ? t("warranties.timeline_status_changed", { status: t(`warranties.status_${event.new_status}`) })
                                    : t(`warranties.timeline_${event.event_type}`) || event.event_type}
                            </p>
                            {event.comment && <p className="m-0 text-xs text-[var(--ohnix-text-muted)]">{event.comment}</p>}
                            <p className="m-0 text-xs text-[var(--ohnix-text-muted)]">{dayjs(event.created_at).format("DD/MM/YYYY HH:mm")}</p>
                        </div>
                    ),
                }))}
            />

            <Divider orientation="left" className="text-base font-semibold">
                {t("warranties.section_communications")}
            </Divider>
            <Table
                className="module-dark-table"
                size="small"
                rowKey="_id"
                columns={communicationColumns}
                dataSource={warranty.communications || []}
                pagination={false}
            />

            <Modal
                title={t("warranties.send_update")}
                open={notifyModalOpen}
                onCancel={() => setNotifyModalOpen(false)}
                onOk={async () => {
                    const ok = await onSendNotification(warranty._id, { channel: notifyChannel, event: warranty.status });
                    if (ok) setNotifyModalOpen(false);
                }}
                confirmLoading={notifying}
                okText={t("warranties.send_now")}
            >
                <p className="text-xs text-[var(--ohnix-text-muted)] mb-3">{t("warranties.send_update_hint")}</p>
                <Radio.Group value={notifyChannel} onChange={(e) => handlePreviewChannelChange(e.target.value)} className="mb-4">
                    <Radio.Button value="whatsapp">{t("warranties.channel_whatsapp")}</Radio.Button>
                    <Radio.Button value="email">{t("warranties.channel_email")}</Radio.Button>
                    <Radio.Button value="both">{t("warranties.channel_both")}</Radio.Button>
                </Radio.Group>
                {previewLoading ? (
                    <Spin />
                ) : (
                    <div className="rounded-lg p-3 border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]">
                        {preview?.subject && <p className="font-medium mb-1">{preview.subject}</p>}
                        <p className="whitespace-pre-line text-sm">{preview?.body}</p>
                    </div>
                )}
            </Modal>
        </Drawer>
    );
};

export default WarrantyDetails;
