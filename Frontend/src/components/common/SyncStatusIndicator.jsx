import React, { useEffect, useState } from "react";
import { Popover } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudSyncOutlined, DisconnectOutlined, WarningFilled } from "@ant-design/icons";
import { db } from "../../offline/db.js";
import { OUTBOX_STATUS } from "../../offline/outbox.js";
import { getConnectivityState, subscribeConnectivity } from "../../offline/connectivity.js";
import useI18n from "../../hooks/useI18n";

// Content of the click-to-open explainer - what still works offline vs. what
// needs a connection. Kept as plain text lines (not a live-generated list
// from the module registry) since it's meant to be a short, human-readable
// summary a non-technical user can actually read, not an exhaustive spec.
const OfflineCapabilitiesPopover = ({ t }) => (
    <div className="max-w-xs text-sm">
        <p className="mb-2 text-[var(--ohnix-text-dim)]">{t("common.offline_capabilities_intro")}</p>
        <p className="mb-0.5 font-semibold text-[var(--ohnix-text-primary)]">
            {t("common.offline_capabilities_available_title")}
        </p>
        <p className="mb-2 text-[var(--ohnix-text-dim)]">{t("common.offline_capabilities_available_list")}</p>
        <p className="mb-0.5 font-semibold text-[var(--ohnix-text-primary)]">
            {t("common.offline_capabilities_unavailable_title")}
        </p>
        <p className="mb-2 text-[var(--ohnix-text-dim)]">{t("common.offline_capabilities_unavailable_list")}</p>
        <p className="mb-0 text-[var(--ohnix-text-dim)]">{t("common.offline_capabilities_reload_note")}</p>
    </div>
);

// Discreet, always-present connection/sync state - never a modal, never a
// popup, never blocks the page. See Backend/prisma/schema.prisma's
// IdempotencyKey model and Frontend/src/offline/syncEngine.js for what's
// actually behind "pending"/"needs attention" here.
const SyncStatusIndicator = () => {
    const { t } = useI18n();
    const [online, setOnline] = useState(getConnectivityState());

    useEffect(() => subscribeConnectivity(setOnline), []);

    const pendingCount = useLiveQuery(
        () => db.outbox.where("status").anyOf(OUTBOX_STATUS.PENDING, OUTBOX_STATUS.SYNCING, OUTBOX_STATUS.ERROR).count(),
        [],
        0
    );
    const conflictCount = useLiveQuery(
        () => db.outbox.where("status").equals(OUTBOX_STATUS.CONFLICT).count(),
        [],
        0
    );
    const syncingCount = useLiveQuery(
        () => db.outbox.where("status").equals(OUTBOX_STATUS.SYNCING).count(),
        [],
        0
    );

    let icon;
    let label;
    let color;

    if (!online) {
        icon = <DisconnectOutlined />;
        label = t("common.offline_offline");
        color = "#f59e0b";
    } else if (conflictCount > 0) {
        icon = <WarningFilled />;
        label = t("common.offline_attention");
        color = "#ef4444";
    } else if (syncingCount > 0) {
        icon = <CloudSyncOutlined spin />;
        label = t("common.offline_syncing");
        color = "#7C6AF7";
    } else if (pendingCount > 0) {
        icon = <CloudSyncOutlined />;
        label = t("common.offline_pending", { count: pendingCount });
        color = "#f59e0b";
    } else {
        return null; // Connected, nothing pending - stay out of the way.
    }

    return (
        <Popover
            content={<OfflineCapabilitiesPopover t={t} />}
            title={t("common.offline_capabilities_title")}
            trigger="click"
            placement="bottomRight"
        >
            <button
                type="button"
                className="hidden md:flex items-center gap-1.5 mr-3 rounded-full px-3 py-1 text-xs font-semibold cursor-pointer"
                style={{
                    color,
                    background: "var(--ohnix-surface-2)",
                    border: "1px solid var(--ohnix-line-5)",
                }}
                role="status"
                title={label}
            >
                {icon}
                <span className="whitespace-nowrap">{label}</span>
            </button>
        </Popover>
    );
};

export default SyncStatusIndicator;
