import React, { useMemo, useState } from "react";
import { Table, Button, Input, Select, Tag, Switch, Popconfirm, Card, Empty, Avatar } from "antd";
import { PlusOutlined, SearchOutlined, UserOutlined, TeamOutlined, LockOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const tableShellClass = "rounded-xl shadow-sm border border-[var(--ohnix-line-4)] overflow-hidden bg-[var(--ohnix-surface-card)]";

const MobileUserCard = ({ user, onAssignCompany, onToggleVerification, onViewTeam, onSetPassword, t }) => (
    <Card className="mb-4 module-shell overflow-hidden hover-lift" styles={{ body: { padding: 16 } }}>
        <div className="flex items-start gap-3">
            <Avatar size={44} icon={<UserOutlined />} className="flex-shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-[var(--ohnix-text-primary)]">{user.username}</div>
                        <div className="truncate text-xs text-[var(--ohnix-text-muted)]">{user.email}</div>
                    </div>
                    <Tag color={user.isVerified ? "green" : "red"}>
                        {user.isVerified ? t("admin.verified") : t("admin.unverified")}
                    </Tag>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--ohnix-text-muted)]">
                    <Tag color={user.role === "admin" ? "gold" : "blue"}>{user.role}</Tag>
                    <Tag>{t("admin.plan")} {user.subscription?.plan || "starter"}</Tag>
                    <Tag>{t("admin.company")} {user.company?.name || "-"}</Tag>
                </div>

                <div className="mt-3 flex items-center justify-between">
                    <Button type="text" className="!px-0 !text-[#44F3F0]" onClick={() => onAssignCompany(user)}>
                        {t("admin.assign_company_button")}
                    </Button>
                    <Popconfirm
                        title={user.isVerified ? t("admin.confirm_unverify_title") : t("admin.confirm_verify_title")}
                        description={user.isVerified ? t("admin.confirm_unverify_user") : t("admin.confirm_verify_user")}
                        onConfirm={() => onToggleVerification(user)}
                        okText={t("common.confirm")}
                        cancelText={t("common.cancel")}
                    >
                        <Switch checked={user.isVerified} />
                    </Popconfirm>
                </div>
                <div className="mt-2 flex items-center gap-3">
                    <Button type="text" size="small" className="!px-0 !text-[var(--ohnix-text-muted)]" icon={<TeamOutlined />} onClick={() => onViewTeam(user)}>
                        {t("admin.view_team")}
                    </Button>
                    <Button type="text" size="small" className="!px-0 !text-[var(--ohnix-text-muted)]" icon={<LockOutlined />} onClick={() => onSetPassword(user)}>
                        {t("admin.set_password")}
                    </Button>
                </div>
            </div>
        </div>
    </Card>
);

const UsersTab = ({ users, companies, loading, onAdd, onAssignCompany, onToggleVerification, onViewTeam, onSetPassword }) => {
    const { t } = useI18n();
    const [search, setSearch] = useState("");
    const [companyFilter, setCompanyFilter] = useState(null);

    const companyFilterOptions = useMemo(
        () => [
            { value: "unassigned", label: t("admin.company_filter_unassigned") },
            ...companies.map((company) => ({ value: company.id, label: company.name })),
        ],
        [companies, t]
    );

    const filteredUsers = useMemo(() => {
        let result = users;

        if (companyFilter === "unassigned") {
            result = result.filter((user) => !user.company);
        } else if (companyFilter) {
            result = result.filter((user) => user.company?.id === companyFilter);
        }

        if (search.trim()) {
            const needle = search.trim().toLowerCase();
            result = result.filter((user) =>
                [user.username, user.email].filter(Boolean).some((field) => field.toLowerCase().includes(needle))
            );
        }

        return result;
    }, [users, search, companyFilter]);

    const columns = [
        {
            title: t("common.username"),
            key: "user",
            render: (_, record) => (
                <div className="flex items-center gap-3">
                    <Avatar size={40} icon={<UserOutlined />} />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">{record.username}</div>
                        <div className="truncate text-xs text-[var(--ohnix-text-muted)]">{record.email}</div>
                    </div>
                </div>
            ),
        },
        {
            title: t("admin.company_field"),
            key: "company",
            responsive: ["md"],
            render: (_, record) => (
                <Button type="link" className="!px-0" onClick={() => onAssignCompany(record)}>
                    {record.company?.name || t("admin.company_filter_unassigned")}
                </Button>
            ),
        },
        {
            title: t("admin.role"),
            key: "role",
            width: 100,
            responsive: ["sm"],
            render: (_, record) => <Tag color={record.role === "admin" ? "gold" : "blue"}>{record.role}</Tag>,
        },
        {
            title: t("admin.plan"),
            key: "plan",
            width: 110,
            responsive: ["lg"],
            render: (_, record) => <Tag>{record.subscription?.plan || "starter"}</Tag>,
        },
        {
            title: t("admin.verified"),
            key: "verified",
            width: 170,
            render: (_, record) => (
                <div className="flex items-center gap-2">
                    <Tag color={record.isVerified ? "green" : "red"}>
                        {record.isVerified ? t("admin.verified") : t("admin.unverified")}
                    </Tag>
                    <Popconfirm
                        title={record.isVerified ? t("admin.confirm_unverify_title") : t("admin.confirm_verify_title")}
                        description={record.isVerified ? t("admin.confirm_unverify_user") : t("admin.confirm_verify_user")}
                        onConfirm={() => onToggleVerification(record)}
                        okText={t("common.confirm")}
                        cancelText={t("common.cancel")}
                    >
                        <Switch checked={record.isVerified} size="small" />
                    </Popconfirm>
                </div>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            width: 220,
            fixed: "right",
            render: (_, record) => (
                <div className="flex flex-wrap items-center gap-1">
                    <Button type="text" size="small" className="!text-[#44F3F0]" onClick={() => onAssignCompany(record)}>
                        {t("admin.assign_company_button")}
                    </Button>
                    <Button type="text" size="small" icon={<TeamOutlined />} title={t("admin.view_team")} onClick={() => onViewTeam(record)} />
                    <Button type="text" size="small" icon={<LockOutlined />} title={t("admin.set_password")} onClick={() => onSetPassword(record)} />
                </div>
            ),
        },
    ];

    return (
        <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                        placeholder={t("admin.search_users_placeholder")}
                        prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-sm"
                        size="large"
                        allowClear
                    />
                    <Select
                        placeholder={t("admin.company_filter_placeholder")}
                        value={companyFilter}
                        onChange={setCompanyFilter}
                        options={companyFilterOptions}
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        className="w-full sm:w-64"
                        size="large"
                    />
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={onAdd} size="large">
                    {t("admin.add_user")}
                </Button>
            </div>

            {/* Mobile */}
            <div className="block md:hidden">
                {loading ? (
                    [1, 2, 3].map((i) => <Card key={i} loading className="mb-4 module-shell" />)
                ) : filteredUsers.length === 0 ? (
                    <Empty description={t("admin.no_users")} />
                ) : (
                    filteredUsers.map((user) => (
                        <MobileUserCard
                            key={user.id}
                            user={user}
                            onAssignCompany={onAssignCompany}
                            onToggleVerification={onToggleVerification}
                            onViewTeam={onViewTeam}
                            onSetPassword={onSetPassword}
                            t={t}
                        />
                    ))
                )}
            </div>

            {/* Desktop */}
            <div className={`hidden md:block ${tableShellClass}`}>
                <Table
                    columns={columns}
                    dataSource={filteredUsers}
                    rowKey="id"
                    loading={loading}
                    locale={{ emptyText: t("admin.no_users") }}
                    scroll={{ x: 900 }}
                    className="custom-table module-dark-table"
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "25", "50"],
                        showTotal: (total) => t("admin.users_total", { count: total }),
                    }}
                />
            </div>
        </div>
    );
};

export default UsersTab;
