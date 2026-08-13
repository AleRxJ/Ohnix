import React, { useState } from "react";
import {
    Card,
    Input,
    Button,
    Row,
    Col,
    Typography,
    Space,
    Divider,
    Tooltip,
} from "antd";
import {
    PlusOutlined,
    SearchOutlined,
    ShoppingCartOutlined,
} from "@ant-design/icons";
import PurchaseStats from "./PurchaseStats";
import PurchaseTable from "./PurchaseTable";
import PurchaseForm from "./PurchaseForm";
import PurchaseDetails from "./PurchaseDetails";
import ReturnPreview from "./ReturnPreview";
import { generatePurchaseNo } from "../../utils/purchaseUtils";
import { Form } from "antd";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";

const { Title } = Typography;

const PurchaseList = ({
    purchases,
    suppliers,
    products,
    loading,
    stats,
    onCreatePurchase,
    onUpdateStatus,
    onFetchPurchaseDetails,
    onFetchReturnPreview,
    purchaseDetails,
    returnPreviewData,
}) => {
    const [searchText, setSearchText] = useState("");
    const [modalVisible, setModalVisible] = useState(false);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [returnPreviewModalVisible, setReturnPreviewModalVisible] =
        useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState(null);
    const [form] = Form.useForm();
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("purchases", "edit");

    const handleViewDetails = async (purchase) => {
        setSelectedPurchase(purchase);
        await onFetchPurchaseDetails(purchase._id);
        setDetailModalVisible(true);
    };

    const handleReturnPreview = async (purchaseId) => {
        await onFetchReturnPreview(purchaseId);
        setReturnPreviewModalVisible(true);
    };

    const handleCreatePurchase = async (values) => {
        const result = await onCreatePurchase(values);
        if (result.success) {
            setModalVisible(false);
            form.resetFields();
        }
    };

    const handleAddPurchase = () => {
        form.resetFields();
        form.setFieldsValue({
            purchase_no: generatePurchaseNo(),
            purchase_status: "pending",
            details: [{}],
        });
        setModalVisible(true);
    };

    return (
        <div className="min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="p-4 sm:p-6 lg:p-8">
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                        <div className="mb-4 sm:mb-0">
                            <div className="flex-1 min-w-0">
                                <h1 className="truncate mb-1 text-4xl font-bold flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                                    {t("purchases.purchases")}<ShoppingCartOutlined className="text-[#44F3F0] inline-block ml-2" />
                                </h1>
                            </div>
                            <p className="text-[var(--ohnix-text-muted)] text-sm sm:text-base">{t("purchases.manage_purchases_description")}</p>
                        </div>
                    </div>

                    {/* Stats Section */}
                    <PurchaseStats stats={stats} />
                </div>

                {/* Search and Add Section */}
                <Card className="mb-6 shadow-sm border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] text-[var(--ohnix-text-primary)]">
                    <Row
                        gutter={[16, 16]}
                        align="middle"
                        className="flex-col sm:flex-row"
                    >
                        <Col flex="auto" className="w-full sm:w-auto">
                            <Input.Search
                                placeholder={t("purchases.search_by_purchase")}
                                allowClear
                                enterButton={<Button type="primary" icon={<SearchOutlined />}>{t("common.search")}</Button>}
                                size="large"
                                onSearch={(value) => setSearchText(value)}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full"
                            />
                        </Col>
                        <Col className="w-full sm:w-auto">
                            <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                                <span className="w-full sm:w-auto inline-block">
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        size="large"
                                        onClick={handleAddPurchase}
                                        className="w-full sm:w-auto bg-[#44F3F0] text-[#021314] border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                                        disabled={!canEdit}
                                    > {t("purchases.add_new_purchase")}
                                    </Button>
                                </span>
                            </Tooltip>
                        </Col>
                    </Row>
                </Card>

                {/* Table Section */}
                <Card className="shadow-sm border border-[var(--ohnix-line-4)] overflow-hidden bg-[var(--ohnix-surface-card)] text-[var(--ohnix-text-primary)]">
                    <div className="p-4 sm:p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-6 bg-gradient-to-b from-[#29D8D5] to-[#44F3F0] rounded-full"></div>
                            <Title level={4} className="!mb-0 !text-[var(--ohnix-text-primary)]">{t("purchases.purchase_orders")}</Title>
                        </div>
                        <PurchaseTable
                            purchases={purchases}
                            loading={loading}
                            searchText={searchText}
                            onViewDetails={handleViewDetails}
                            onUpdateStatus={onUpdateStatus}
                            onReturnPreview={handleReturnPreview}
                        />
                    </div>
                </Card>
            </div>

            {/* Modals */}
            <PurchaseForm
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                onSubmit={handleCreatePurchase}
                suppliers={suppliers}
                products={products}
                form={form}
                initialValues={{
                    purchase_no: generatePurchaseNo(),
                    purchase_status: "pending",
                    details: [{}],
                }}
            />

            <PurchaseDetails
                visible={detailModalVisible}
                onCancel={() => setDetailModalVisible(false)}
                purchase={selectedPurchase}
                details={purchaseDetails}
            />

            <ReturnPreview
                visible={returnPreviewModalVisible}
                onCancel={() => setReturnPreviewModalVisible(false)}
                onProceed={onUpdateStatus}
                returnPreviewData={returnPreviewData}
                purchases={purchases}
            />
        </div>
    );
};

export default PurchaseList;
