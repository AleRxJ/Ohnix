import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Form, Tabs } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { adminService } from "../services/adminService";
import PageHeader from "../components/common/PageHeader";
import {
    AdminStats,
    CompaniesTab,
    UsersTab,
    CompanyFormModal,
    UserFormModal,
    AssignCompanyModal,
} from "../components/admin";

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

    const isAdmin = user?.role === "admin";

    const companyOptions = useMemo(
        () => companies.map((company) => ({ value: company.id, label: company.name })),
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

    const openCompanyModal = (company = null) => {
        setEditingCompany(company);
        companyForm.resetFields();
        companyForm.setFieldsValue(company || { countryCode: "CO", electronicInvoicingEnabled: false });
        setCompanyModalOpen(true);
    };

    const closeCompanyModal = () => {
        setCompanyModalOpen(false);
        setEditingCompany(null);
        companyForm.resetFields();
    };

    const handleUploadCompanyLogo = async (companyId, file) => {
        try {
            const response = await adminService.updateCompanyLogo(companyId, file);
            toast.success(t("admin.logo_updated"));
            setEditingCompany((prev) =>
                prev && prev.id === companyId ? { ...prev, logoUrl: response?.data?.logoUrl } : prev
            );
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const handleSubmitCompany = async (values) => {
        try {
            setCompanySubmitting(true);
            if (editingCompany) {
                await adminService.updateCompany(editingCompany.id, values);
                toast.success(t("admin.company_updated"));
            } else {
                await adminService.createCompany(values);
                toast.success(t("admin.company_created"));
            }
            closeCompanyModal();
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setCompanySubmitting(false);
        }
    };

    const toggleCompanyStatus = async (company) => {
        try {
            await adminService.updateCompany(company.id, { isActive: !company.isActive });
            toast.success(
                company.isActive ? t("admin.company_deactivated") : t("admin.company_activated")
            );
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const closeUserModal = () => {
        setUserModalOpen(false);
        userForm.resetFields();
    };

    const handleCreateUser = async (values) => {
        try {
            setUserSubmitting(true);
            await adminService.createUser(values);
            toast.success(t("admin.user_created"));
            closeUserModal();
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setUserSubmitting(false);
        }
    };

    const toggleUserVerification = async (targetUser) => {
        try {
            await adminService.updateUser(targetUser.id, { isVerified: !targetUser.isVerified });
            toast.success(
                targetUser.isVerified ? t("admin.user_unverified") : t("admin.user_verified")
            );
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const openCompanyAssignment = (targetUser) => {
        setAssignmentUser(targetUser);
        assignmentForm.setFieldsValue({ companyId: targetUser.company?.id || undefined });
    };

    const closeAssignmentModal = () => {
        setAssignmentUser(null);
        assignmentForm.resetFields();
    };

    const assignCompanyToUser = async ({ companyId }) => {
        try {
            setAssignmentSubmitting(true);
            await adminService.updateUser(assignmentUser.id, { companyId: companyId || null });
            toast.success(t("admin.company_assigned"));
            closeAssignmentModal();
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
                <Alert type="warning" showIcon message={t("admin.only_admin")} />
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-white">
            <PageHeader title={t("admin.title")} subtitle={t("admin.description")} icon={<SettingOutlined />} />

            <AdminStats companies={companies} users={users} />

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <Tabs
                    defaultActiveKey="companies"
                    className="admin-tabs"
                    items={[
                        {
                            key: "companies",
                            label: t("admin.companies"),
                            children: (
                                <CompaniesTab
                                    companies={companies}
                                    loading={loading}
                                    onAdd={() => openCompanyModal()}
                                    onEdit={openCompanyModal}
                                    onToggleStatus={toggleCompanyStatus}
                                />
                            ),
                        },
                        {
                            key: "users",
                            label: t("admin.users"),
                            children: (
                                <UsersTab
                                    users={users}
                                    companies={companies}
                                    loading={loading}
                                    onAdd={() => setUserModalOpen(true)}
                                    onAssignCompany={openCompanyAssignment}
                                    onToggleVerification={toggleUserVerification}
                                />
                            ),
                        },
                    ]}
                />
            </div>

            <CompanyFormModal
                open={companyModalOpen}
                onCancel={closeCompanyModal}
                onSubmit={handleSubmitCompany}
                submitting={companySubmitting}
                form={companyForm}
                editingCompany={editingCompany}
                onUploadLogo={handleUploadCompanyLogo}
            />

            <UserFormModal
                open={userModalOpen}
                onCancel={closeUserModal}
                onSubmit={handleCreateUser}
                submitting={userSubmitting}
                form={userForm}
                companyOptions={companyOptions}
            />

            <AssignCompanyModal
                user={assignmentUser}
                onCancel={closeAssignmentModal}
                onSubmit={assignCompanyToUser}
                submitting={assignmentSubmitting}
                form={assignmentForm}
                companyOptions={companyOptions}
            />
        </div>
    );
};

export default AdminManagement;
