import { useEffect, useState } from "react";
import { pointOfSaleService } from "../services/pointOfSaleService";

// Whether the current viewer can see every one of the account's active
// locations (owner, admin, or a member explicitly granted posScopeAll -
// see Backend/middleware/pos.permissions.js#assertFullPosScope) and
// whether there's more than one to even choose between. Re-derives this
// from the same `inOwnScope` flag the backend already computes per
// location (GET /points-of-sale) rather than trying to read posScopeAll
// off the client's own auth state, which isn't currently exposed there.
//
// Used to decide whether to offer location-management actions at all -
// e.g. "move this customer to another point of sale" only makes sense (and
// only succeeds server-side) for someone who qualifies as full-scope.
export const usePointOfSaleScope = () => {
    const [pointsOfSale, setPointsOfSale] = useState([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        pointOfSaleService
            .list()
            .then((res) => setPointsOfSale((res?.data || []).filter((pos) => pos.isActive)))
            .catch(() => setPointsOfSale([]))
            .finally(() => setLoaded(true));
    }, []);

    const isFullScope = pointsOfSale.length > 0 && pointsOfSale.every((pos) => pos.inOwnScope);
    const hasMultipleLocations = pointsOfSale.length > 1;

    return { pointsOfSale, loaded, isFullScope, hasMultipleLocations };
};
