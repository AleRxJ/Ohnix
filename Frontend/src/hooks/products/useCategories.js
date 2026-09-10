import { useState, useEffect } from "react";
import { api } from "../../api/api";
import { useDataInvalidation } from "../useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { readMirrorAll } from "../../offline/entityQueue";

export const useCategories = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);

    // Same underlying rows as the full CRUD hook's "categories" mirror
    // (both endpoints filter to this account's own categories) - offline,
    // there's only one local copy to read from regardless of which online
    // endpoint a caller would otherwise have used.
    const fetchCategories = async () => {
        if (!getConnectivityState()) {
            setCategories(await readMirrorAll("categories"));
            return;
        }
        try {
            setLoading(true);
            const response = await api.get("/categories/available");
            if (response.data.success) {
                setCategories(response.data.data);
            }
        } catch (err) {
            if (!err.response) {
                setCategories(await readMirrorAll("categories"));
                return;
            }
            console.error("Categories fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserCategories = async () => {
        try {
            setLoading(true);
            const response = await api.get("/categories/user");
            if (response.data.success) {
                setCategories(response.data.data);
            }
        } catch (err) {
            console.error("User categories fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    useDataInvalidation("category", fetchCategories);
    useEffect(() => subscribeSyncCompleted(fetchCategories), []);

    return { categories, loading, fetchCategories, fetchUserCategories };
};
