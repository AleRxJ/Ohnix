import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch, Table, Tooltip } from "antd";
import {
    ArrowLeftOutlined,
    CloseCircleOutlined,
    FileTextOutlined,
    FireOutlined,
    PlusOutlined,
    SettingOutlined,
    SwapOutlined,
    TeamOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { formatCurrency } from "../../utils/currency";

const cop = (value) => formatCurrency(value, "COP");

// Re-renders once a minute so "hace 25 min" stays true without a clock per card.
const useMinuteTick = () => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(id);
    }, []);
    return now;
};

const elapsed = (from, now) => {
    const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

export const TablesBoard = ({ tables, tabs, loading, canConfigure, onSelect, onConfigure }) => {
    const { t } = useI18n();
    const now = useMinuteTick();
    const tabByTable = useMemo(() => Object.fromEntries(tabs.map((tab) => [tab.table_id, tab])), [tabs]);
    const zones = useMemo(() => {
        const groups = new Map();
        tables.forEach((table) => {
            const zone = table.zone || "";
            if (!groups.has(zone)) groups.set(zone, []);
            groups.get(zone).push(table);
        });
        return [...groups.entries()];
    }, [tables]);
    const occupied = tabs.length;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-[var(--ohnix-line-5)] px-3 py-1 text-[var(--ohnix-text-muted)]">
                        {t("tables.free_count", { count: tables.length - occupied })}
                    </span>
                    <span className="rounded-full border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)] px-3 py-1 text-[var(--ohnix-accent)]">
                        {t("tables.occupied_count", { count: occupied })}
                    </span>
                </div>
                {canConfigure && (
                    <Button icon={<SettingOutlined />} onClick={onConfigure}>
                        {t("tables.configure")}
                    </Button>
                )}
            </div>

            {tables.length === 0 ? (
                <div className="py-16">
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<span className="text-[var(--ohnix-text-muted)]">{loading ? t("tables.loading") : t("tables.none")}</span>}
                    >
                        {canConfigure && !loading && (
                            <Button type="primary" icon={<PlusOutlined />} onClick={onConfigure}>
                                {t("tables.create_first")}
                            </Button>
                        )}
                    </Empty>
                </div>
            ) : (
                zones.map(([zone, zoneTables]) => (
                    <div key={zone || "_"}>
                        {zone && <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ohnix-text-dim)]">{zone}</div>}
                        <div className="pos-tables-grid">
                            {zoneTables.map((table) => {
                                const tab = tabByTable[table._id];
                                return (
                                    <button
                                        key={table._id}
                                        type="button"
                                        className={`pos-table ${tab ? "is-occupied" : ""} ${tab?.unsent_count ? "has-pending" : ""}`}
                                        onClick={() => onSelect(table, tab)}
                                    >
                                        <span className="pos-table-name">{table.name}</span>
                                        {tab ? (
                                            <>
                                                <span className="pos-table-total">{cop(tab.subtotal)}</span>
                                                <span className="pos-table-meta">
                                                    {elapsed(tab.opened_at, now)}
                                                    {tab.guests ? ` · ${tab.guests}` : ""}
                                                    {tab.guests ? <TeamOutlined className="ml-1" /> : null}
                                                </span>
                                                {tab.unsent_count > 0 && (
                                                    <span className="pos-table-badge">
                                                        <FireOutlined /> {tab.unsent_count}
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <span className="pos-table-meta">
                                                {t("tables.free")} · {table.seats} <TeamOutlined />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

TablesBoard.propTypes = {
    tables: PropTypes.array.isRequired,
    tabs: PropTypes.array.isRequired,
    loading: PropTypes.bool,
    canConfigure: PropTypes.bool,
    onSelect: PropTypes.func.isRequired,
    onConfigure: PropTypes.func.isRequired,
};

// Shown on top of the cart while a table is active.
export const TabHeader = ({ tab, onBack, onKitchen, onPreBill, onMove, onCancel, sending }) => {
    const { t } = useI18n();
    const now = useMinuteTick();
    return (
        <div className="mb-3 rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)] p-3">
            <div className="flex items-center gap-2">
                <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label={t("tables.back")} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold text-[var(--ohnix-text-primary)]">{tab.table_name}</div>
                    <div className="text-xs text-[var(--ohnix-text-muted)]">
                        {t("tables.open_for", { time: elapsed(tab.opened_at, now) })}
                        {tab.guests ? ` · ${t("tables.guests_count", { count: tab.guests })}` : ""}
                    </div>
                </div>
            </div>
            {/* 2x2: four labelled actions don't fit one row of the 400px cart. */}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <Tooltip title={tab.unsent_count ? t("tables.kitchen_hint", { count: tab.unsent_count }) : t("tables.kitchen_nothing")}>
                    <Button size="small" icon={<FireOutlined />} onClick={onKitchen} loading={sending} disabled={!tab.unsent_count} type={tab.unsent_count ? "primary" : "default"}>
                        {t("tables.kitchen")}
                    </Button>
                </Tooltip>
                <Button size="small" icon={<FileTextOutlined />} onClick={onPreBill} disabled={!tab.items?.length}>
                    {t("tables.pre_bill")}
                </Button>
                <Button size="small" icon={<SwapOutlined />} onClick={onMove}>
                    {t("tables.move")}
                </Button>
                <Popconfirm title={t("tables.cancel_confirm")} onConfirm={onCancel} okText={t("tables.cancel_tab")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }}>
                    <Button size="small" danger icon={<CloseCircleOutlined />}>
                        {t("tables.cancel_tab")}
                    </Button>
                </Popconfirm>
            </div>
        </div>
    );
};

TabHeader.propTypes = {
    tab: PropTypes.object.isRequired,
    onBack: PropTypes.func.isRequired,
    onKitchen: PropTypes.func.isRequired,
    onPreBill: PropTypes.func.isRequired,
    onMove: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    sending: PropTypes.bool,
};

export const MoveTabModal = ({ open, tab, tables, tabs, onMove, onClose }) => {
    const { t } = useI18n();
    const [target, setTarget] = useState(null);
    const busy = new Set(tabs.map((x) => x.table_id));
    return (
        <Modal open={open} title={t("tables.move_title", { table: tab?.table_name || "" })} onCancel={onClose} onOk={() => onMove(target)} okButtonProps={{ disabled: !target }} okText={t("tables.move")} destroyOnClose>
            <Select
                className="w-full"
                size="large"
                value={target}
                onChange={setTarget}
                placeholder={t("tables.move_placeholder")}
                options={tables.filter((x) => !busy.has(x._id)).map((x) => ({ value: x._id, label: [x.name, x.zone].filter(Boolean).join(" · ") }))}
            />
        </Modal>
    );
};

MoveTabModal.propTypes = {
    open: PropTypes.bool,
    tab: PropTypes.object,
    tables: PropTypes.array.isRequired,
    tabs: PropTypes.array.isRequired,
    onMove: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
};

// Create tables in bulk ("Mesa 1..10") and edit/deactivate existing ones.
export const TablesConfigDrawer = ({ open, onClose, tables, tabs, onCreate, onUpdate }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const busy = new Set(tabs.map((x) => x.table_id));

    const create = async ({ prefix, from, count, zone, seats }) => {
        const rows = Array.from({ length: count }, (_, i) => ({ name: `${prefix.trim()} ${from + i}`.trim(), zone, seats }));
        setSaving(true);
        try {
            await onCreate(rows);
            toast.success(t("tables.created", { count }));
            form.setFieldsValue({ from: from + count });
        } catch (error) {
            toast.error(error.response?.data?.message || t("tables.save_failed"));
        } finally {
            setSaving(false);
        }
    };

    const patch = async (table, change) => {
        try {
            await onUpdate(table._id, change);
        } catch (error) {
            toast.error(error.response?.data?.message || t("tables.save_failed"));
        }
    };

    return (
        <Drawer open={open} onClose={onClose} title={t("tables.configure")} width={Math.min(560, window.innerWidth)} destroyOnClose>
            <Form form={form} layout="vertical" onFinish={create} initialValues={{ prefix: t("tables.default_prefix"), from: tables.length + 1, count: 10, seats: 4 }}>
                <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
                    <Form.Item name="prefix" label={t("tables.prefix")} rules={[{ required: true }]}>
                        <Input maxLength={30} />
                    </Form.Item>
                    <Form.Item name="from" label={t("tables.from")}>
                        <InputNumber min={1} max={999} className="w-full" />
                    </Form.Item>
                    <Form.Item name="count" label={t("tables.count")}>
                        <InputNumber min={1} max={100} className="w-full" />
                    </Form.Item>
                    <Form.Item name="seats" label={t("tables.seats")}>
                        <InputNumber min={1} max={50} className="w-full" />
                    </Form.Item>
                </div>
                <Form.Item name="zone" label={t("tables.zone")} extra={t("tables.zone_hint")}>
                    <Input maxLength={40} placeholder={t("tables.zone_placeholder")} />
                </Form.Item>
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saving} block>
                    {t("tables.create_button")}
                </Button>
            </Form>

            <Table
                className="module-dark-table mt-6"
                size="small"
                rowKey="_id"
                pagination={false}
                dataSource={tables}
                locale={{ emptyText: t("tables.none") }}
                columns={[
                    {
                        title: t("tables.name"),
                        dataIndex: "name",
                        render: (value, table) => (
                            <Input size="small" defaultValue={value} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== value && patch(table, { name: e.target.value.trim() })} />
                        ),
                    },
                    {
                        title: t("tables.zone"),
                        dataIndex: "zone",
                        render: (value, table) => <Input size="small" defaultValue={value || ""} maxLength={40} onBlur={(e) => (e.target.value.trim() || null) !== (value || null) && patch(table, { zone: e.target.value })} />,
                    },
                    {
                        title: t("tables.seats"),
                        dataIndex: "seats",
                        width: 80,
                        render: (value, table) => <InputNumber size="small" min={1} max={50} defaultValue={value} onBlur={(e) => Number(e.target.value) !== value && patch(table, { seats: Number(e.target.value) })} />,
                    },
                    {
                        title: t("tables.active"),
                        dataIndex: "is_active",
                        width: 70,
                        render: (value, table) => (
                            <Tooltip title={busy.has(table._id) ? t("tables.busy_hint") : ""}>
                                <Switch size="small" checked={value !== false} disabled={busy.has(table._id)} onChange={(checked) => patch(table, { is_active: checked })} />
                            </Tooltip>
                        ),
                    },
                ]}
            />
        </Drawer>
    );
};

TablesConfigDrawer.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    tables: PropTypes.array.isRequired,
    tabs: PropTypes.array.isRequired,
    onCreate: PropTypes.func.isRequired,
    onUpdate: PropTypes.func.isRequired,
};
