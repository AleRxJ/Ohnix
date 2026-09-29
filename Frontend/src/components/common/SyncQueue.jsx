import { useEffect, useState } from "react";
import {
    CheckCircleFilled,
    ClockCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    LoadingOutlined,
    PlusOutlined,
    ReloadOutlined,
    ThunderboltOutlined,
    CloudUploadOutlined,
} from "@ant-design/icons";
import { OUTBOX_STATUS } from "../../offline/outbox.js";
import { entityLabel, operationLabel } from "../../offline/describeOutboxEntry.js";
import useI18n from "../../hooks/useI18n";
import "./syncQueue.css";


const OP_ICONS = {
    create: <PlusOutlined />,
    update: <EditOutlined />,
    delete: <DeleteOutlined />,
    custom: <ThunderboltOutlined />,
};

const STATUS_META = {
    [OUTBOX_STATUS.PENDING]: { key: "pending", icon: <ClockCircleOutlined /> },
    [OUTBOX_STATUS.SYNCING]: { key: "syncing", icon: <LoadingOutlined spin /> },
    [OUTBOX_STATUS.ERROR]: { key: "error", icon: <ReloadOutlined /> },
    [OUTBOX_STATUS.SYNCED]: { key: "synced", icon: <CheckCircleFilled /> },
};

const useRelativeTime = (lang) => {
    // Re-render every 30s so "hace 1 min" keeps moving while the popover is open.
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((value) => value + 1), 30000);
        return () => clearInterval(id);
    }, []);
    const format = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
    return (iso) => {
        if (!iso) return "";
        const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000);
        if (Math.abs(seconds) < 45) return lang === "es" ? "justo ahora" : "just now";
        const minutes = Math.round(seconds / 60);
        if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
        const hours = Math.round(minutes / 60);
        if (Math.abs(hours) < 24) return format.format(hours, "hour");
        return format.format(Math.round(hours / 24), "day");
    };
};

const SyncQueue = ({ queue, online }) => {
    const { t, currentLanguage } = useI18n();
    const lang = currentLanguage === "es" ? "es" : "en";
    const relative = useRelativeTime(lang);
    if (!queue || (queue.activeCount === 0 && queue.recentCount === 0)) return null;

    const { rows, activeCount, syncingCount, errorCount, recentCount, hiddenCount } = queue;
    const total = activeCount + recentCount;
    const progress = total > 0 ? Math.round((recentCount / total) * 100) : 100;

    let tone = "info";
    let summary;
    if (!online) {
        tone = "offline";
        summary = t("common.offline_queue_offline");
    } else if (activeCount === 0) {
        tone = "done";
        summary = t("common.offline_queue_done");
    } else if (errorCount > 0 && syncingCount === 0) {
        tone = "warn";
        summary = t("common.offline_queue_retrying");
    } else {
        summary = t("common.offline_queue_syncing", { done: recentCount, total });
    }

    return (
        <section className={`sync-queue is-${tone}`}>
            <div className="sync-queue__head">
                <span className="sync-queue__head-icon">{activeCount === 0 ? <CheckCircleFilled /> : <CloudUploadOutlined />}</span>
                <div className="min-w-0 flex-1">
                    <p className="sync-queue__title">
                        {t("common.offline_queue_title")}
                        {activeCount > 0 && <span className="sync-queue__count">{activeCount}</span>}
                    </p>
                    <p className="sync-queue__summary">{summary}</p>
                </div>
            </div>

            {online && activeCount > 0 && (
                <div className="sync-queue__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                    <span style={{ width: `${Math.max(progress, 6)}%` }} />
                </div>
            )}

            <ul className="sync-queue__list">
                {rows.map((entry) => {
                    const status = STATUS_META[entry.status] || STATUS_META[OUTBOX_STATUS.PENDING];
                    const when = entry.status === OUTBOX_STATUS.SYNCED ? entry.lastAttemptAt : entry.createdAt;
                    return (
                        <li key={entry.localId} className={`sync-queue__row is-${status.key}`}>
                            <span className={`sync-queue__op is-${entry.opType}`}>{OP_ICONS[entry.opType] || OP_ICONS.custom}</span>
                            <span className="sync-queue__text">
                                <strong title={entry.recordLabel || undefined}>
                                    {entityLabel(entry, lang)}
                                    {entry.recordLabel ? <em> · {entry.recordLabel}</em> : null}
                                </strong>
                                <span>
                                    {operationLabel(entry, lang)} · {relative(when)}
                                </span>
                            </span>
                            <span
                                className={`sync-queue__status is-${status.key}`}
                                title={entry.status === OUTBOX_STATUS.ERROR ? entry.lastError || undefined : undefined}
                            >
                                {status.icon}
                                {entry.status === OUTBOX_STATUS.ERROR
                                    ? t("common.offline_queue_status_error", { count: entry.attempts || 1 })
                                    : t(`common.offline_queue_status_${status.key}`)}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {hiddenCount > 0 && <p className="sync-queue__more">{t("common.offline_queue_more", { count: hiddenCount })}</p>}
        </section>
    );
};

export default SyncQueue;
