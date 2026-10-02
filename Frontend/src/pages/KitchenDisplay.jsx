import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import { Button, Grid, Segmented, Select, Switch, Tooltip } from "antd";
import { ArrowLeftOutlined, CompressOutlined, ExpandOutlined, FireOutlined, PrinterOutlined, ShopOutlined, SoundOutlined, TeamOutlined } from "@ant-design/icons";
import "../components/pos/pos.css";

import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { useKitchen, useKitchenPrintStation } from "../hooks/pos/useKitchen";
import { usePosLocations } from "../hooks/pos/usePosLocations";
import { getConnectivityState, subscribeConnectivity } from "../offline/connectivity";
import { readPrintSettings, writePrintSettings } from "../utils/posReceipt";
import { playChime } from "../utils/posChime";

// Kitchen display ("pantalla de cocina"): a tablet on the kitchen pass shows
// every comanda the waiters send, oldest first, and the cooks move each one
// Pendiente -> En preparación -> Listo with one tap. "Listo" lights the table
// up on the waiters' Caja (usePosTables#onKitchenReady). Optionally this same
// device is the location's comanda printer (useKitchenPrintStation).

const LOCATION_KEY = "ohnix.pos.pointOfSaleId";
const SOUND_KEY = "ohnix.kitchen.sound";
const LATE_MIN = 10;
const VERY_LATE_MIN = 20;

const readFlag = (key, fallback) => {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value === "1";
    } catch {
        return fallback;
    }
};
const writeFlag = (key, value) => {
    try {
        localStorage.setItem(key, value ? "1" : "0");
    } catch {
        // Per-device convenience only.
    }
};

const useSecondTick = () => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(id);
    }, []);
    return now;
};

const minutesSince = (from, now) => Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000));

const KitchenCard = ({ round, now, isNew, onAdvance, onBack, t }) => {
    const minutes = minutesSince(round.sent_at, now);
    const late = round.status !== "ready" && minutes >= LATE_MIN;
    const veryLate = round.status !== "ready" && minutes >= VERY_LATE_MIN;
    const tone = round.status === "ready" ? "is-ready" : veryLate ? "is-very-late" : late ? "is-late" : "";
    const next = { pending: "preparing", preparing: "ready", ready: "served" }[round.status];
    const label = { pending: t("kitchen.start"), preparing: t("kitchen.mark_ready"), ready: t("kitchen.mark_served") }[round.status];
    return (
        <article className={`kds-card ${tone} ${isNew ? "is-new" : ""}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="kds-table truncate">{round.table_name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ohnix-text-muted)]">
                        {round.zone && <span>{round.zone}</span>}
                        {round.waiter?.name && <span>· {round.waiter.name}</span>}
                        {round.guests ? (
                            <span>
                                · {round.guests} <TeamOutlined />
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="kds-timer">{t("kitchen.minutes", { count: minutes })}</span>
                    {round.round > 1 && <span className="kds-additional">{t("kitchen.additional")}</span>}
                </div>
            </div>
            <ul className="kds-items">
                {round.items.map((item) => (
                    <li key={item._id}>
                        <div className="kds-item">
                            <span className="kds-qty">{item.quantity}×</span>
                            <span className="min-w-0 flex-1 break-words">{item.product_name}</span>
                        </div>
                        {item.note && <div className="kds-note">{item.note}</div>}
                    </li>
                ))}
            </ul>
            <div className="flex gap-2">
                {round.status !== "pending" && (
                    <Tooltip title={t("kitchen.back")}>
                        <button type="button" className="kds-action is-subtle !w-14 shrink-0" onClick={() => onBack(round)} aria-label={t("kitchen.back")}>
                            <ArrowLeftOutlined />
                        </button>
                    </Tooltip>
                )}
                <button type="button" className={`kds-action ${round.status === "preparing" ? "is-ready" : round.status === "ready" ? "is-subtle" : ""}`} onClick={() => onAdvance(round, next)}>
                    {label}
                </button>
            </div>
        </article>
    );
};

KitchenCard.propTypes = {
    round: PropTypes.object.isRequired,
    now: PropTypes.number.isRequired,
    isNew: PropTypes.bool,
    onAdvance: PropTypes.func.isRequired,
    onBack: PropTypes.func.isRequired,
    t: PropTypes.func.isRequired,
};

const KitchenDisplay = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const screens = Grid.useBreakpoint();
    const wide = screens.lg !== false;

    const { locations, loading: locationsLoading } = usePosLocations();
    const [pointOfSaleId, setPointOfSaleId] = useState(undefined);
    useEffect(() => {
        if (!locations.length) return;
        let stored = null;
        try {
            stored = localStorage.getItem(LOCATION_KEY);
        } catch {
            stored = null;
        }
        setPointOfSaleId((current) => (current && locations.some((o) => o.id === current) ? current : locations.find((o) => o.id === stored)?.id || locations[0].id));
    }, [locations]);
    const ready = !locationsLoading && (locations.length === 0 || Boolean(pointOfSaleId));

    const [online, setOnline] = useState(getConnectivityState());
    useEffect(() => subscribeConnectivity(() => setOnline(getConnectivityState())), []);

    const [sound, setSound] = useState(() => readFlag(SOUND_KEY, true));
    const [printSettings, setPrintSettings] = useState(readPrintSettings);
    const updatePrint = (patch) => {
        const next = { ...printSettings, ...patch };
        setPrintSettings(next);
        writePrintSettings(next);
    };

    const [freshKeys, setFreshKeys] = useState(() => new Set());
    const freshTimer = useRef(null);
    const kitchen = useKitchen({
        pointOfSaleId,
        enabled: ready,
        onNewRound: (rounds) => {
            if (sound) playChime();
            setFreshKeys(new Set(rounds.map((r) => r._id)));
            clearTimeout(freshTimer.current);
            freshTimer.current = setTimeout(() => setFreshKeys(new Set()), 6000);
        },
    });
    useEffect(() => () => clearTimeout(freshTimer.current), []);

    useKitchenPrintStation({ pointOfSaleId, enabled: ready && printSettings.kitchenStation, width: printSettings.width, companyName: user?.company?.name });

    const now = useSecondTick();
    const [mobileColumn, setMobileColumn] = useState("pending");

    const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
    useEffect(() => {
        const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);
    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        else document.documentElement.requestFullscreen?.().catch(() => {});
    };

    const columns = useMemo(
        () => [
            { key: "pending", title: t("kitchen.col_pending"), rounds: kitchen.byStatus.pending, empty: t("kitchen.empty_pending") },
            { key: "preparing", title: t("kitchen.col_preparing"), rounds: kitchen.byStatus.preparing, empty: t("kitchen.empty_preparing") },
            { key: "ready", title: t("kitchen.col_ready"), rounds: kitchen.byStatus.ready, empty: t("kitchen.empty_ready") },
        ],
        [kitchen.byStatus, t]
    );
    const back = (round) => kitchen.setStatus(round, round.status === "ready" ? "preparing" : "pending");

    const renderColumn = (column) => (
        <section key={column.key} className="kds-column" aria-label={column.title}>
            <div className="kds-column-head">
                <span>{column.title}</span>
                <span className="kds-count">{column.rounds.length}</span>
            </div>
            {column.rounds.length === 0 ? (
                <div className="kds-empty">{column.empty}</div>
            ) : (
                column.rounds.map((round) => (
                    <KitchenCard key={round._id} round={round} now={now} isNew={freshKeys.has(round._id)} onAdvance={kitchen.setStatus} onBack={back} t={t} />
                ))
            )}
        </section>
    );

    return (
        <div className="min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-6 sm:py-6">
                <header className="mb-5 flex flex-wrap items-center gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)] text-xl text-[var(--ohnix-accent)]">
                            <FireOutlined />
                        </span>
                        <div className="min-w-0">
                            <h1 className="m-0 text-xl font-bold leading-tight sm:text-2xl">{t("kitchen.title")}</h1>
                            <div className="flex items-center gap-2 text-xs text-[var(--ohnix-text-dim)]">
                                <span className={`pos-live-dot ${online ? "" : "is-offline"}`} />
                                {online ? t("kitchen.live") : t("kitchen.offline")}
                            </div>
                        </div>
                    </div>
                    {locations.length > 1 && (
                        <Select
                            size="large"
                            className="min-w-[180px] auth-ohnix-input"
                            value={pointOfSaleId}
                            onChange={setPointOfSaleId}
                            suffixIcon={<ShopOutlined />}
                            options={locations.map((o) => ({ value: o.id, label: o.name }))}
                        />
                    )}
                    <Tooltip title={t("kitchen.sound_hint")}>
                        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--ohnix-line-5)] px-3 text-sm">
                            <SoundOutlined />
                            <span className="hidden sm:inline">{t("kitchen.sound")}</span>
                            <Switch
                                size="small"
                                checked={sound}
                                onChange={(checked) => {
                                    setSound(checked);
                                    writeFlag(SOUND_KEY, checked);
                                    if (checked) playChime();
                                }}
                            />
                        </label>
                    </Tooltip>
                    <Tooltip title={t("kitchen.print_station_hint")}>
                        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--ohnix-line-5)] px-3 text-sm">
                            <PrinterOutlined />
                            <span className="hidden sm:inline">{t("kitchen.print_station")}</span>
                            <Switch size="small" checked={printSettings.kitchenStation} onChange={(checked) => updatePrint({ kitchenStation: checked })} />
                        </label>
                    </Tooltip>
                    <Button size="large" icon={fullscreen ? <CompressOutlined /> : <ExpandOutlined />} onClick={toggleFullscreen} aria-label={t("kitchen.fullscreen")} />
                    <Link to="/pos">
                        <Button size="large" icon={<ShopOutlined />}>
                            <span className="hidden sm:inline">{t("kitchen.to_pos")}</span>
                        </Button>
                    </Link>
                </header>

                {wide ? (
                    <div className="kds-board">{columns.map(renderColumn)}</div>
                ) : (
                    <>
                        <Segmented
                            block
                            size="large"
                            className="mb-3"
                            value={mobileColumn}
                            onChange={setMobileColumn}
                            options={columns.map((c) => ({ value: c.key, label: `${c.title} · ${c.rounds.length}` }))}
                        />
                        <div className="kds-board">{renderColumn(columns.find((c) => c.key === mobileColumn))}</div>
                    </>
                )}
                {kitchen.loading && kitchen.rounds.length === 0 && <div className="mt-4 text-center text-sm text-[var(--ohnix-text-dim)]">{t("kitchen.loading")}</div>}
            </div>
        </div>
    );
};

export default KitchenDisplay;
