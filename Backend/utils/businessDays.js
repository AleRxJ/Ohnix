// Excludes Saturday/Sunday only - Colombian public holidays (Ley 51 de 1983
// civic calendar) are NOT excluded yet. Known Phase 1 limitation: a 3-day
// window spanning a holiday computes a deadline one day too early. Acceptable
// to defer because aceptación tácita is informational-only and never
// transmitted to DIAN (see ReceivedInvoiceReceipt.tacitaDeadlineAt's own
// schema comment) - easily corrected later by swapping this one function for
// a holiday-aware one without touching any schema or calling code.
export const addBusinessDays = (fromDate, days) => {
    const result = new Date(fromDate);
    let added = 0;
    while (added < days) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay(); // 0 = Sunday, 6 = Saturday
        if (day !== 0 && day !== 6) added += 1;
    }
    return result;
};
