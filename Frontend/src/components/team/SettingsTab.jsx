import React, { useContext, useEffect, useState } from "react";
import { Input, Button, Select, Popconfirm, Card, Typography, ColorPicker, Upload, Tooltip } from "antd";
import { SaveOutlined, SwapOutlined, UploadOutlined, LockOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { teamService } from "../../services/teamService";
import { companyService } from "../../services/companyService";

const { Text, Title } = Typography;

const SettingsTab = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { team, isOwner, refreshTeam } = useTeam();
    const [name, setName] = useState(team?.name || "");
    const [savingName, setSavingName] = useState(false);
    const [newOwnerId, setNewOwnerId] = useState(null);
    const [transferring, setTransferring] = useState(false);
    const [members, setMembers] = useState([]);

    const [company, setCompany] = useState(null);
    const [companyMeta, setCompanyMeta] = useState({ canUploadLogo: false, canCustomizeBranding: false });
    const [companyForm, setCompanyForm] = useState({
        name: "",
        legalName: "",
        contactEmail: "",
        phone: "",
        pdfFooterText: "",
        pdfAccentColor: "",
    });
    const [companyLoading, setCompanyLoading] = useState(true);
    const [savingCompany, setSavingCompany] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    useEffect(() => {
        setName(team?.name || "");
    }, [team?.name]);

    useEffect(() => {
        if (!team || !isOwner) return;
        teamService.getMembers(team.id).then((res) => setMembers(res?.data || [])).catch(() => {});
    }, [team, isOwner]);

    useEffect(() => {
        if (!isOwner) return;
        companyService
            .getMyCompany()
            .then((res) => {
                const data = res?.data || {};
                setCompany(data.company || null);
                setCompanyMeta({
                    canUploadLogo: Boolean(data.canUploadLogo),
                    canCustomizeBranding: Boolean(data.canCustomizeBranding),
                });
                setCompanyForm({
                    name: data.company?.name || "",
                    legalName: data.company?.legalName || "",
                    contactEmail: data.company?.contactEmail || "",
                    phone: data.company?.phone || "",
                    pdfFooterText: data.company?.pdfFooterText || "",
                    pdfAccentColor: data.company?.pdfAccentColor || "",
                });
            })
            .catch((err) => toast.error(err?.response?.data?.message || t("common.error")))
            .finally(() => setCompanyLoading(false));
    }, [isOwner]);

    if (!isOwner) {
        return (
            <Card className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-primary)]">
                <Text className="text-[var(--ohnix-text-muted)]">{t("team.owner_only_action")}</Text>
            </Card>
        );
    }

    const handleRename = async () => {
        if (!name.trim() || name.trim() === team?.name) return;
        setSavingName(true);
        try {
            await teamService.updateTeam(team.id, { name: name.trim() });
            toast.success(t("team.team_renamed"));
            refreshTeam();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setSavingName(false);
        }
    };

    const handleTransfer = async () => {
        if (!newOwnerId) return;
        setTransferring(true);
        try {
            await teamService.updateTeam(team.id, { newOwnerUserId: newOwnerId });
            toast.success(t("team.ownership_transferred"));
            setNewOwnerId(null);
            refreshTeam();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setTransferring(false);
        }
    };

    const handleCompanyFieldChange = (field) => (e) => {
        setCompanyForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const handleSaveCompany = async () => {
        if (!companyForm.name.trim()) {
            toast.error(t("team.company_name_label"));
            return;
        }
        setSavingCompany(true);
        try {
            const payload = {
                name: companyForm.name.trim(),
                legalName: companyForm.legalName,
                contactEmail: companyForm.contactEmail,
                phone: companyForm.phone,
            };
            if (companyMeta.canCustomizeBranding) {
                payload.pdfFooterText = companyForm.pdfFooterText;
                payload.pdfAccentColor = companyForm.pdfAccentColor;
            }
            const res = await companyService.updateMyCompany(payload);
            setCompany(res?.data || null);
            toast.success(t("team.company_saved"));
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setSavingCompany(false);
        }
    };

    const handleUploadLogo = async (file) => {
        setUploadingLogo(true);
        try {
            const res = await companyService.updateMyCompanyLogo(file);
            setCompany((prev) => ({ ...(prev || {}), ...(res?.data || {}) }));
            toast.success(t("team.company_logo_saved"));
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setUploadingLogo(false);
        }
        return false;
    };

    const otherMembers = (members || []).filter((m) => !m.isOwner && m.userId !== user?.id);

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-primary)]">
                <Title level={5} className="text-[var(--ohnix-text-primary)] m-0 mb-3">
                    {t("team.rename_label")}
                </Title>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                        size="large"
                        className="auth-ohnix-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={80}
                    />
                    <Button
                        type="primary"
                        size="large"
                        icon={<SaveOutlined />}
                        loading={savingName}
                        disabled={!name.trim() || name.trim() === team?.name}
                        onClick={handleRename}
                    >
                        {t("team.rename_cta")}
                    </Button>
                </div>
            </Card>

            <Card className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-primary)]" loading={companyLoading}>
                <Title level={5} className="text-[var(--ohnix-text-primary)] m-0 mb-1">
                    {t("team.company_branding_title")}
                </Title>
                <Text className="text-[var(--ohnix-text-muted)] text-xs">{t("team.company_branding_hint")}</Text>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <Text className="text-[var(--ohnix-text-muted)] text-xs block mb-1">{t("team.company_name_label")}</Text>
                        <Input
                            size="large"
                            className="auth-ohnix-input"
                            value={companyForm.name}
                            onChange={handleCompanyFieldChange("name")}
                            maxLength={120}
                        />
                    </div>
                    <div>
                        <Text className="text-[var(--ohnix-text-muted)] text-xs block mb-1">{t("team.company_legal_name_label")}</Text>
                        <Input
                            size="large"
                            className="auth-ohnix-input"
                            value={companyForm.legalName}
                            onChange={handleCompanyFieldChange("legalName")}
                            maxLength={160}
                        />
                    </div>
                    <div>
                        <Text className="text-[var(--ohnix-text-muted)] text-xs block mb-1">{t("team.company_contact_email_label")}</Text>
                        <Input
                            size="large"
                            className="auth-ohnix-input"
                            value={companyForm.contactEmail}
                            onChange={handleCompanyFieldChange("contactEmail")}
                            maxLength={160}
                        />
                    </div>
                    <div>
                        <Text className="text-[var(--ohnix-text-muted)] text-xs block mb-1">{t("team.company_phone_label")}</Text>
                        <Input
                            size="large"
                            className="auth-ohnix-input"
                            value={companyForm.phone}
                            onChange={handleCompanyFieldChange("phone")}
                            maxLength={40}
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <Text className="text-[var(--ohnix-text-muted)] text-xs block mb-2">{t("team.company_logo_label")}</Text>
                    <div className="flex items-center gap-3">
                        {company?.logoUrl && (
                            <img
                                src={company.logoUrl}
                                alt="logo"
                                className="h-12 w-12 rounded-lg border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] object-contain"
                            />
                        )}
                        {companyMeta.canUploadLogo ? (
                            <Upload accept="image/*" showUploadList={false} beforeUpload={handleUploadLogo}>
                                <Button icon={<UploadOutlined />} loading={uploadingLogo}>
                                    {t("team.upload_logo")}
                                </Button>
                            </Upload>
                        ) : (
                            <Tooltip title={t("team.company_branding_locked_logo")}>
                                <span>
                                    <Button icon={<LockOutlined />} disabled>
                                        {t("team.upload_logo")}
                                    </Button>
                                </span>
                            </Tooltip>
                        )}
                    </div>
                </div>

                <div className="mt-4">
                    <Text className="text-[var(--ohnix-text-muted)] text-xs block mb-1">{t("team.company_footer_text_label")}</Text>
                    <Text className="text-[var(--ohnix-text-dim)] text-xs block mb-2">{t("team.company_footer_text_hint")}</Text>
                    {companyMeta.canCustomizeBranding ? (
                        <Input.TextArea
                            rows={2}
                            className="auth-ohnix-input"
                            placeholder={t("team.company_footer_text_placeholder")}
                            value={companyForm.pdfFooterText}
                            onChange={handleCompanyFieldChange("pdfFooterText")}
                            maxLength={300}
                        />
                    ) : (
                        <Tooltip title={t("team.company_branding_locked_custom")}>
                            <span>
                                <Input.TextArea rows={2} disabled placeholder={t("team.company_branding_locked_custom")} />
                            </span>
                        </Tooltip>
                    )}
                </div>

                <div className="mt-4">
                    <Text className="text-[var(--ohnix-text-muted)] text-xs block mb-1">{t("team.company_accent_color_label")}</Text>
                    <Text className="text-[var(--ohnix-text-dim)] text-xs block mb-2">{t("team.company_accent_color_hint")}</Text>
                    {companyMeta.canCustomizeBranding ? (
                        <ColorPicker
                            format="hex"
                            showText
                            value={companyForm.pdfAccentColor || "#29D8D5"}
                            onChange={(_, hex) => setCompanyForm((prev) => ({ ...prev, pdfAccentColor: hex }))}
                        />
                    ) : (
                        <Tooltip title={t("team.company_branding_locked_custom")}>
                            <span>
                                <Button icon={<LockOutlined />} disabled>
                                    {t("team.company_accent_color_label")}
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                </div>

                <div className="mt-5">
                    <Button
                        type="primary"
                        size="large"
                        icon={<SaveOutlined />}
                        loading={savingCompany}
                        disabled={!companyForm.name.trim()}
                        onClick={handleSaveCompany}
                    >
                        {t("team.save_company")}
                    </Button>
                </div>
            </Card>

            <Card className="rounded-2xl border border-amber-500/20 bg-amber-500/5 text-[var(--ohnix-text-primary)]">
                <Title level={5} className="text-[var(--ohnix-text-primary)] m-0 mb-1">
                    {t("team.transfer_ownership_title")}
                </Title>
                <Text className="text-[var(--ohnix-text-muted)] text-sm">{t("team.transfer_ownership_description")}</Text>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <Select
                        size="large"
                        className="flex-1"
                        placeholder={t("team.transfer_ownership_select_placeholder")}
                        value={newOwnerId}
                        onChange={setNewOwnerId}
                        options={otherMembers.map((m) => ({ value: m.userId, label: `${m.username} (${m.email})` }))}
                        disabled={otherMembers.length === 0}
                    />
                    <Popconfirm
                        title={t("team.transfer_ownership_confirm_title")}
                        description={t("team.transfer_ownership_confirm_content")}
                        okText={t("common.yes")}
                        cancelText={t("common.no")}
                        onConfirm={handleTransfer}
                        disabled={!newOwnerId}
                    >
                        <Button danger size="large" icon={<SwapOutlined />} loading={transferring} disabled={!newOwnerId}>
                            {t("team.transfer_ownership_cta")}
                        </Button>
                    </Popconfirm>
                </div>
            </Card>
        </div>
    );
};

export default SettingsTab;
