import React, { useState } from "react";
import { Modal } from "antd";
import { CompassOutlined, CloseOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { useTeam } from "../../context/TeamContext";
import { tutorialDataService } from "../../services/tutorialDataService";

// App-wide, not scoped to any one module - the tour walks through the whole
// first-time flow (categories, products, purchases, sales, customers, plus
// a look at Billing and Reports), so the entry point has to be reachable
// from anywhere in the dashboard, not just Products.
const InventoryTourFab = () => {
    const { t } = useI18n();
    const {
        isOpen,
        completed,
        fabDismissed,
        start,
        dismissFab,
        hasSavedProgress,
        discardProgress,
    } = useInventoryTour();
    // Account-admin-only: an invited team member's practice run would tag
    // is_tutorial_data records under the ACCOUNT (createdById resolves to
    // the owner, not the member - see resolveAccountScope()), which the
    // owner never asked for and could get swept up in their own later
    // purge/keep decision. isTeamMember is false for both the real owner
    // and solo accounts (no team at all), so it's the exact "is this
    // account's admin" check, not the unrelated platform-admin role.
    const { isTeamMember, loading: teamLoading } = useTeam();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [purging, setPurging] = useState(false);

    // Also gated on teamLoading - rendering the FAB before the team fetch
    // resolves and then yanking it away once isTeamMember comes back true
    // would flash it at exactly the members it shouldn't appear for.
    if (isOpen || completed || fabDismissed || isTeamMember || teamLoading) return null;

    // Dismissing while practice data already exists needs a decision first
    // - silently hiding the button would leave that data stranded, and if
    // the user ever picks the tour back up (via Profile > Account settings)
    // it would create a second, duplicate set of practice records right
    // alongside the abandoned ones.
    const handleDismissClick = (e) => {
        e.stopPropagation();
        if (hasSavedProgress()) {
            setConfirmOpen(true);
        } else {
            dismissFab();
        }
    };

    const handleDeleteAndDismiss = async () => {
        setPurging(true);
        try {
            await tutorialDataService.purge();
            toast.success(t("inventory_tour.cleanup_success"));
        } catch {
            toast.error(t("inventory_tour.cleanup_failed"));
        } finally {
            setPurging(false);
            discardProgress();
            dismissFab();
            setConfirmOpen(false);
        }
    };

    const handleKeepAndDismiss = () => {
        // Deliberately doesn't touch the saved step/refs - reEnableFab()
        // leaves them alone too, so picking the tour back up later resumes
        // exactly where this left off instead of restarting from scratch.
        dismissFab();
        setConfirmOpen(false);
    };

    return (
        <div className="no-print fixed bottom-6 right-6 z-[1050] group">
            <button
                type="button"
                onClick={start}
                aria-label={t("inventory_tour.trigger_button")}
                className="inventory-tour-fab flex items-center gap-2 h-12 pl-4 pr-5 rounded-full border-0 cursor-pointer"
                style={{
                    background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)",
                    color: "#021314",
                    boxShadow: "0 8px 28px rgba(41,216,213,0.4)",
                }}
            >
                <CompassOutlined className="text-lg" />
                <span className="text-sm font-semibold whitespace-nowrap hidden sm:inline">
                    {t("inventory_tour.trigger_button")}
                </span>
            </button>

            <button
                type="button"
                onClick={handleDismissClick}
                aria-label={t("inventory_tour.dismiss_fab")}
                title={t("inventory_tour.dismiss_fab")}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 border-0 cursor-pointer"
                style={{
                    background: "var(--ohnix-surface-card)",
                    border: "1px solid var(--ohnix-line-4)",
                    color: "var(--ohnix-text-muted)",
                }}
            >
                <CloseOutlined style={{ fontSize: 10 }} />
            </button>

            <Modal
                open={confirmOpen}
                onCancel={() => setConfirmOpen(false)}
                footer={null}
                centered
                width={420}
                closable={!purging}
                maskClosable={!purging}
                styles={{
                    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                    content: {
                        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                        border: "1px solid var(--ohnix-line-4)",
                        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                        borderRadius: "24px",
                    },
                    body: { padding: "8px 4px" },
                }}
            >
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFCF70]/15">
                        <ExclamationCircleOutlined className="text-2xl text-[#FFCF70]" />
                    </div>
                    <h3 className="text-base font-bold text-[var(--ohnix-text-primary)] mb-2">
                        {t("inventory_tour.dismiss_confirm_title")}
                    </h3>
                    <p className="text-sm text-[var(--ohnix-text-muted)] leading-relaxed mb-6">
                        {t("inventory_tour.dismiss_confirm_desc")}
                    </p>
                    <div className="flex flex-col gap-2.5">
                        <button
                            type="button"
                            onClick={handleDeleteAndDismiss}
                            disabled={purging}
                            className="h-11 rounded-xl text-sm font-bold border-0 cursor-pointer disabled:opacity-60"
                            style={{
                                background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)",
                                color: "#021314",
                            }}
                        >
                            {purging ? t("inventory_tour.cleaning_up") : t("inventory_tour.cleanup_button")}
                        </button>
                        <button
                            type="button"
                            onClick={handleKeepAndDismiss}
                            disabled={purging}
                            className="h-11 rounded-xl text-sm font-semibold border cursor-pointer disabled:opacity-60"
                            style={{ borderColor: "var(--ohnix-line-4)", color: "var(--ohnix-text-primary)", background: "transparent" }}
                        >
                            {t("inventory_tour.keep_practice_button")}
                        </button>
                    </div>
                </div>
            </Modal>

            <style>{`
                .inventory-tour-fab {
                    animation: ohnix-tour-fab-pulse 2.4s ease-in-out infinite;
                    transition: transform 160ms ease, box-shadow 160ms ease;
                }
                .inventory-tour-fab:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 34px rgba(41,216,213,0.55);
                }
                @keyframes ohnix-tour-fab-pulse {
                    0%, 100% { box-shadow: 0 8px 28px rgba(41,216,213,0.4), 0 0 0 0 rgba(41,216,213,0.35); }
                    50% { box-shadow: 0 8px 28px rgba(41,216,213,0.4), 0 0 0 8px rgba(41,216,213,0); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .inventory-tour-fab { animation: none; }
                }
            `}</style>
        </div>
    );
};

export default InventoryTourFab;
