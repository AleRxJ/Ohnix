import { useState } from "react";
import { Layout, Input, Select, Button, DatePicker, Card, Row, Col, Tooltip } from "antd";
import { PlusOutlined, SettingOutlined, SearchOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { useWarranties } from "../../hooks/warranties/useWarranties";
import { useWarrantyDetails } from "../../hooks/warranties/useWarrantyDetails";
import { useWarrantySettings } from "../../hooks/warranties/useWarrantySettings";
import SectionGuide from "../common/SectionGuide";
import WarrantyStats from "./WarrantyStats";
import WarrantyTable from "./WarrantyTable";
import WarrantyForm from "./WarrantyForm";
import WarrantyDetails from "./WarrantyDetails";
import WarrantySettings from "./WarrantySettings";

const { Content } = Layout;

const VIEW_OPTIONS = ["open", "overdue", "due_soon", "closed"];

// Same page shell as ProductionOrders.jsx (Layout/Content, max-w-7xl
// container, SectionGuide right under the header, module-shell cards) so
// Garantías reads as another native Ohnix module instead of a bolted-on one.
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

    const registerButton = (
        <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
            <Button
                type="primary"
                icon={<PlusOutlined />}
                size="large"
                disabled={!canEdit}
                onClick={() => setCreateOpen(true)}
                className="w-full sm:w-auto rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
            >
                {t("warranties.register_warranty")}
            </Button>
        </Tooltip>
    );

    return (
        <Layout className="bg-transparent">
            <Content className="p-2 sm:p-4 lg:p-6 bg-transparent text-[var(--ohnix-text-primary)]">
                <div className="max-w-full lg:max-w-7xl mx-auto">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="truncate mb-1 text-3xl sm:text-4xl font-bold flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                                {t("warranties.title")}
                                <SafetyCertificateOutlined className="text-[#44F3F0] inline-block ml-2" />
                            </h1>
                            <p className="text-[var(--ohnix-text-muted)] text-base md:text-sm hidden sm:block">
                                {t("warranties.page_subtitle")}
                            </p>
                        </div>
                        <div className="flex-shrink-0 flex flex-col sm:flex-row gap-2">
                            {canAdmin && (
                                <Button size="large" icon={<SettingOutlined />} onClick={openSettings} className="w-full sm:w-auto rounded-md">
                                    {t("warranties.settings_title")}
                                </Button>
                            )}
                            {registerButton}
                        </div>
                    </div>

                    <SectionGuide
                        storageKey="ohnix:warranties-guide"
                        title={t("warranties.guide_title")}
                        summary={t("warranties.guide_summary")}
                        steps={[t("warranties.guide_step_1"), t("warranties.guide_step_2"), t("warranties.guide_step_3")]}
                        result={t("warranties.guide_result")}
                        concepts={[
                            { label: t("warranties.concept_coverage"), help: t("warranties.concept_coverage_help") },
                            { label: t("warranties.concept_enabled_statuses"), help: t("warranties.concept_enabled_statuses_help") },
                            { label: t("warranties.concept_auto_notify"), help: t("warranties.concept_auto_notify_help") },
                            { label: t("warranties.concept_variables"), help: t("warranties.concept_variables_help") },
                        ]}
                    />

                    <div className="mb-4 sm:mb-6">
                        <WarrantyStats dashboard={dashboard} loading={dashboardLoading} />
                    </div>

                    <Card className="mb-4 sm:mb-6 module-shell rounded-3xl border border-[var(--ohnix-line-4)]">
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

                    <Card className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] overflow-hidden">
                        <WarrantyTable
                            warranties={warranties}
                            loading={loading}
                            pagination={pagination}
                            onChangePage={(page, pageSize) => fetchWarranties(page, pageSize, filters)}
                            onViewDetails={openDetails}
                            emptyAction={canEdit ? registerButton : null}
                        />
                    </Card>
                </div>
            </Content>

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
        </Layout>
    );
};

export default WarrantyList;
