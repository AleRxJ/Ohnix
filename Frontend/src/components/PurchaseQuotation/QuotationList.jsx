import { useState } from "react";
import { Card, Input, Button, Row, Col, Typography, Tooltip, Form, Select } from "antd";
import { PlusOutlined, SearchOutlined, TagsOutlined } from "@ant-design/icons";
import QuotationStats from "./QuotationStats";
import QuotationTable from "./QuotationTable";
import QuotationForm from "./QuotationForm";
import QuotationDetails from "./QuotationDetails";
import PurchaseForm from "../Purchase/PurchaseForm";
import { generateQuotationNo } from "../../utils/quotationUtils";
import { generatePurchaseNo } from "../../utils/purchaseUtils";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";

const { Title } = Typography;

// Mirrors PurchaseList.jsx's shape. The one flow that doesn't exist on the
// Purchase side: "Convertir en Orden de Compra" reuses PurchaseForm itself
// (see its initialQuotation prop) instead of a bespoke conversion screen -
// the user gets one last look at a real purchase-creation form, pre-filled
// and locked to what was quoted, before committing.
const QuotationList = ({
    quotations,
    suppliers,
    products,
    loading,
    stats,
    onCreateQuotation,
    onMarkReceived,
    onReject,
    updatingQuotationId,
    onFetchQuotationDetails,
    quotationDetails,
    onCreatePurchase,
}) => {
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [modalVisible, setModalVisible] = useState(false);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [convertModalVisible, setConvertModalVisible] = useState(false);
    const [convertingQuotation, setConvertingQuotation] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [convertSubmitting, setConvertSubmitting] = useState(false);
    const [form] = Form.useForm();
    const [convertForm] = Form.useForm();
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("purchases", "edit");

    const handleViewDetails = async (quotation) => {
        await onFetchQuotationDetails(quotation._id);
        setDetailModalVisible(true);
    };

    const handleCreateQuotation = async (values) => {
        setSubmitting(true);
        try {
            const result = await onCreateQuotation(values);
            if (result.success) {
                setModalVisible(false);
                form.resetFields();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddQuotation = () => {
        form.resetFields();
        form.setFieldsValue({ quotation_no: generateQuotationNo(), details: [{}] });
        setModalVisible(true);
    };

    const handleConvert = (quotation) => {
        setConvertingQuotation(quotation);
        convertForm.resetFields();
        convertForm.setFieldsValue({
            purchase_no: generatePurchaseNo(),
            purchase_status: "pending",
            pointOfSaleId: quotation.pointOfSaleId,
            supplier_id: quotation.supplier_id?._id || quotation.supplier_id,
            details: (quotation.details || []).map((d) => ({
                product_id: d.product_id?._id || d.product_id,
                quantity: d.quantity,
                unitcost: d.unitcost,
            })),
        });
        setConvertModalVisible(true);
    };

    const handleConvertSubmit = async (purchaseData) => {
        setConvertSubmitting(true);
        try {
            const result = await onCreatePurchase(purchaseData);
            if (result.success) {
                setConvertModalVisible(false);
                setConvertingQuotation(null);
            }
        } finally {
            setConvertSubmitting(false);
        }
    };

    return (
        <div className="quotation-page min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="p-4 sm:p-6 lg:p-8">
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                        <div className="mb-4 sm:mb-0">
                            <h1 className="truncate mb-1 text-4xl font-bold flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                                {t("quotations.quotations")}
                                <TagsOutlined className="text-[#44F3F0] inline-block ml-2" />
                            </h1>
                            <p className="text-[var(--ohnix-text-muted)] text-sm sm:text-base">{t("quotations.manage_quotations_description")}</p>
                        </div>
                        <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                            <span className="w-full sm:w-auto inline-block">
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    size="large"
                                    onClick={handleAddQuotation}
                                    className="quotation-primary-action w-full sm:w-auto"
                                    disabled={!canEdit}
                                >
                                    {t("quotations.add_new_quotation")}
                                </Button>
                            </span>
                        </Tooltip>
                    </div>

                    <QuotationStats stats={stats} />
                </div>

                <Card className="quotation-toolbar mb-6 shadow-sm border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] text-[var(--ohnix-text-primary)]">
                    <Row gutter={[16, 16]} align="middle" className="flex-col sm:flex-row">
                        <Col flex="auto" className="w-full sm:w-auto">
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Input.Search
                                    placeholder={t("quotations.search_by_quotation")}
                                    allowClear
                                    enterButton={<Button type="primary" icon={<SearchOutlined />}>{t("common.search")}</Button>}
                                    size="large"
                                    onSearch={(value) => setSearchText(value)}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    className="w-full"
                                />
                                <Select
                                    value={statusFilter}
                                    onChange={setStatusFilter}
                                    size="large"
                                    className="w-full sm:w-48"
                                    options={[
                                        { value: "all", label: t("quotations.all_statuses") },
                                        { value: "draft", label: t("quotations.status_draft") },
                                        { value: "received", label: t("quotations.status_received") },
                                        { value: "approved", label: t("quotations.status_approved") },
                                        { value: "rejected", label: t("quotations.status_rejected") },
                                    ]}
                                />
                            </div>
                        </Col>
                    </Row>
                </Card>

                <Card className="quotation-table-shell shadow-sm border border-[var(--ohnix-line-4)] overflow-hidden bg-[var(--ohnix-surface-card)] text-[var(--ohnix-text-primary)]">
                    <div className="p-4 sm:p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-6 bg-gradient-to-b from-[#29D8D5] to-[#44F3F0] rounded-full"></div>
                            <Title level={4} className="!mb-0 !text-[var(--ohnix-text-primary)]">{t("quotations.quotations")}</Title>
                        </div>
                        <QuotationTable
                            quotations={quotations}
                            loading={loading}
                            searchText={searchText}
                            statusFilter={statusFilter}
                            onViewDetails={handleViewDetails}
                            onMarkReceived={onMarkReceived}
                            onReject={onReject}
                            onConvert={handleConvert}
                            updatingQuotationId={updatingQuotationId}
                        />
                    </div>
                </Card>
            </div>

            <QuotationForm
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                onSubmit={handleCreateQuotation}
                suppliers={suppliers}
                products={products}
                form={form}
                submitting={submitting}
                initialValues={{ quotation_no: generateQuotationNo(), details: [{}] }}
            />

            <QuotationDetails visible={detailModalVisible} onCancel={() => setDetailModalVisible(false)} quotation={quotationDetails} />

            {convertingQuotation && (
                <PurchaseForm
                    visible={convertModalVisible}
                    onCancel={() => setConvertModalVisible(false)}
                    onSubmit={handleConvertSubmit}
                    suppliers={suppliers}
                    products={products}
                    form={convertForm}
                    submitting={convertSubmitting}
                    initialQuotation={convertingQuotation}
                />
            )}
        </div>
    );
};

export default QuotationList;
