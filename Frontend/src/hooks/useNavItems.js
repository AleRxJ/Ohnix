import { useContext, useMemo } from "react";
import AuthContext from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useDiscoveries } from "../context/DiscoveryContext";
import useSubscription from "./useSubscription";
import useI18n from "./useI18n";
import { getNavItems } from "../data";
import { ELECTRONIC_INVOICING_ENABLED } from "../config/features";

const TEAM_CAPABLE_PLANS = ["growth", "scale", "enterprise"];

// Section order for the sectioned sidebar and the command palette. Every
// item in data/index.jsx declares one of these as its `group`.
export const NAV_GROUPS = ["home", "sell", "inventory", "buy", "money", "company", "admin"];

// Same gating DashboardSidebar/MobileMenu always used (permissions, plan,
// Colombian e-invoicing state), in one place so the sidebar, the command
// palette and anything else that lists modules can't drift apart.
const useNavItems = () => {
    const { user } = useContext(AuthContext);
    const { team, hasPermission, isTeamMember, loading: teamLoading } = useTeam();
    const { openCount: openDiscoveriesCount } = useDiscoveries();
    const { plan, can, loading: planLoading } = useSubscription();
    const { t, currentLanguage } = useI18n();

    const showTeam = Boolean(team) || TEAM_CAPABLE_PLANS.includes(plan);
    const isColombian = user?.company?.countryCode === "CO";
    const showFiscalSetup = ELECTRONIC_INVOICING_ENABLED && (!user?.company || isColombian) && !isTeamMember;
    const needsFiscalSetup = showFiscalSetup && !user?.company?.electronicInvoicingEnabled;
    // Documentos electrónicos only once invoicing is actually active (see
    // the longer note that used to live in DashboardSidebar.jsx: showing it
    // for merely-Colombian companies sent them to an always-empty page).
    const showElectronicInvoicing = ELECTRONIC_INVOICING_ENABLED && isColombian && Boolean(user?.company?.electronicInvoicingEnabled);
    const showSupportDocuments = ELECTRONIC_INVOICING_ENABLED && isColombian && user?.company?.electronicInvoicingProvider === "itcycle";

    const items = useMemo(
        () =>
            getNavItems(
                t,
                user?.role,
                showElectronicInvoicing,
                showTeam,
                hasPermission,
                showSupportDocuments,
                showFiscalSetup,
                needsFiscalSetup,
                openDiscoveriesCount,
                can,
                currentLanguage
            ),
        [t, user?.role, showElectronicInvoicing, showTeam, hasPermission, showSupportDocuments, showFiscalSetup, needsFiscalSetup, openDiscoveriesCount, can, currentLanguage]
    );

    return {
        items,
        loading: teamLoading || planLoading,
        can,
        needsFiscalSetup,
        openDiscoveriesCount,
    };
};

export default useNavItems;
