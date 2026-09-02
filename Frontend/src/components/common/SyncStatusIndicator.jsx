import React, { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudSyncOutlined, DisconnectOutlined, WarningFilled } from "@ant-design/icons";
import { db } from "../../offline/db.js";
import { OUTBOX_STATUS } from "../../offline/outbox.js";
import { getConnectivityState, subscribeConnectivity } from "../../offline/connectivity.js";
import useI18n from "../../hooks/useI18n";

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
        <div
            className="hidden md:flex items-center gap-1.5 mr-3 rounded-full px-3 py-1 text-xs font-semibold"
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
        </div>
    );
};

export default SyncStatusIndicator;
