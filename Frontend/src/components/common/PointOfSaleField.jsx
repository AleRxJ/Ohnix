import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Form, Select, Spin } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import useSubscription from "../../hooks/useSubscription";
import { pointOfSaleService } from "../../services/pointOfSaleService";
import { getConnectivityState } from "../../offline/connectivity";
import { readMirrorAll } from "../../offline/entityQueue";

// Drops into any create form that goes through
// Backend/middleware/pos.permissions.js#resolveOrAssertPointOfSaleId
// (orders, purchases, customers, suppliers) - name is "pointOfSaleId"
// (camelCase) on purpose, matching that function's req.body.pointOfSaleId
// read exactly, even though every sibling field in these forms is
// snake_case; this isn't a new convention, just matching what the backend
// already expects.
//
// Only renders - and only becomes a required field - when the actor
// genuinely has more than one location to choose from. With exactly one
// (still the overwhelming majority of accounts, and any restricted-scope
// member pinned to a single location even on a multi-location account),
// resolveOrAssertPointOfSaleId already resolves it silently server-side;
// forcing an explicit choice here would just be friction with only one
// possible answer. Options are the actor's own scope only (inOwnScope) -
// creating a customer/order/etc. at a location outside your own access
// isn't something this field needs to support.
// Shared visibility decision, exported so a parent laid out in a fixed grid
// (antd Row/Col) can skip rendering the wrapping Col entirely instead of
// leaving it empty - an empty Col still reserves its 50% track, which reads
// as a blank gap next to the sibling field rather than a normal one-field
// row. Plain flex/grid layouts (a bare <PointOfSaleField /> among CSS grid
// children, or standalone outside any Row) don't need this: when this
// component returns null there, no DOM node is created and the layout
// reflows on its own.
//
// `visible` defaults to true while anything is still loading, matching the
// select's own loading-spinner state below - only flips to false once both
// the plan and the point-of-sale list are resolved and confirm there's
// nothing to choose from.
// `salesOnly` drops warehouse/distribution_center locations from the
// options - a bodega doesn't serve walk-in customers (per PointOfSale's own
// schema comment: "selling FROM a warehouse isn't blocked at this layer -
// that's a product/business decision"). This is that decision, applied only
// where it belongs: sales/quotation forms pass salesOnly, purchases/
// customers/suppliers don't, since receiving a purchase at a warehouse (or
// naming one as a customer/supplier's home location) is exactly what a
// warehouse is for.
export const usePointOfSaleFieldVisible = ({ salesOnly = false } = {}) => {
    const { can, loading: subscriptionLoading } = useSubscription();
    const canUseMultiLocation = can("multiLocation");
    const [options, setOptions] = useState(null); // null = still loading

    useEffect(() => {
        if (subscriptionLoading || !canUseMultiLocation) {
            if (!subscriptionLoading) setOptions([]);
            return;
        }
        const filterOwn = (rows) => (rows || []).filter((pos) => pos.isActive && pos.inOwnScope && (!salesOnly || pos.locationType === "point_of_sale" || !pos.locationType));
        if (!getConnectivityState()) {
            // pointsOfSale is a full-mirror entity (entitySync.js) - same
            // shape as the live GET /points-of-sale response, so it filters
            // identically. Without this, a genuinely multi-location account
            // silently lost the ability to say *which* location a purchase/
            // order/customer/supplier belongs to while offline (the field
            // just disappeared, per the `options.length <= 1` check below).
            readMirrorAll("pointsOfSale").then((rows) => setOptions(filterOwn(rows)));
            return;
        }
        pointOfSaleService
            .list()
            .then((res) => setOptions(filterOwn(res?.data)))
            .catch((error) => {
                if (!error.response) {
                    // Real network failure, not a server rejection - most
                    // likely we were actually offline this whole time (see
                    // connectivity.js's reportNetworkFailure). Fall back to
                    // the mirror instead of silently hiding the field.
                    readMirrorAll("pointsOfSale").then((rows) => setOptions(filterOwn(rows)));
                    return;
                }
                setOptions([]);
            });
    }, [canUseMultiLocation, subscriptionLoading, salesOnly]);

    const resolved = !subscriptionLoading && options !== null;
    const visible = !resolved || (canUseMultiLocation && options.length > 1);
    return { visible, options, subscriptionLoading, canUseMultiLocation };
};

const PointOfSaleField = ({ name = "pointOfSaleId", disabled = false, salesOnly = false }) => {
    const { t } = useI18n();
    const { visible, options, subscriptionLoading } = usePointOfSaleFieldVisible({ salesOnly });
    const form = Form.useFormInstance();

    // Hidden because there's only one choice - but "one choice" here can be
    // one STORE on an account that also has a bodega (salesOnly filters it
    // out). The server counts every active location, so leaving the field
    // empty made it reject the order with "pointOfSaleId es obligatorio".
    // Sending the single option explicitly is always correct.
    const onlyOptionId = !visible && options?.length === 1 ? options[0].id : null;
    // Watched, not read once: forms call form.resetFields() on open/after
    // submit (SalesQuotations, CreateProductionOrderModal, Customers...),
    // which wiped the auto-picked id - and since onlyOptionId itself didn't
    // change, nothing put it back, so every later submit went out without a
    // location. Re-applying whenever the value goes empty covers that.
    const currentValue = Form.useWatch(name, form);
    useEffect(() => {
        if (onlyOptionId && form && !currentValue) form.setFieldValue(name, onlyOptionId);
    }, [onlyOptionId, form, name, currentValue]);

    if (!visible) {
        // Registers the field so the auto-picked value is actually submitted;
        // initialValue makes resetFields() restore it instead of clearing it.
        return onlyOptionId ? (
            <Form.Item name={name} hidden noStyle initialValue={onlyOptionId}>
                <input type="hidden" />
            </Form.Item>
        ) : null;
    }

    return (
        <Form.Item
            name={name}
            className="point-of-sale-field"
            label={<span className="font-medium text-[var(--ohnix-text-muted)]">{t("pointOfSale.field_label")}</span>}
            rules={[{ required: true, message: t("pointOfSale.field_required") }]}
        >
            <Select
                size="large"
                className="rounded-lg auth-ohnix-input"
                placeholder={t("pointOfSale.field_placeholder")}
                disabled={disabled}
                loading={subscriptionLoading || !options}
                suffixIcon={subscriptionLoading ? <Spin size="small" /> : <ShopOutlined className="text-[var(--ohnix-text-dim)]" />}
                notFoundContent={options?.length === 0 ? t("pointOfSale.no_available_options") : undefined}
                options={options?.map((pos) => ({ value: pos.id, label: pos.name })) || []}
            />
        </Form.Item>
    );
};

export default PointOfSaleField;

PointOfSaleField.propTypes = {
    name: PropTypes.string,
    disabled: PropTypes.bool,
    salesOnly: PropTypes.bool,
};
