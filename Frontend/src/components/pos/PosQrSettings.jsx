import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Collapse, Input, InputNumber, Popconfirm, Popover, Switch, Tooltip } from "antd";
import { CopyOutlined, ExportOutlined, PrinterOutlined, QrcodeOutlined, ReloadOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../../hooks/useI18n";
import { formatCurrency } from "../../utils/currency";
import { printTableQrSheet, tableMenuUrl } from "../../utils/tableQrSheet";

// "QR y carta" tab of the tables drawer: turn customer QR ordering on for
// this location, print/copy each table's QR, and choose what the customer
// menu shows (categories, their order, a short line per product). Admin-only
// and online-only, like the rest of the drawer.

const PosQrSettings = ({ tables, pointOfSaleId, restaurantName, onUpdateTable, onReload }) => {
    const { t } = useI18n();
    const [enabled, setEnabled] = useState(false);
    const [loadingSwitch, setLoadingSwitch] = useState(true);
    const [menu, setMenu] = useState({ categories: [], products: [] });
    const [printing, setPrinting] = useState(false);

    const params = useMemo(() => (pointOfSaleId ? { pointOfSaleId } : {}), [pointOfSaleId]);

    const load = useCallback(async () => {
        setLoadingSwitch(true);
        try {
            const [qr, settings] = await Promise.all([api.get("/restaurant/tables/qr-settings", { params }), api.get("/restaurant/menu-settings")]);
            setEnabled(Boolean(qr.data?.data?.qr_ordering_enabled));
            setMenu(settings.data?.data || { categories: [], products: [] });
        } catch (error) {
            toast.error(error.response?.data?.message || t("tables.save_failed"));
        } finally {
            setLoadingSwitch(false);
        }
    }, [params, t]);

    useEffect(() => {
        load();
    }, [load]);

    const toggle = async (checked) => {
        setEnabled(checked);
        try {
            await api.patch("/restaurant/tables/qr-settings", { qr_ordering_enabled: checked, ...params });
            // Turning it on gives older tables their token.
            if (checked) await onReload?.();
            toast.success(checked ? t("tables.qr_enabled") : t("tables.qr_disabled"));
        } catch (error) {
            setEnabled(!checked);
            toast.error(error.response?.data?.message || t("tables.save_failed"));
        }
    };

    const copy = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t("tables.qr_copied"));
        } catch {
            toast.error(url);
        }
    };

    const withToken = tables.filter((table) => table.public_token);
    const printAll = async () => {
        setPrinting(true);
        try {
            await printTableQrSheet({ restaurantName, tables: withToken, t });
        } finally {
            setPrinting(false);
        }
    };

    const updateCategory = async (category, patch) => {
        setMenu((prev) => ({ ...prev, categories: prev.categories.map((c) => (c._id === category._id ? { ...c, ...patch } : c)) }));
        try {
            await api.patch(`/restaurant/menu-settings/categories/${category._id}`, patch);
        } catch (error) {
            toast.error(error.response?.data?.message || t("tables.save_failed"));
            load();
        }
    };

    const updateProduct = async (product, description) => {
        const clean = description.trim();
        if ((product.menu_description || "") === clean) return;
        setMenu((prev) => ({ ...prev, products: prev.products.map((p) => (p._id === product._id ? { ...p, menu_description: clean || null } : p)) }));
        try {
            await api.patch(`/restaurant/menu-settings/products/${product._id}`, { menu_description: clean });
        } catch (error) {
            toast.error(error.response?.data?.message || t("tables.save_failed"));
            load();
        }
    };

    const productsByCategory = useMemo(() => {
        const map = {};
        menu.products.forEach((p) => {
            map[p.category_id] = map[p.category_id] || [];
            map[p.category_id].push(p);
        });
        return map;
    }, [menu.products]);

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)] p-4">
                <div className="flex items-start gap-3">
                    <span className="pos-request-icon">
                        <QrcodeOutlined />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-[var(--ohnix-text-primary)]">{t("tables.qr_title")}</div>
                        <p className="m-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("tables.qr_help")}</p>
                    </div>
                    <Switch checked={enabled} loading={loadingSwitch} onChange={toggle} />
                </div>
            </section>

            <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ohnix-text-dim)]">{t("tables.qr_tables")}</div>
                    <Button icon={<PrinterOutlined />} onClick={printAll} loading={printing} disabled={!enabled || !withToken.length}>
                        {t("tables.qr_print_all")}
                    </Button>
                </div>
                {!enabled && <p className="m-0 mb-2 text-xs text-[var(--ohnix-text-dim)]">{t("tables.qr_off_hint")}</p>}
                <div className="divide-y divide-[var(--ohnix-line-3)] rounded-2xl border border-[var(--ohnix-line-4)]">
                    {tables.length === 0 && <div className="p-4 text-sm text-[var(--ohnix-text-dim)]">{t("tables.none")}</div>}
                    {tables.map((table) => {
                        const url = table.public_token ? tableMenuUrl(table.public_token) : null;
                        return (
                            <div key={table._id} className="flex items-center gap-2 px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold">{table.name}</div>
                                    {table.zone && <div className="text-xs text-[var(--ohnix-text-dim)]">{table.zone}</div>}
                                </div>
                                {url ? (
                                    <>
                                        <Popover
                                            trigger="click"
                                            content={
                                                <div className="rounded-xl bg-white p-3">
                                                    <QRCodeSVG value={url} size={168} level="M" />
                                                </div>
                                            }
                                        >
                                            <Button size="small" icon={<QrcodeOutlined />} aria-label={t("tables.qr_show")} disabled={!enabled} />
                                        </Popover>
                                        <Tooltip title={t("tables.qr_copy")}>
                                            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(url)} disabled={!enabled} />
                                        </Tooltip>
                                        <Tooltip title={t("tables.qr_open")}>
                                            <Button size="small" icon={<ExportOutlined />} href={url} target="_blank" rel="noreferrer" disabled={!enabled} />
                                        </Tooltip>
                                        <Popconfirm title={t("tables.qr_regenerate_confirm")} onConfirm={() => onUpdateTable(table._id, { regenerate_token: true })} okText={t("tables.qr_regenerate")} cancelText={t("common.cancel")}>
                                            <Tooltip title={t("tables.qr_regenerate")}>
                                                <Button size="small" icon={<ReloadOutlined />} />
                                            </Tooltip>
                                        </Popconfirm>
                                    </>
                                ) : (
                                    <span className="text-xs text-[var(--ohnix-text-dim)]">{t("tables.qr_no_token")}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--ohnix-text-dim)]">{t("tables.menu_title")}</div>
                <p className="m-0 mb-3 text-xs text-[var(--ohnix-text-muted)]">{t("tables.menu_help")}</p>
                {menu.categories.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--ohnix-line-5)] p-4 text-sm text-[var(--ohnix-text-dim)]">{t("tables.menu_empty")}</div>
                ) : (
                    <Collapse
                        className="pos-menu-collapse"
                        items={menu.categories.map((category) => ({
                            key: category._id,
                            label: (
                                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
                                    <Switch size="small" checked={category.menu_visible} onChange={(checked) => updateCategory(category, { menu_visible: checked })} />
                                    <span className={`flex-1 truncate font-semibold ${category.menu_visible ? "" : "text-[var(--ohnix-text-dim)] line-through"}`}>{category.name}</span>
                                    <span className="text-xs text-[var(--ohnix-text-dim)]">{t("tables.menu_products", { count: category.product_count })}</span>
                                    <Tooltip title={t("tables.menu_order")}>
                                        <InputNumber size="small" min={0} max={999} className="!w-16" defaultValue={category.menu_sort_order} onBlur={(e) => Number(e.target.value) !== category.menu_sort_order && updateCategory(category, { menu_sort_order: Number(e.target.value) || 0 })} />
                                    </Tooltip>
                                </div>
                            ),
                            children: (
                                <div className="space-y-2">
                                    {(productsByCategory[category._id] || []).map((product) => (
                                        <div key={product._id} className="flex items-center gap-3">
                                            <div className="w-40 min-w-0 shrink-0">
                                                <div className="truncate text-sm">{product.name}</div>
                                                <div className="text-xs tabular-nums text-[var(--ohnix-text-dim)]">{formatCurrency(product.price, "COP")}</div>
                                            </div>
                                            <Input size="small" maxLength={160} defaultValue={product.menu_description || ""} placeholder={t("tables.menu_description_placeholder")} onBlur={(e) => updateProduct(product, e.target.value)} />
                                        </div>
                                    ))}
                                    {!(productsByCategory[category._id] || []).length && <div className="text-xs text-[var(--ohnix-text-dim)]">{t("tables.menu_no_products")}</div>}
                                </div>
                            ),
                        }))}
                    />
                )}
            </section>
        </div>
    );
};

PosQrSettings.propTypes = {
    tables: PropTypes.array.isRequired,
    pointOfSaleId: PropTypes.string,
    restaurantName: PropTypes.string,
    onUpdateTable: PropTypes.func.isRequired,
    onReload: PropTypes.func,
};

export default PosQrSettings;
