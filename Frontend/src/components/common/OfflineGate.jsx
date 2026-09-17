import React, { useEffect, useState } from "react";
import { DisconnectOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { getConnectivityState, subscribeConnectivity } from "../../offline/connectivity";

/**
 * Wraps a whole page/route that has no offline story at all (Team/roles,
 * Billing/subscription, Integrations/API keys, heavy-aggregation Accounting)
 * - see OFFLINE_ARCHITECTURE.md section 9/11 for why these specific modules
 * are never-offline by design, not by omission. Rather than letting the page
 * attempt its normal fetches and surface a confusing generic error while
 * offline, this shows a calm, explicit "this needs a connection" state in
 * its place - reactive, so it clears itself the moment connectivity returns
 * without the user having to reload.
 */
const OfflineGate = ({ children }) => {
    const { t } = useI18n();
    const [online, setOnline] = useState(getConnectivityState());

    useEffect(() => subscribeConnectivity(setOnline), []);

    if (online) return children;

    return (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-2xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-line-1)] px-8 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#f59e0b]/25 bg-[#f59e0b]/8 text-[#f59e0b]">
                <DisconnectOutlined style={{ fontSize: 22 }} />
            </div>
            <div>
                <p className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                    {t("common.offline_gate_title")}
                </p>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--ohnix-text-dim)]">
                    {t("common.offline_gate_description")}
                </p>
            </div>
        </div>
    );
};

export default OfflineGate;
