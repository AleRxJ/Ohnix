// Default cash account for a payment method: same type (cash drawer vs bank)
// at this point of sale first, then a company-wide one, then anything active.
export const pickAccount = (cashAccounts, accountType, pointOfSaleId) => {
    const ofType = cashAccounts.filter((a) => a.is_active !== false && (!accountType || a.account_type === accountType));
    const pool = ofType.length ? ofType : cashAccounts.filter((a) => a.is_active !== false);
    return (
        pool.find((a) => pointOfSaleId && String(a.point_of_sale?._id) === String(pointOfSaleId)) ||
        pool.find((a) => !a.point_of_sale?._id) ||
        pool[0] ||
        null
    );
};
