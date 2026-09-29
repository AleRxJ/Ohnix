// components/layout/CommandPalette.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { SearchOutlined, EnterOutlined, CrownOutlined } from "@ant-design/icons";
import useNavItems, { NAV_GROUPS } from "../../hooks/useNavItems";
import useNavSignals, { TONE_RANK } from "../../hooks/useNavSignals";
import useScrollLock from "../../hooks/useScrollLock";
import useI18n from "../../hooks/useI18n";
import { OPEN_COMMAND_PALETTE_EVENT, COMMAND_PALETTE_SHORTCUT } from "./commandPaletteEvents";
import "./navigation.css";

const RECENTS_KEY = "ohnix:nav-recents";
const MAX_RECENTS = 4;

const normalize = (value) =>
    String(value || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();

// Cheap ranking, no fuzzy lib: exact prefix > word prefix > substring >
// keyword/section word prefix > keyword substring > in-order subsequence ("nmn" -> "nómina").
const scoreMatch = (query, label, extra) => {
    if (label.startsWith(query)) return 100;
    if (label.split(/\s+/).some((word) => word.startsWith(query))) return 80;
    if (label.includes(query)) return 60;
    if (extra.split(/\s+/).some((word) => word.startsWith(query))) return 50;
    if (extra.includes(query)) return 40;
    let index = 0;
    for (const char of label) if (char === query[index]) index += 1;
    return index === query.length ? 20 : 0;
};

const readRecents = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

// Always mounted: owns the shortcut, the open state and the recents list.
// The body (and its offline-mirror queries) only mounts while open, so a
// closed palette costs nothing next to the sidebar's own signal queries.
const CommandPalette = ({ currentPage }) => {
    const [open, setOpen] = useState(false);
    const [recents, setRecents] = useState(readRecents);

    // Recently visited pages - a per-viewer convenience, so blocked storage
    // just means no "Recientes" section. Keys that aren't nav modules (e.g.
    // /profile) are simply never matched when rendering.
    useEffect(() => {
        if (!currentPage) return;
        setRecents((previous) => {
            const next = [currentPage, ...previous.filter((key) => key !== currentPage)].slice(0, MAX_RECENTS + 4);
            try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* storage may be disabled */ }
            return next;
        });
    }, [currentPage]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setOpen((value) => !value);
            }
        };
        const onOpen = () => setOpen(true);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
        };
    }, []);

    if (!open) return null;
    return <PaletteBody currentPage={currentPage} recents={recents} onClose={() => setOpen(false)} />;
};

const PaletteBody = ({ currentPage, recents, onClose }) => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { items, can, needsFiscalSetup, openDiscoveriesCount } = useNavItems();
    const signals = useNavSignals({ items, can, needsFiscalSetup, openDiscoveriesCount });
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useScrollLock(true);
    useEffect(() => {
        // Wait for the portal to mount before focusing.
        requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    const sections = useMemo(() => {
        const withMeta = items.map((item) => ({
            item,
            label: t(item.textKey),
            groupLabel: t(`nav.group_${item.group}`),
            signals: [...(signals[item.key] || [])].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]),
        }));

        const q = normalize(query.trim());
        if (q) {
            const ranked = withMeta
                .map((entry) => {
                    const extra = normalize(`${entry.groupLabel} ${t(`nav.keywords_${entry.item.key.replace(/-/g, "_")}`, { defaultValue: "" })}`);
                    return { ...entry, score: scoreMatch(q, normalize(entry.label), extra) };
                })
                .filter((entry) => entry.score > 0)
                .sort((a, b) => b.score - a.score);
            return ranked.length ? [{ key: "results", title: t("nav.palette_results"), entries: ranked }] : [];
        }

        const attention = withMeta
            .filter((entry) => entry.signals.length > 0)
            .sort((a, b) => TONE_RANK[a.signals[0].tone] - TONE_RANK[b.signals[0].tone]);
        const shown = new Set(attention.map((entry) => entry.item.key));
        const recent = recents
            .filter((key) => key !== currentPage && !shown.has(key))
            .map((key) => withMeta.find((entry) => entry.item.key === key))
            .filter(Boolean)
            .slice(0, MAX_RECENTS);
        recent.forEach((entry) => shown.add(entry.item.key));

        return [
            { key: "attention", title: t("nav.palette_attention"), entries: attention },
            { key: "recent", title: t("nav.palette_recent"), entries: recent },
            ...NAV_GROUPS.map((group) => ({
                key: group,
                title: t(`nav.group_${group}`),
                entries: withMeta.filter((entry) => entry.item.group === group && !shown.has(entry.item.key)),
            })),
        ].filter((section) => section.entries.length > 0);
    }, [items, signals, query, recents, currentPage, t]);

    const flat = sections.flatMap((section) => section.entries);

    useEffect(() => setCursor(0), [query]);
    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
    }, [cursor]);

    const go = (entry) => {
        if (!entry) return;
        onClose();
        navigate(entry.item.path);
    };

    const onInputKeyDown = (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setCursor((value) => (flat.length ? (value + 1) % flat.length : 0));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setCursor((value) => (flat.length ? (value - 1 + flat.length) % flat.length : 0));
        } else if (event.key === "Enter") {
            event.preventDefault();
            go(flat[cursor]);
        } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        }
    };

    let index = -1;
    return createPortal(
        <div className="ohnix-palette" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div className="ohnix-palette__panel" role="dialog" aria-modal="true" aria-label={t("nav.search")}>
                <div className="ohnix-palette__input">
                    <SearchOutlined />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onInputKeyDown}
                        placeholder={t("nav.palette_placeholder")}
                        aria-label={t("nav.palette_placeholder")}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="ohnix-palette-list"
                        aria-activedescendant={flat.length ? `ohnix-palette-${cursor}` : undefined}
                    />
                    <kbd>Esc</kbd>
                </div>

                <div className="ohnix-palette__list ohnix-scrollbar-thin" id="ohnix-palette-list" role="listbox" ref={listRef}>
                    {sections.length === 0 && <p className="ohnix-palette__empty">{t("nav.palette_empty", { query: query.trim() })}</p>}
                    {sections.map((section) => (
                        <div key={section.key} className="ohnix-palette__section">
                            <p className="ohnix-palette__section-title">{section.title}</p>
                            {section.entries.map((entry) => {
                                index += 1;
                                const rowIndex = index;
                                const locked = entry.item.planFeature && !can(entry.item.planFeature);
                                const signal = entry.signals[0];
                                return (
                                    <button
                                        type="button"
                                        key={`${section.key}-${entry.item.key}`}
                                        id={`ohnix-palette-${rowIndex}`}
                                        data-index={rowIndex}
                                        role="option"
                                        aria-selected={rowIndex === cursor}
                                        className={`ohnix-palette__row ${rowIndex === cursor ? "is-active" : ""}`}
                                        onMouseMove={() => rowIndex !== cursor && setCursor(rowIndex)}
                                        onClick={() => go(entry)}
                                    >
                                        <span className="ohnix-palette__row-icon">{entry.item.icon}</span>
                                        <span className="ohnix-palette__row-text">
                                            <strong>{entry.label}</strong>
                                            <span>{entry.groupLabel}</span>
                                        </span>
                                        {locked ? (
                                            <span className="ohnix-palette__row-lock"><CrownOutlined /></span>
                                        ) : (
                                            signal && <span className={`ohnix-palette__row-signal is-${signal.tone}`}>{t(signal.labelKey, { count: signal.count })}</span>
                                        )}
                                        <EnterOutlined className="ohnix-palette__row-enter" />
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className="ohnix-palette__footer">
                    <span><kbd>↑</kbd><kbd>↓</kbd> {t("nav.palette_move")}</span>
                    <span><kbd>↵</kbd> {t("nav.palette_open")}</span>
                    <span className="ohnix-palette__footer-brand">Ohnix · {COMMAND_PALETTE_SHORTCUT}</span>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default CommandPalette;
