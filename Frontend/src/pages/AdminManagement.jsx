import React, { useContext, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Button,
    Form,
    Input,
    List,
    Modal,
    Select,
    Switch,
    Tabs,
    Tag,
    Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { adminService } from "../services/adminService";

const { Title, Text } = Typography;

const AdminManagement = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();

    const [loading, setLoading] = useState(true);
    const [companies, setCompanies] = useState([]);
    const [users, setUsers] = useState([]);

    const [companyModalOpen, setCompanyModalOpen] = useState(false);
    const [companySubmitting, setCompanySubmitting] = useState(false);
    const [editingCompany, setEditingCompany] = useState(null);
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [userSubmitting, setUserSubmitting] = useState(false);
    const [assignmentUser, setAssignmentUser] = useState(null);
    const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);

    const [companyForm] = Form.useForm();
    const [userForm] = Form.useForm();
    const [assignmentForm] = Form.useForm();
    const selectedCompanyCountry = Form.useWatch("countryCode", companyForm);

    const isAdmin = user?.role === "admin";

    const companyOptions = useMemo(
        () =>
            companies.map((company) => ({
                value: company.id,
                label: company.name,
            })),
        [companies]
    );

    const fetchData = async () => {
        const [companiesResponse, usersResponse] = await Promise.all([
            adminService.listCompanies(),
            adminService.listUsers(),
        ]);

        setCompanies(companiesResponse?.data || []);
        setUsers(usersResponse?.data || []);
    };

    useEffect(() => {
        const run = async () => {
            if (!isAdmin) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                await fetchData();
            } catch (error) {
                toast.error(error.response?.data?.message || t("common.error"));
            } finally {
                setLoading(false);
            }
        };

        run();
    }, [isAdmin, t]);

    const handleCreateCompany = async (values) => {
        try {
            setCompanySubmitting(true);
            if (editingCompany) {
                await adminService.updateCompany(editingCompany.id, values);
                toast.success(t("admin.company_updated"));
            } else {
                await adminService.createCompany(values);
                toast.success(t("admin.company_created"));
            }
            setCompanyModalOpen(false);
            setEditingCompany(null);
            companyForm.resetFields();
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setCompanySubmitting(false);
        }
    };

    const openCompanyModal = (company = null) => {
        setEditingCompany(company);
        companyForm.resetFields();
        companyForm.setFieldsValue(company || { countryCode: "CO", electronicInvoicingEnabled: false });
        setCompanyModalOpen(true);
    };

    const handleCreateUser = async (values) => {
        try {
            setUserSubmitting(true);
            await adminService.createUser(values);
            toast.success(t("admin.user_created"));
            setUserModalOpen(false);
            userForm.resetFields();
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setUserSubmitting(false);
        }
    };

    const toggleCompanyStatus = async (company) => {
        try {
            await adminService.updateCompany(company.id, {
                isActive: !company.isActive,
            });
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const toggleUserVerification = async (targetUser) => {
        try {
            await adminService.updateUser(targetUser.id, {
                isVerified: !targetUser.isVerified,
            });
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const openCompanyAssignment = (targetUser) => {
        setAssignmentUser(targetUser);
        assignmentForm.setFieldsValue({ companyId: targetUser.company?.id || undefined });
    };

    const assignCompanyToUser = async ({ companyId }) => {
        try {
            setAssignmentSubmitting(true);
            await adminService.updateUser(assignmentUser.id, { companyId: companyId || null });
            toast.success(t("admin.company_assigned"));
            setAssignmentUser(null);
            assignmentForm.resetFields();
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setAssignmentSubmitting(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert
                    type="warning"
                    showIcon
                    message={t("admin.only_admin")}
                />
            </div>
        );
    }

    return (
        <div className="p-5 sm:p-6 lg:p-8 text-white">
            <div className="mb-6">
                <Title level={2} className="!text-white !mb-1">
                    {t("admin.title")}
                </Title>
                <Text className="text-[#A9B3B8]">{t("admin.description")}</Text>
            </div>

            <Tabs
                defaultActiveKey="companies"
                className="admin-tabs"
                items={[
                    {
                        key: "companies",
                        label: t("admin.companies"),
                        children: (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <Text className="text-[#A9B3B8]">
                                        {t("admin.companies_description")}
                                    </Text>
                                    <Button
                                        icon={<PlusOutlined />}
                                        onClick={() => openCompanyModal()}
                                        className="rounded-xl border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0]"
                                    >
                                        {t("admin.add_company")}
                                    </Button>
                                </div>

                                <List
                                    loading={loading}
                                    dataSource={companies}
                                    locale={{ emptyText: t("admin.no_companies") }}
                                    renderItem={(company) => (
                                        <List.Item className="!border-white/10">
                                            <div className="flex w-full items-center justify-between gap-3">
                                                <div>
                                                    <Text className="text-white">{company.name}</Text>
                                                    <div className="text-xs text-[#A9B3B8]">
                                                        {company.legalName || "-"} | {company.contactEmail || "-"}
                                                    </div>
                                                    <div className="text-xs text-[#A9B3B8]">
                                                        {t("admin.country_label")} {company.countryCode || "-"}
                                                    </div>
                                                    {company.countryCode === "CO" && (
                                                        <div className="mt-1">
                                                            <Tag color={company.electronicInvoicingEnabled ? "cyan" : "default"}>
                                                                {company.electronicInvoicingEnabled ? t("admin.dian_enabled") : t("admin.dian_disabled")}
                                                            </Tag>
                                                        </div>
                                                    )}
                                                    <div className="text-xs text-[#A9B3B8]">
                                                        {t("admin.users_count")} {company._count?.users || 0}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Button type="text" className="!text-[#44F3F0]" onClick={() => openCompanyModal(company)}>
                                                        {t("admin.configure")}
                                                    </Button>
                                                    <Tag color={company.isActive ? "green" : "default"}>
                                                        {company.isActive
                                                            ? t("admin.active")
                                                            : t("admin.inactive")}
                                                    </Tag>
                                                    <Switch
                                                        checked={company.isActive}
                                                        onChange={() => toggleCompanyStatus(company)}
                                                    />
                                                </div>
                                            </div>
                                        </List.Item>
                                    )}
                                />
                            </div>
                        ),
                    },
                    {
                        key: "users",
                        label: t("admin.users"),
                        children: (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <Text className="text-[#A9B3B8]">
                                        {t("admin.users_description")}
                                    </Text>
                                    <Button
                                        icon={<PlusOutlined />}
                                        onClick={() => setUserModalOpen(true)}
                                        className="rounded-xl border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0]"
                                    >
                                        {t("admin.add_user")}
                                    </Button>
                                </div>

                                <List
                                    loading={loading}
                                    dataSource={users}
                                    locale={{ emptyText: t("admin.no_users") }}
                                    renderItem={(item) => (
                                        <List.Item className="!border-white/10">
                                            <div className="flex w-full items-center justify-between gap-3">
                                                <div>
                                                    <Text className="text-white">{item.username}</Text>
                                                    <div className="text-xs text-[#A9B3B8]">{item.email}</div>
                                                    <div className="text-xs text-[#A9B3B8]">
                                                        {t("admin.company")} {item.company?.name || "-"}
                                                    </div>
                                                    <div className="text-xs text-[#A9B3B8]">
                                                        {t("admin.plan")} {item.subscription?.plan || "starter"}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button type="text" className="!text-[#44F3F0]" onClick={() => openCompanyAssignment(item)}>
                                                        {t("admin.assign_company_button")}
                                                    </Button>
                                                    <Tag color={item.role === "admin" ? "gold" : "blue"}>
                                                        {item.role}
                                                    </Tag>
                                                    <Tag color={item.isVerified ? "green" : "red"}>
                                                        {item.isVerified
                                                            ? t("admin.verified")
                                                            : t("admin.unverified")}
                                                    </Tag>
                                                    <Switch
                                                        checked={item.isVerified}
                                                        onChange={() => toggleUserVerification(item)}
                                                    />
                                                </div>
                                            </div>
                                        </List.Item>
                                    )}
                                />
                            </div>
                        ),
                    },
                ]}
            />

            <Modal
                title={editingCompany ? t("admin.configure_company") : t("admin.add_company")}
                open={companyModalOpen}
                onCancel={() => { setCompanyModalOpen(false); setEditingCompany(null); companyForm.resetFields(); }}
                onOk={() => companyForm.submit()}
                confirmLoading={companySubmitting}
                okText={t("common.save")}
                cancelText={t("common.cancel")}
                destroyOnClose
                width={640}
                styles={{
                    content: { background: "linear-gradient(145deg, #111b20 0%, #090a0c 58%, #111027 100%)", border: "1px solid rgba(41,216,213,0.22)", borderRadius: 24, boxShadow: "0 28px 80px rgba(0,0,0,.62)" },
                    header: { background: "transparent", borderBottom: "1px solid rgba(255,255,255,.08)", padding: "22px 24px" },
                    body: { padding: 24 },
                }}
            >
                <Form form={companyForm} layout="vertical" onFinish={handleCreateCompany}>
                    <Form.Item
                        name="name"
                        label={t("admin.company_name")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item name="legalName" label={t("admin.company_legal_name")}>
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="countryCode"
                        label={t("admin.country_iso_label")}
                        initialValue="CO"
                        rules={[
                            {
                                pattern: /^[A-Za-z]{2}$/,
                                message: t("admin.country_iso_hint"),
                            },
                        ]}
                    >
                        <Select
                            showSearch
                            options={[
                                { value: "CO", label: "CO - Colombia" },
                                { value: "ES", label: "ES - Espana" },
                            ]}
                            filterOption={(input, option) =>
                                `${option?.label || ""}`
                                    .toLowerCase()
                                    .includes(input.toLowerCase())
                            }
                        />
                    </Form.Item>
                    <Form.Item name="contactEmail" label={t("admin.company_contact_email")}>
                        <Input type="email" />
                    </Form.Item>
                    <Form.Item name="phone" label={t("admin.company_phone")}>
                        <Input />
                    </Form.Item>
                    {selectedCompanyCountry === "CO" && (
                        <div className="relative overflow-hidden rounded-2xl border border-[#29D8D5]/25 bg-[radial-gradient(circle_at_90%_10%,rgba(41,216,213,.20),transparent_35%),linear-gradient(135deg,rgba(16,39,43,.9),rgba(14,12,31,.88))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.07)]">
                            <div className="absolute right-[-22px] top-[-25px] h-24 w-24 rounded-full border border-[#44F3F0]/20" />
                            <div className="relative mb-1 flex items-center gap-2 text-sm font-bold text-white"><span className="h-2 w-2 rounded-full bg-[#44F3F0] shadow-[0_0_14px_#44F3F0]" />{t("admin.dian_section_title")}</div>
                            <p className="relative mb-4 text-xs text-[#A9B3B8]">
                                {t("admin.dian_section_hint")}
                            </p>
                            <Form.Item name="electronicInvoicingEnabled" valuePropName="checked" initialValue={false}>
                                <Switch checkedChildren={t("admin.dian_toggle_active")} unCheckedChildren={t("admin.dian_toggle_inactive")} />
                            </Form.Item>
                            <Form.Item
                                name="factusNumberingRangeId"
                                label={t("admin.dian_numbering_range_id")}
                            >
                                <Input placeholder={t("admin.dian_numbering_range_placeholder")} />
                            </Form.Item>
                            <div className="grid grid-cols-2 gap-3">
                                <Form.Item name="factusDocumentType" label={t("admin.dian_document_type")} initialValue="01">
                                    <Select options={[{ value: "01", label: t("admin.dian_doc_invoice") }]} />
                                </Form.Item>
                                <Form.Item name="factusOperationType" label={t("admin.dian_operation_type")} initialValue="10">
                                    <Select options={[{ value: "10", label: t("admin.dian_operation_standard") }, { value: "11", label: t("admin.dian_operation_mandate") }]} />
                                </Form.Item>
                                <Form.Item name="factusPaymentForm" label={t("admin.dian_payment_form")} initialValue="1">
                                    <Select options={[{ value: "1", label: t("admin.dian_payment_cash") }, { value: "2", label: t("admin.dian_payment_credit") }]} />
                                </Form.Item>
                                <Form.Item name="factusPaymentMethodCode" label={t("admin.dian_payment_method")} initialValue="42">
                                    <Input placeholder="42" />
                                </Form.Item>
                            </div>
                        </div>
                    )}
                </Form>
            </Modal>

            <Modal
                title={t("admin.add_user")}
                open={userModalOpen}
                onCancel={() => setUserModalOpen(false)}
                onOk={() => userForm.submit()}
                confirmLoading={userSubmitting}
                okText={t("common.save")}
                cancelText={t("common.cancel")}
                destroyOnClose
            >
                <Form form={userForm} layout="vertical" onFinish={handleCreateUser}>
                    <Form.Item
                        name="username"
                        label={t("common.username")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label={t("common.email")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input type="email" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label={t("common.password")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input.Password />
                    </Form.Item>
                    <Form.Item name="role" label={t("admin.role")} initialValue="user">
                        <Select
                            options={[
                                { value: "user", label: "user" },
                                { value: "admin", label: "admin" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="companyId" label={t("admin.company")}>
                        <Select allowClear options={companyOptions} />
                    </Form.Item>
                    <Form.Item name="plan" label={t("admin.plan")} initialValue="starter">
                        <Select
                            options={[
                                { value: "starter", label: "starter" },
                                { value: "growth", label: "growth" },
                                { value: "enterprise", label: "enterprise" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item
                        name="preferredLanguage"
                        label={t("admin.preferred_language")}
                        initialValue="es"
                    >
                        <Select
                            options={[
                                { value: "es", label: "Español" },
                                { value: "en", label: "English" },
                            ]}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={t("admin.assign_company_title", { username: assignmentUser?.username || t("admin.assign_company_default_user") })}
                open={Boolean(assignmentUser)}
                onCancel={() => { setAssignmentUser(null); assignmentForm.resetFields(); }}
                onOk={() => assignmentForm.submit()}
                confirmLoading={assignmentSubmitting}
                okText={t("admin.assign_company_save")}
                destroyOnClose
            >
                <p className="mb-4 text-sm text-[#A9B3B8]">
                    {t("admin.assign_company_hint")}
                </p>
                <Form form={assignmentForm} layout="vertical" onFinish={assignCompanyToUser}>
                    <Form.Item name="companyId" label={t("admin.company_field")}>
                        <Select allowClear placeholder={t("admin.assign_company_placeholder")} options={companyOptions} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default AdminManagement;
