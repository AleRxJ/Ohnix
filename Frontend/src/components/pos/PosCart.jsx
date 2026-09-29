import { useState } from "react";
import PropTypes from "prop-types";
import { Button, InputNumber, Popover, Select, Tooltip } from "antd";
import {
    CloseOutlined,
    DeleteOutlined,
    EditOutlined,
    MinusOutlined,
    PlusOutlined,
    ShoppingOutlined,
    SwapOutlined,
    UserOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { formatCurrency, getCurrencyInputProps } from "../../utils/currency";
import { availableStock } from "../../hooks/pos/usePosCart";
import { isFinalConsumer } from "../../hooks/pos/usePosCatalog";

const cop = (value) => formatCurrency(value, "COP");

// Same sale-price floor as OrderFormItems.jsx (mirrors Backend
// utils/salePriceControl.js, which is what actually enforces it).
const usePriceFloor = () => {
    const { hasCapability, getCapability } = useTeam();
    const canOverride = hasCapability("salesPriceOverride");
    const maxDiscountPct = getCapability("salesMaxDiscountPct") || 0;
    return {
        maxDiscountPct,
        floorFor: (product) => {
            if (canOverride) return null;
            const listPrice = Number(product.selling_price);
            return listPrice > 0 ? listPrice * (1 - maxDiscountPct / 100) : null;
        },
    };
};

const PriceEditor = ({ line, onSetPrice }) => {
    const { t } = useI18n();
    const { floorFor, maxDiscountPct } = usePriceFloor();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(line.unitPrice);
    const floor = floorFor(line.product);
    const tooLow = floor !== null && Number(draft) + 0.01 < floor;
    const inputProps = getCurrencyInputProps("COP");

    const apply = () => {
        if (tooLow) return;
        onSetPrice(line.product._id, draft);
        setOpen(false);
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) setDraft(line.unitPrice);
            }}
            trigger="click"
            title={t("pos.edit_price")}
            content={
                <div className="w-56 space-y-2">
                    <InputNumber
                        autoFocus
                        className="w-full"
                        size="large"
                        min={0}
                        value={draft}
                        onChange={(value) => setDraft(value ?? 0)}
                        onPressEnter={apply}
                        prefix="$"
                        formatter={inputProps.formatter}
                        parser={inputProps.parser}
                        status={tooLow ? "error" : undefined}
                    />
                    {tooLow && (
                        <div className="text-xs text-[var(--ohnix-status-danger)]">
                            {maxDiscountPct > 0 ? t("orders.price_below_allowed_discount", { pct: maxDiscountPct }) : t("orders.price_below_list_not_allowed")}
                        </div>
                    )}
                    <Button type="primary" block onClick={apply} disabled={tooLow}>
                        {t("pos.apply")}
                    </Button>
                </div>
            }
        >
            <button type="button" className="inline-flex items-center gap-1 text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-accent)]">
                {cop(line.unitPrice)}
                {line.unitPrice !== Number(line.product.selling_price) && (
                    <span className="text-[var(--ohnix-status-amber)]">· {t("pos.adjusted")}</span>
                )}
                <EditOutlined />
            </button>
        </Popover>
    );
};

PriceEditor.propTypes = {
    line: PropTypes.object.isRequired,
    onSetPrice: PropTypes.func.isRequired,
};

const CustomerPicker = ({ customer, customers, onChange, disabled }) => {
    const { t } = useI18n();
    const [picking, setPicking] = useState(false);

    if (picking) {
        return (
            <div className="flex items-center gap-2">
                <Select
                    autoFocus
                    defaultOpen
                    showSearch
                    size="large"
                    className="flex-1 auth-ohnix-input"
                    placeholder={t("orders.select_customer")}
                    optionFilterProp="label"
                    value={customer?._id}
                    onChange={(id) => {
                        onChange(customers.find((c) => c._id === id) || null);
                        setPicking(false);
                    }}
                    onBlur={() => setPicking(false)}
                    options={customers.map((c) => ({
                        value: c._id,
                        label: isFinalConsumer(c) ? t("pos.final_consumer") : [c.name, c.identification].filter(Boolean).join(" · "),
                    }))}
                />
                <Button type="text" icon={<CloseOutlined />} onClick={() => setPicking(false)} />
            </div>
        );
    }

    const label = !customer ? t("pos.choose_customer") : isFinalConsumer(customer) ? t("pos.final_consumer") : customer.name;
    return (
        <button type="button" className="pos-customer" onClick={() => setPicking(true)} disabled={disabled}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--ohnix-accent-soft)] text-[var(--ohnix-accent)]">
                <UserOutlined />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">{label}</span>
                <span className="block truncate text-xs text-[var(--ohnix-text-dim)]">
                    {customer?.identification ? `${t("pos.id_short")} ${customer.identification}` : t("pos.tap_to_change")}
                </span>
            </span>
            <SwapOutlined className="text-[var(--ohnix-text-dim)]" />
        </button>
    );
};

CustomerPicker.propTypes = {
    customer: PropTypes.object,
    customers: PropTypes.array.isRequired,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

const PosCart = ({ cart, customer, customers, onCustomerChange, onCharge, canCharge, chargeHint, sheet = false }) => {
    const { t } = useI18n();
    const { lines, totals, lastAddedId, bump } = cart;

    return (
        <aside className={`pos-cart ${sheet ? "is-sheet" : ""}`} aria-label={t("pos.current_sale")}>
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h2 className="m-0 text-lg font-bold text-[var(--ohnix-text-primary)]">{t("pos.current_sale")}</h2>
                    <span className="text-xs text-[var(--ohnix-text-dim)]">
                        {totals.units > 0 ? t("pos.units_in_cart", { count: totals.units }) : t("pos.empty_cart_short")}
                    </span>
                </div>
                {lines.length > 0 && (
                    <Tooltip title={t("pos.clear_cart")}>
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={cart.clear} aria-label={t("pos.clear_cart")} />
                    </Tooltip>
                )}
            </div>

            <CustomerPicker customer={customer} customers={customers} onChange={onCustomerChange} />

            <div className="pos-cart-lines">
                {lines.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-dashed border-[var(--ohnix-line-6)] text-2xl text-[var(--ohnix-text-dim)]">
                            <ShoppingOutlined />
                        </span>
                        <div className="text-sm font-medium text-[var(--ohnix-text-soft)]">{t("pos.empty_cart_title")}</div>
                        <div className="max-w-[240px] text-xs text-[var(--ohnix-text-dim)]">{t("pos.empty_cart_hint")}</div>
                    </div>
                ) : (
                    lines.map((line) => {
                        const max = availableStock(line.product);
                        return (
                            <div key={line.product._id} className={`pos-line ${lastAddedId === line.product._id ? "is-bumped" : ""}`} data-bump={lastAddedId === line.product._id ? bump : undefined}>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">{line.product.product_name}</div>
                                    <PriceEditor line={line} onSetPrice={cart.setPrice} />
                                </div>
                                <div className="pos-stepper">
                                    <button type="button" onClick={() => cart.setQuantity(line.product._id, line.quantity - 1)} aria-label={t("pos.decrease")}>
                                        <MinusOutlined />
                                    </button>
                                    <span>{line.quantity}</span>
                                    <button
                                        type="button"
                                        onClick={() => cart.setQuantity(line.product._id, line.quantity + 1)}
                                        disabled={line.quantity >= max}
                                        aria-label={t("pos.increase")}
                                    >
                                        <PlusOutlined />
                                    </button>
                                </div>
                                <div className="w-[88px] text-right text-sm font-bold tabular-nums text-[var(--ohnix-text-primary)]">
                                    {cop(line.quantity * line.unitPrice)}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="mt-4 space-y-2 border-t border-[var(--ohnix-line-3)] pt-4">
                <div className="flex justify-between text-sm text-[var(--ohnix-text-muted)]">
                    <span>{t("pos.subtotal")}</span>
                    <span className="tabular-nums">{cop(totals.subTotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-[var(--ohnix-text-muted)]">
                    <span>{t("pos.tax")}</span>
                    <span className="tabular-nums">{cop(totals.gst)}</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                    <span className="text-base font-bold text-[var(--ohnix-text-primary)]">{t("pos.total")}</span>
                    <span key={bump} className={`pos-total-value text-[var(--ohnix-text-primary)] ${bump ? "is-bump" : ""}`}>
                        {cop(totals.total)}
                    </span>
                </div>
            </div>

            <Tooltip title={chargeHint}>
                <button type="button" className="pos-charge mt-4" onClick={onCharge} disabled={!canCharge}>
                    {t("pos.charge")}
                    <kbd className="pos-kbd hidden border-[rgba(2,19,20,0.25)] text-[rgba(2,19,20,0.6)] md:inline">F9</kbd>
                </button>
            </Tooltip>
        </aside>
    );
};

PosCart.propTypes = {
    cart: PropTypes.object.isRequired,
    customer: PropTypes.object,
    customers: PropTypes.array.isRequired,
    onCustomerChange: PropTypes.func.isRequired,
    onCharge: PropTypes.func.isRequired,
    canCharge: PropTypes.bool,
    chargeHint: PropTypes.string,
    sheet: PropTypes.bool,
};

export default PosCart;
