import React, { useEffect, useState } from "react";
import { Form, Select } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import useSubscription from "../../hooks/useSubscription";
import { pointOfSaleService } from "../../services/pointOfSaleService";

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
const PointOfSaleField = ({ name = "pointOfSaleId", disabled = false }) => {
    const { t } = useI18n();
    const { can } = useSubscription();
    const [options, setOptions] = useState(null); // null = still loading

    useEffect(() => {
        pointOfSaleService
            .list()
            .then((res) => {
                const own = (res?.data || []).filter((pos) => pos.isActive && pos.inOwnScope);
                setOptions(own);
            })
            .catch(() => setOptions([]));
    }, []);

    if (!can("multiLocation") || !options || options.length <= 1) return null;

    return (
        <Form.Item
            name={name}
            label={<span className="font-medium text-[var(--ohnix-text-muted)]">{t("pointOfSale.field_label")}</span>}
            rules={[{ required: true, message: t("pointOfSale.field_required") }]}
        >
            <Select
                size="large"
                className="rounded-lg auth-ohnix-input"
                placeholder={t("pointOfSale.field_placeholder")}
                suffixIcon={<ShopOutlined className="text-[var(--ohnix-text-dim)]" />}
                disabled={disabled}
                options={options.map((pos) => ({ value: pos.id, label: pos.name }))}
            />
        </Form.Item>
    );
};

export default PointOfSaleField;
