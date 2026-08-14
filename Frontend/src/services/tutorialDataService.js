import { api } from "../api/api";

export const tutorialDataService = {
    purge: async () => {
        const response = await api.delete("/tutorial-data");
        return response.data;
    },
};
