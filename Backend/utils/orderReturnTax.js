const roundMoney = (value) => Number(Number(value).toFixed(2));

export const calculateExpectedReturnedTax = ({
    quantity,
    returnedQuantity,
    unitcost,
    taxRateApplied,
    taxAmount,
}) => {
    const originalQuantity = Math.max(Number(quantity) || 0, 0);
    const returned = Math.min(Math.max(Number(returnedQuantity) || 0, 0), originalQuantity);
    const originalTax = Math.max(roundMoney(taxAmount || 0), 0);

    if (originalQuantity === 0 || returned === 0 || originalTax === 0) return 0;
    if (returned === originalQuantity) return originalTax;

    return Math.min(
        roundMoney(returned * (Number(unitcost) || 0) * (Number(taxRateApplied) || 0) / 100),
        originalTax
    );
};
