import { useState, useEffect } from "react";
import { api } from "../../api/api";
import { useDataInvalidation } from "../useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { readMirrorAll } from "../../offline/entityQueue";

export const useUnits = () => {
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchUnits = async () => {
        if (!getConnectivityState()) {
            setUnits(await readMirrorAll("units"));
            return;
        }
        try {
            setLoading(true);
            const response = await api.get("/units/available");
            if (response.data.success) {
                setUnits(response.data.data);
            }
        } catch (err) {
            console.error("Units fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUnits();
    }, []);

    useDataInvalidation("unit", fetchUnits);
    useEffect(() => subscribeSyncCompleted(fetchUnits), []);

    return { units, loading, fetchUnits };
};
