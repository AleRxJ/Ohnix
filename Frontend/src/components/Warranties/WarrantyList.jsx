import { useState } from "react";
import { Input, Select, Button, Space, DatePicker } from "antd";
import { PlusOutlined, SettingOutlined, SearchOutlined } from "@ant-design/icons";
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
        <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h1 className="text-xl font-semibold text-[var(--ohnix-text-primary)] m-0">{t("warranties.title")}</h1>
                <Space>
                    {canAdmin && (
                        <Button icon={<SettingOutlined />} onClick={openSettings}>
                            {t("warranties.settings_title")}
                        </Button>
                    )}
                    {canEdit && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                            {t("warranties.register_warranty")}
                        </Button>
                    )}
                </Space>
            </div>

            <WarrantyStats dashboard={dashboard} loading={dashboardLoading} />

            <Space wrap className="mb-4">
                <Input.Search
                    placeholder={t("warranties.search_placeholder")}
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onSearch={(value) => setFilters((prev) => ({ ...prev, search: value || undefined }))}
                    style={{ width: 260 }}
                    allowClear
                />
                <Select
                    placeholder={t("warranties.filter_view")}
                    allowClear
                    style={{ width: 180 }}
                    options={VIEW_OPTIONS.map((v) => ({ value: v, label: t(`warranties.view_${v}`) }))}
                    onChange={(value) => setFilters((prev) => ({ ...prev, view: value }))}
                />
                <DatePicker.RangePicker
                    onChange={(range) =>
                        setFilters((prev) => ({
                            ...prev,
                            date_from: range?.[0]?.toISOString(),
                            date_to: range?.[1]?.toISOString(),
                        }))
                    }
                />
            </Space>

            <WarrantyTable
                warranties={warranties}
                loading={loading}
                pagination={pagination}
                onChangePage={(page, pageSize) => fetchWarranties(page, pageSize, filters)}
                onViewDetails={openDetails}
            />

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
