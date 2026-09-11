import React, { useEffect, useState } from "react";
import { Popover, Button } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import {
    CheckCircleFilled,
    CloudSyncOutlined,
    DisconnectOutlined,
    LockFilled,
    ReloadOutlined,
    WarningFilled,
} from "@ant-design/icons";
import { db } from "../../offline/db.js";
import { OUTBOX_STATUS } from "../../offline/outbox.js";
import { getConnectivityState, subscribeConnectivity } from "../../offline/connectivity.js";
import useI18n from "../../hooks/useI18n";
import ConflictsPanel from "./ConflictsPanel.jsx";

// Content of the click-to-open explainer - what still works offline vs. what
// needs a connection. Real bullet lists (not a comma-joined sentence, which
// read as a wall of text) so it's scannable at a glance; kept as short
// static items (not a live-generated list from the module registry) since
// it's meant to be a human-readable summary, not an exhaustive spec.
const OfflineCapabilitiesPopover = ({ t, conflictCount, onOpenConflicts }) => (
    <div className="offline-capabilities-popover__body">
        <div className="offline-capabilities-popover__header">
            <span className="offline-capabilities-popover__icon-badge">
                <DisconnectOutlined />
            </span>
            <div>
                <p className="offline-capabilities-popover__title">{t("common.offline_capabilities_title")}</p>
                <p className="offline-capabilities-popover__intro">{t("common.offline_capabilities_intro")}</p>
            </div>
        </div>

        {conflictCount > 0 && (
            <Button
                danger
                block
                size="small"
                icon={<WarningFilled />}
                onClick={onOpenConflicts}
                className="mb-3"
            >
                {t("common.offline_conflicts_view", { count: conflictCount })}
            </Button>
        )}

        <p className="offline-capabilities-popover__group-title offline-capabilities-popover__group-title--ok">
            {t("common.offline_capabilities_available_title")}
        </p>
        <ul className="offline-capabilities-popover__list">
            {[1, 2, 3, 4].map((n) => (
                <li key={n}>
                    <CheckCircleFilled className="offline-capabilities-popover__list-icon offline-capabilities-popover__list-icon--ok" />
                    {t(`common.offline_capabilities_available_${n}`)}
                </li>
            ))}
        </ul>

        <p className="offline-capabilities-popover__group-title offline-capabilities-popover__group-title--blocked">
            {t("common.offline_capabilities_unavailable_title")}
        </p>
        <ul className="offline-capabilities-popover__list">
            {[1, 2, 3].map((n) => (
                <li key={n}>
                    <LockFilled className="offline-capabilities-popover__list-icon offline-capabilities-popover__list-icon--blocked" />
                    {t(`common.offline_capabilities_unavailable_${n}`)}
                </li>
            ))}
        </ul>

        <p className="offline-capabilities-popover__footnote">
            <ReloadOutlined /> {t("common.offline_capabilities_reload_note")}
        </p>
    </div>
);

// Discreet, always-present connection/sync state - never a modal, never a
// popup, never blocks the page. See Backend/prisma/schema.prisma's
// IdempotencyKey model and Frontend/src/offline/syncEngine.js for what's
// actually behind "pending"/"needs attention" here.
const SyncStatusIndicator = () => {
    const { t } = useI18n();
    const [online, setOnline] = useState(getConnectivityState());
    const [conflictsOpen, setConflictsOpen] = useState(false);

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
    let showBadge = true;

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
        showBadge = false; // Connected, nothing pending - stay out of the way.
    }

    return (
        <>
            {showBadge && (
                <Popover
                    content={
                        <OfflineCapabilitiesPopover
                            t={t}
                            conflictCount={conflictCount}
                            onOpenConflicts={() => setConflictsOpen(true)}
                        />
                    }
                    trigger="click"
                    placement="bottomRight"
                    overlayClassName="offline-capabilities-popover"
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
            )}
            <ConflictsPanel open={conflictsOpen} onClose={() => setConflictsOpen(false)} />
        </>
    );
};

export default SyncStatusIndicator;
