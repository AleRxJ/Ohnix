import { useEffect, useState } from "react";
import { pointOfSaleService } from "../../services/pointOfSaleService";
import { getConnectivityState } from "../../offline/connectivity";
import { readMirrorAll } from "../../offline/entityQueue";
import { subscribeSyncCompleted } from "../../offline/syncEngine";

// Where the Caja can sell: active, in the actor's own scope, and a store
// (a bodega/distribution center doesn't serve walk-in customers - same rule
// as PointOfSaleField's salesOnly). Unlike usePointOfSaleFieldVisible this is
// NOT gated on the multiLocation plan feature: the Caja must always send an
// explicit pointOfSaleId, so it needs the real list even when the plan hides
// the selector. Falls back to any active in-scope location if the account
// has no store-type one.
const pickSelling = (rows) => {
    const own = (rows || []).filter((pos) => pos.isActive && pos.inOwnScope !== false);
    const stores = own.filter((pos) => !pos.locationType || pos.locationType === "point_of_sale");
    return (stores.length ? stores : own).map((pos) => ({ id: pos.id, name: pos.name }));
};

export const usePosLocations = () => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            let rows = [];
            try {
                rows = getConnectivityState() ? (await pointOfSaleService.list())?.data : await readMirrorAll("pointsOfSale");
            } catch (error) {
                if (!error.response) rows = await readMirrorAll("pointsOfSale");
            }
            if (!cancelled) {
                setLocations(pickSelling(rows));
                setLoading(false);
            }
        };
        load();
        const unsubscribe = subscribeSyncCompleted(load);
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    return { locations, loading };
};
