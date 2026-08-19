export const FILTER_OPTIONS = {
    ALL: "all",
    MINE: "mine",
    OTHERS: "others",
};

export const PAGINATION_CONFIG = {
    pageSize: 10,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
};

export const TABLE_SCROLL_CONFIG = {
    x: 600,
};

export const getFormRules = (t) => ({
    CATEGORY_NAME: [
        { required: true, message: t("categories.category_name_required") },
        { min: 2, message: t("categories.category_name_min_length") },
        { max: 50, message: t("categories.category_name_max_length") },
    ],
    UNIT_NAME: [
        { required: true, message: t("units.unit_name_required") },
        { min: 1, message: t("units.unit_name_min_length") },
        { max: 20, message: t("units.unit_name_max_length") },
    ],
});

export const MODAL_WIDTH = {
    FORM: 500,
    VIEW: 600,
};
