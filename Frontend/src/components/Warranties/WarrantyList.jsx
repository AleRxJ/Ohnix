import { useState } from "react";
import { Input, Select, Button, Space, DatePicker, Card, Row, Col, Typography } from "antd";
import { PlusOutlined, SettingOutlined, SearchOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { useWarranties } from "../../hooks/warranties/useWarranties";
import { useWarrantyDetails } from "../../hooks/warranties/useWarrantyDetails";
import { useWarrantySettings } from "../../hooks/warranties/useWarrantySettings";
import WarrantyStats from "./WarrantyStats";
import WarrantyTable from "./WarrantyTable";
import WarrantyForm from "./WarrantyForm";
import WarrantyDetails from "./WarrantyDetails";
import WarrantySettings from "./WarrantySettings";

const { Title } = Typography;

const VIEW_OPTIONS = ["open", "overdue", "due_soon", "closed"];

const WarrantyList = () => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("warranties", "edit");
    const canAdmin = hasPermission("warranties", "admin");

    const {
        warranties,
        loading,
        pagination,
        filters,
        setFilters,
        submitting,
        dashboard,
        dashboardLoading,
        fetchWarranties,
        lookupSale,
        createWarranty,
    } = useWarranties();

    const details = useWarrantyDetails();
    const settingsHook = useWarrantySettings();

    const [createOpen, setCreateOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [searchText, setSearchText] = useState("");

    const openDetails = async (warranty) => {
        setDetailsOpen(true);
        await details.fetchWarrantyDetails(warranty._id);
    };

    const openSettings = async () => {
        setSettingsOpen(true);
        await settingsHook.fetchSettings();
    };

    return (
        <div className="min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="p-4 sm:p-6 lg:p-8">
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="truncate mb-1 text-4xl font-bold flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                                {t("warranties.title")}<SafetyCertificateOutlined className="text-[#44F3F0] inline-block ml-2" />
                            </h1>
                            <p className="text-[var(--ohnix-text-muted)] text-sm sm:text-base">{t("warranties.page_subtitle")}</p>
                        </div>
                        <Space>
                            {canAdmin && (
                                <Button size="large" icon={<SettingOutlined />} onClick={openSettings}>
                                    {t("warranties.settings_title")}
                                </Button>
                            )}
                            {canEdit && (
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    size="large"
                                    onClick={() => setCreateOpen(true)}
                                    className="bg-[#44F3F0] text-[#021314] border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                                >
                                    {t("warranties.register_warranty")}
                                </Button>
                            )}
                        </Space>
                    </div>

                    <WarrantyStats dashboard={dashboard} loading={dashboardLoading} />
                </div>

                {/* Filters Section */}
                <Card className="mb-6 shadow-sm border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] text-[var(--ohnix-text-primary)]">
                    <Row gutter={[16, 16]} align="middle" className="flex-col sm:flex-row">
                        <Col flex="auto" className="w-full sm:w-auto">
                            <Input.Search
                                placeholder={t("warranties.search_placeholder")}
                                prefix={<SearchOutlined />}
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                onSearch={(value) => setFilters((prev) => ({ ...prev, search: value || undefined }))}
                                allowClear
                                size="large"
                                className="w-full"
                            />
                        </Col>
                        <Col className="w-full sm:w-auto">
                            <Select
                                placeholder={t("warranties.filter_view")}
                                allowClear
                                size="large"
                                style={{ width: "100%", minWidth: 180 }}
                                options={VIEW_OPTIONS.map((v) => ({ value: v, label: t(`warranties.view_${v}`) }))}
                                onChange={(value) => setFilters((prev) => ({ ...prev, view: value }))}
                            />
                        </Col>
                        <Col className="w-full sm:w-auto">
                            <DatePicker.RangePicker
                                size="large"
                                className="w-full"
                                onChange={(range) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        date_from: range?.[0]?.toISOString(),
                                        date_to: range?.[1]?.toISOString(),
                                    }))
                                }
                            />
                        </Col>
                    </Row>
                </Card>

                {/* Table Section */}
                <Card className="shadow-sm border border-[var(--ohnix-line-4)] overflow-hidden bg-[var(--ohnix-surface-card)] text-[var(--ohnix-text-primary)]">
                    <div className="p-4 sm:p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-6 bg-gradient-to-b from-[#29D8D5] to-[#44F3F0] rounded-full"></div>
                            <Title level={4} className="!mb-0 !text-[var(--ohnix-text-primary)]">{t("warranties.list_section_title")}</Title>
                        </div>
                        <WarrantyTable
                            warranties={warranties}
                            loading={loading}
                            pagination={pagination}
                            onChangePage={(page, pageSize) => fetchWarranties(page, pageSize, filters)}
                            onViewDetails={openDetails}
                        />
                    </div>
                </Card>
            </div>

            <WarrantyForm
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onSubmit={createWarranty}
                submitting={submitting}
                lookupSale={lookupSale}
            />

            <WarrantyDetails
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                warranty={details.warranty}
                loading={details.loading}
                updating={details.updating}
                notifying={details.notifying}
                preview={details.preview}
                previewLoading={details.previewLoading}
                enabledStatuses={settingsHook.settings?.enabled_statuses}
                onChangeStatus={details.changeStatus}
                onUpdateDetails={details.updateDetails}
                onAddAttachments={details.addAttachments}
                onRemoveAttachment={details.removeAttachment}
                onFetchPreview={details.fetchPreview}
                onSendNotification={details.sendNotification}
            />

            <WarrantySettings
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settingsHook.settings}
                loading={settingsHook.loading}
                saving={settingsHook.saving}
                onSave={settingsHook.saveSettings}
            />
        </div>
    );
};

export default WarrantyList;
