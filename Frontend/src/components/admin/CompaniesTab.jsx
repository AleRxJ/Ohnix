import React, { useMemo, useState } from "react";
import { Table, Button, Input, Tag, Switch, Popconfirm, Card, Empty } from "antd";
import { PlusOutlined, SearchOutlined, BankOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const tableShellClass = "rounded-xl shadow-sm border border-[var(--ohnix-line-4)] overflow-hidden bg-[var(--ohnix-surface-card)]";

const MobileCompanyCard = ({ company, onEdit, onToggleStatus, t }) => (
    <Card className="mb-4 module-shell overflow-hidden hover-lift" styles={{ body: { padding: 16 } }}>
        <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/25 bg-[#29D8D5]/10 text-[#44F3F0]">
                <BankOutlined />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-[var(--ohnix-text-primary)]">{company.name}</div>
                        <div className="truncate text-xs text-[var(--ohnix-text-muted)]">
                            {company.legalName || "-"} · {company.contactEmail || "-"}
                        </div>
                    </div>
                    <Tag color={company.isActive ? "green" : "default"}>
                        {company.isActive ? t("admin.active") : t("admin.inactive")}
                    </Tag>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--ohnix-text-muted)]">
                    <Tag>{t("admin.country_label")} {company.countryCode || "-"}</Tag>
                    {company.countryCode === "CO" && (
                        <Tag color={company.electronicInvoicingEnabled ? "cyan" : "default"}>
                            {company.electronicInvoicingEnabled ? t("admin.dian_enabled") : t("admin.dian_disabled")}
                        </Tag>
                    )}
                    <Tag>{t("admin.users_count")} {company._count?.users || 0}</Tag>
                </div>

                <div className="mt-3 flex items-center justify-between">
                    <Button type="text" className="!px-0 !text-[#44F3F0]" onClick={() => onEdit(company)}>
                        {t("admin.configure")}
                    </Button>
                    <Popconfirm
                        title={company.isActive ? t("admin.confirm_deactivate_title") : t("admin.confirm_activate_title")}
                        description={company.isActive ? t("admin.confirm_deactivate_company") : t("admin.confirm_activate_company")}
                        onConfirm={() => onToggleStatus(company)}
                        okText={t("common.confirm")}
                        cancelText={t("common.cancel")}
                    >
                        <Switch checked={company.isActive} />
                    </Popconfirm>
                </div>
            </div>
        </div>
    </Card>
);

const CompaniesTab = ({ companies, loading, onAdd, onEdit, onToggleStatus }) => {
    const { t } = useI18n();
    const [search, setSearch] = useState("");

    const filteredCompanies = useMemo(() => {
        if (!search.trim()) return companies;
        const needle = search.trim().toLowerCase();
        return companies.filter((company) =>
            [company.name, company.legalName, company.contactEmail]
                .filter(Boolean)
                .some((field) => field.toLowerCase().includes(needle))
        );
    }, [companies, search]);

    const columns = [
        {
            title: t("admin.company_field"),
            key: "company",
            render: (_, record) => (
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[#29D8D5]/25 bg-[#29D8D5]/10 text-[#44F3F0]">
                        <BankOutlined />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">{record.name}</div>
                        <div className="truncate text-xs text-[var(--ohnix-text-muted)]">
                            {record.legalName || "-"} · {record.contactEmail || "-"}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            title: t("admin.country_iso_label"),
            key: "country",
            width: 100,
            responsive: ["sm"],
            render: (_, record) => <Tag>{record.countryCode || "-"}</Tag>,
        },
        {
            title: t("admin.dian_section_title"),
            key: "dian",
            width: 200,
            responsive: ["lg"],
            render: (_, record) =>
                record.countryCode === "CO" ? (
                    <Tag color={record.electronicInvoicingEnabled ? "cyan" : "default"}>
                        {record.electronicInvoicingEnabled ? t("admin.dian_enabled") : t("admin.dian_disabled")}
                    </Tag>
                ) : (
                    <span className="text-xs text-[var(--ohnix-text-dim)]">—</span>
                ),
        },
        {
            title: t("admin.users_count"),
            key: "users",
            width: 100,
            responsive: ["md"],
            render: (_, record) => <span className="text-sm text-[var(--ohnix-text-soft)]">{record._count?.users || 0}</span>,
        },
        {
            title: t("common.status"),
            key: "status",
            width: 160,
            render: (_, record) => (
                <div className="flex items-center gap-2">
                    <Tag color={record.isActive ? "green" : "default"}>
                        {record.isActive ? t("admin.active") : t("admin.inactive")}
                    </Tag>
                    <Popconfirm
                        title={record.isActive ? t("admin.confirm_deactivate_title") : t("admin.confirm_activate_title")}
                        description={record.isActive ? t("admin.confirm_deactivate_company") : t("admin.confirm_activate_company")}
                        onConfirm={() => onToggleStatus(record)}
                        okText={t("common.confirm")}
                        cancelText={t("common.cancel")}
                    >
                        <Switch checked={record.isActive} size="small" />
                    </Popconfirm>
                </div>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            width: 120,
            fixed: "right",
            render: (_, record) => (
                <Button type="text" className="!text-[#44F3F0]" onClick={() => onEdit(record)}>
                    {t("admin.configure")}
                </Button>
            ),
        },
    ];

    return (
        <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Input
                    placeholder={t("admin.search_companies_placeholder")}
                    prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm"
                    size="large"
                    allowClear
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={onAdd} size="large">
                    {t("admin.add_company")}
                </Button>
            </div>

            {/* Mobile */}
            <div className="block md:hidden">
                {loading ? (
                    [1, 2, 3].map((i) => <Card key={i} loading className="mb-4 module-shell" />)
                ) : filteredCompanies.length === 0 ? (
                    <Empty description={t("admin.no_companies")} />
                ) : (
                    filteredCompanies.map((company) => (
                        <MobileCompanyCard key={company.id} company={company} onEdit={onEdit} onToggleStatus={onToggleStatus} t={t} />
                    ))
                )}
            </div>

            {/* Desktop */}
            <div className={`hidden md:block ${tableShellClass}`}>
                <Table
                    columns={columns}
                    dataSource={filteredCompanies}
                    rowKey="id"
                    loading={loading}
                    locale={{ emptyText: t("admin.no_companies") }}
                    scroll={{ x: 900 }}
                    className="custom-table module-dark-table"
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "25", "50"],
                        showTotal: (total) => t("admin.companies_total", { count: total }),
                    }}
                />
            </div>
        </div>
    );
};

export default CompaniesTab;
