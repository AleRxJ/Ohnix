import { getChartAccountMap, resolveCashAccountChartAccount } from "./chartOfAccounts.service.js";
import { recordJournalEntry } from "./journalEntry.service.js";

export const getLineCostBasis = (line) => Number(line.costBasisApplied ?? line.buyingPrice ?? 0);
const round2 = (value) => Number(Number(value).toFixed(2));

// Decomposes a TOTAL (what actually left/entered the cash account - already
// includes VAT, if any) into its pre-tax base and the VAT amount. This is
// the opposite direction from computePurchaseItemTax (purchase.service.js),
// which starts from a pre-tax unit price and adds VAT on top - there's no
// pre-tax "list price" for a manual expense/income or a recurring expense
// template, only the amount a business owner actually pays or receives, so
// that's what's entered and this backs the split out of it.
export const decomposeInclusiveTax = (total, treatment, rate) => {
    if (treatment !== "taxed" || !rate) return { base: round2(total), taxAmount: 0 };
    const base = round2(total / (1 + Number(rate) / 100));
    return { base, taxAmount: round2(total - base) };
};
export const buildAccountingThirdParty = (type, entity) => entity ? ({
    type,
    id: entity.id,
    name: entity.name,
    document: entity.identification || null,
}) : null;
const withThirdParty = (lines, thirdParty, controlAccountId) => {
    if (!thirdParty) return lines;
    const dimension = {
        thirdPartyType: thirdParty.type,
        thirdPartyId: thirdParty.id || null,
        thirdPartyName: thirdParty.name,
        thirdPartyDocument: thirdParty.document || null,
    };
    return lines.map((line) => line.chartAccountId === controlAccountId ? ({ ...line, ...dimension }) : line);
};
export const resolveLocationCostCenter = async (tx, accountId, pointOfSaleId) => {
    if (!pointOfSaleId) return null;
    const location = await tx.pointOfSale.findFirst({
        where: { id: pointOfSaleId, accountId },
        select: { defaultCostCenter: { select: { id: true, isActive: true } } },
    });
    return location?.defaultCostCenter?.isActive ? location.defaultCostCenter.id : null;
};
const withCostCenter = (lines, costCenterId) => costCenterId
    ? lines.map((line) => ({ ...line, costCenterId }))
    : lines;
export const applyLocationCostCenter = async (tx, accountId, pointOfSaleId, lines) =>
    withCostCenter(lines, await resolveLocationCostCenter(tx, accountId, pointOfSaleId));

export const calculatePurchaseReturnValues = (lines) => {
    let refundBase = 0;
    let taxTotal = 0;
    let inventoryTotal = 0;
    for (const line of lines) {
        const lineTotal = Number(line.quantity) * Number(line.unitcost);
        refundBase += lineTotal;
        taxTotal += round2((lineTotal * Number(line.taxRateApplied)) / 100);
        inventoryTotal += Number(line.inventoryCostApplied ?? lineTotal);
    }
    refundBase = round2(refundBase);
    taxTotal = round2(taxTotal);
    inventoryTotal = round2(inventoryTotal);
    return { refundBase, taxTotal, inventoryTotal, variance: round2(refundBase - inventoryTotal) };
};

export const postInventoryAdjustmentJournalEntry = async (
    tx,
    { accountId, createdById, movementId, valueDelta, reason, entryDate = new Date() }
) => {
    const amount = Math.abs(round2(valueDelta));
    if (amount === 0) return null;
    const coa = await getChartAccountMap(tx, accountId);
    const increase = Number(valueDelta) > 0;
    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Ajuste de inventario: ${reason}`,
        sourceType: "inventory_adjustment",
        sourceId: movementId,
        lines: increase
            ? [
                  { chartAccountId: coa.get("1435").id, debit: amount, credit: 0 },
                  { chartAccountId: coa.get("4295").id, debit: 0, credit: amount },
              ]
            : [
                  { chartAccountId: coa.get("5195").id, debit: amount, credit: 0 },
                  { chartAccountId: coa.get("1435").id, debit: 0, credit: amount },
              ],
    });
};

// Only the labor/overhead entered on the order gets journaled - the raw
// materials' cost simply moves from one 1435 balance to another within the
// same account (claimLocationStockWithCost's -materialsCost and
// creditLocationStockWithCost's +materialsCost-as-part-of-unitCostApplied
// cancel out), so a materials-only run has no accounting effect to record
// at all. See ProductionOrder's schema comment and the new 2335 chart
// account's comment for why this is a liability, not an expense/cost line.
export const postProductionJournalEntry = async (
    tx,
    { accountId, createdById, order, entryDate = new Date() }
) => {
    const laborCost = round2(order.laborCost);
    const overheadCost = round2(order.overheadCost);
    const applied = round2(laborCost + overheadCost);
    if (applied === 0) return null;

    const coa = await getChartAccountMap(tx, accountId);
    const costCenterId = await resolveLocationCostCenter(tx, accountId, order.pointOfSaleId);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Producción de ${order.quantity} unidad(es)`,
        sourceType: "production",
        sourceId: order.id,
        lines: withCostCenter(
            [
                { chartAccountId: coa.get("1435").id, debit: applied, credit: 0 },
                ...(laborCost > 0 ? [{ chartAccountId: coa.get("2335").id, debit: 0, credit: laborCost, description: "Mano de obra directa" }] : []),
                ...(overheadCost > 0 ? [{ chartAccountId: coa.get("2335").id, debit: 0, credit: overheadCost, description: "Costos indirectos de fabricación" }] : []),
            ],
            costCenterId
        ),
    });
};

// Exact mirror-image reversal of the entry above - only ever posted
// alongside cancelProductionOrder undoing a completed run whose
// postProductionJournalEntry actually fired (applied > 0).
export const postProductionReversalJournalEntry = async (
    tx,
    { accountId, createdById, order, entryDate = new Date() }
) => {
    const laborCost = round2(order.laborCost);
    const overheadCost = round2(order.overheadCost);
    const applied = round2(laborCost + overheadCost);
    if (applied === 0) return null;

    const coa = await getChartAccountMap(tx, accountId);
    const costCenterId = await resolveLocationCostCenter(tx, accountId, order.pointOfSaleId);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Reversión de producción de ${order.quantity} unidad(es)`,
        sourceType: "production_reversal",
        sourceId: order.id,
        lines: withCostCenter(
            [
                ...(laborCost > 0 ? [{ chartAccountId: coa.get("2335").id, debit: laborCost, credit: 0, description: "Mano de obra directa" }] : []),
                ...(overheadCost > 0 ? [{ chartAccountId: coa.get("2335").id, debit: overheadCost, credit: 0, description: "Costos indirectos de fabricación" }] : []),
                { chartAccountId: coa.get("1435").id, debit: 0, credit: applied },
            ],
            costCenterId
        ),
    });
};

// Employee-withheld health/pensión/fondo de solidaridad and the employer's
// own health/pensión/ARL share the SAME payable account (2530) - both get
// remitted together through PILA to the same operators, so splitting them
// into two liability accounts would just be a distinction the balance sheet
// never needs. SENA/ICBF/caja get their own (2531) since they're a
// different legal category (parafiscales, not seguridad social) even
// though they're paid through the same PILA form. See
// payroll.service.js#calculatePayrollPeriod for how `documents` accumulates
// these totals from each employee's own PayrollDocumentLine rows.
export const postPayrollJournalEntry = async (
    tx,
    { accountId, createdById, period, totals, costCenterId, entryDate = new Date() }
) => {
    const coa = await getChartAccountMap(tx, accountId);
    const {
        grossEarnings,
        employeeSocialSecurity,
        withholdingTax,
        netPay,
        employerSocialSecurity,
        employerParafiscal,
        severanceProvision,
        severanceInterestProvision,
        serviceBonusProvision,
        vacationProvision,
    } = totals;

    const employerContributionsExpense = round2(employerSocialSecurity + employerParafiscal);
    const benefitsExpense = round2(severanceProvision + severanceInterestProvision + serviceBonusProvision + vacationProvision);

    const lines = [
        { chartAccountId: coa.get("5105").id, debit: grossEarnings, credit: 0 },
        { chartAccountId: coa.get("2530").id, debit: 0, credit: round2(employeeSocialSecurity + employerSocialSecurity) },
        { chartAccountId: coa.get("2505").id, debit: 0, credit: netPay },
    ];
    if (withholdingTax > 0) {
        lines.push({ chartAccountId: coa.get("2370").id, debit: 0, credit: withholdingTax });
    }
    if (employerContributionsExpense > 0) {
        lines.push({ chartAccountId: coa.get("5120").id, debit: employerContributionsExpense, credit: 0 });
    }
    if (employerParafiscal > 0) {
        lines.push({ chartAccountId: coa.get("2531").id, debit: 0, credit: employerParafiscal });
    }
    if (benefitsExpense > 0) {
        lines.push({ chartAccountId: coa.get("5115").id, debit: benefitsExpense, credit: 0 });
    }
    if (severanceProvision > 0) lines.push({ chartAccountId: coa.get("2510").id, debit: 0, credit: severanceProvision });
    if (severanceInterestProvision > 0) lines.push({ chartAccountId: coa.get("2515").id, debit: 0, credit: severanceInterestProvision });
    if (serviceBonusProvision > 0) lines.push({ chartAccountId: coa.get("2520").id, debit: 0, credit: serviceBonusProvision });
    if (vacationProvision > 0) lines.push({ chartAccountId: coa.get("2525").id, debit: 0, credit: vacationProvision });

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Nómina ${period.periodicity} ${period.startDate.toISOString().slice(0, 10)} - ${period.endDate.toISOString().slice(0, 10)}`,
        sourceType: "payroll",
        sourceId: period.id,
        lines: withCostCenter(lines, costCenterId),
    });
};

// "Mark paid" only settles what actually gets paid out alongside net pay
// (salarios + los aportes de ese mismo período vía PILA) - cesantías,
// intereses, prima y vacaciones stay provisioned liabilities until their
// own settlement event (postBenefitSettlementJournalEntry below), since
// those follow their own legal payment calendar, not the payroll's.
export const postPayrollPaymentJournalEntry = async (
    tx,
    { accountId, createdById, period, totals, cashAccount, costCenterId, entryDate = new Date() }
) => {
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
    const { netPay, employeeSocialSecurity, employerSocialSecurity, employerParafiscal, withholdingTax } = totals;
    const socialSecurity = round2(employeeSocialSecurity + employerSocialSecurity);
    const total = round2(netPay + socialSecurity + employerParafiscal + withholdingTax);
    if (total <= 0) return null;

    const lines = [{ chartAccountId: coa.get("2505").id, debit: netPay, credit: 0 }];
    if (socialSecurity > 0) lines.push({ chartAccountId: coa.get("2530").id, debit: socialSecurity, credit: 0 });
    if (employerParafiscal > 0) lines.push({ chartAccountId: coa.get("2531").id, debit: employerParafiscal, credit: 0 });
    if (withholdingTax > 0) lines.push({ chartAccountId: coa.get("2370").id, debit: withholdingTax, credit: 0 });
    lines.push({ chartAccountId: cashChartAccountId, debit: 0, credit: total });

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Pago de nómina ${period.periodicity} ${period.startDate.toISOString().slice(0, 10)} - ${period.endDate.toISOString().slice(0, 10)}`,
        sourceType: "payroll_payment",
        sourceId: period.id,
        lines: withCostCenter(lines, costCenterId),
    });
};

const BENEFIT_ACCRUAL_ACCOUNT_CODE = {
    severance: "2510",
    severance_interest: "2515",
    service_bonus: "2520",
    vacation: "2525",
};

// Settles a PayrollBenefitSettlement (prima de junio/diciembre, cesantías
// anuales) - debits the provision liability that's been accumulating since
// it was accrued (see postPayrollJournalEntry above), credits the cash
// account that actually paid it. No expense line here: the expense was
// already recognized when the provision was accrued, this is purely a
// balance-sheet settlement.
export const postBenefitSettlementJournalEntry = async (
    tx,
    { accountId, createdById, settlement, cashAccount, entryDate = new Date() }
) => {
    const amount = round2(settlement.amount);
    if (amount <= 0) return null;
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
    const liabilityAccountId = coa.get(BENEFIT_ACCRUAL_ACCOUNT_CODE[settlement.type]).id;

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Liquidación de ${settlement.type} - ${settlement.year}${settlement.semester ? ` S${settlement.semester}` : ""}`,
        sourceType: "payroll_benefit_settlement",
        sourceId: settlement.id,
        lines: [
            { chartAccountId: liabilityAccountId, debit: amount, credit: 0 },
            { chartAccountId: cashChartAccountId, debit: 0, credit: amount },
        ],
    });
};

// Consolidated "acta de liquidación" entry - see
// payrollTermination.service.js#settleTermination. Unlike
// postBenefitSettlementJournalEntry (which only ever settles ONE already-
// provisioned liability), this drains however many of the four prestación
// accounts actually had a pending balance, in the SAME entry, plus an
// expense line for indemnización (5116) when one was paid - indemnización
// is never provisioned month-to-month the way the other four are, so it has
// no liability leg to debit, only a fresh expense.
export const postTerminationSettlementJournalEntry = async (
    tx,
    { accountId, createdById, settlement, employeeName, cashAccount, entryDate = new Date() }
) => {
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);

    const lines = [];
    const addLiabilityDebit = (code, amount) => {
        if (round2(amount) > 0) lines.push({ chartAccountId: coa.get(code).id, debit: round2(amount), credit: 0 });
    };
    addLiabilityDebit("2510", settlement.severanceAmount);
    addLiabilityDebit("2515", settlement.severanceInterestAmount);
    addLiabilityDebit("2520", settlement.serviceBonusAmount);
    addLiabilityDebit("2525", settlement.vacationAmount);
    if (round2(settlement.indemnityAmount) > 0) {
        lines.push({ chartAccountId: coa.get("5116").id, debit: round2(settlement.indemnityAmount), credit: 0 });
    }

    const total = round2(lines.reduce((sum, line) => sum + line.debit, 0));
    if (total <= 0) return null;
    lines.push({ chartAccountId: cashChartAccountId, debit: 0, credit: total });

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Liquidación definitiva - ${employeeName || settlement.employeeId}`,
        sourceType: "payroll_termination_settlement",
        sourceId: settlement.id,
        lines,
    });
};

export const postTransferDiscrepancyJournalEntry = async (
    tx,
    { accountId, createdById, transferId, amount, entryDate = new Date() }
) => {
    const loss = round2(amount);
    if (loss <= 0) return null;
    const coa = await getChartAccountMap(tx, accountId);
    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description: `Faltante en traslado ${transferId}`,
        sourceType: "transfer_discrepancy",
        sourceId: transferId,
        lines: [
            { chartAccountId: coa.get("5195").id, debit: loss, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: 0, credit: loss },
        ],
    });
};

// The only file that knows "which PUC account, which side" for each of the
// 4 events this phase covers - order.service.js/purchase.service.js/
// orderPayment.service.js/purchasePayment.service.js each just make one
// clean call here instead of embedding chart-of-accounts knowledge inline.

export const postOrderSaleJournalEntry = async (tx, { accountId, createdById, order, cogs, thirdParty }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const costCenterId = await resolveLocationCostCenter(tx, accountId, order.pointOfSaleId);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: order.orderDate,
        description: `Venta ${order.invoiceNo}`,
        sourceType: "order_sale",
        sourceId: order.id,
        lines: withCostCenter(withThirdParty([
            { chartAccountId: coa.get("1305").id, debit: order.total, credit: 0 },
            { chartAccountId: coa.get("4135").id, debit: 0, credit: order.subTotal },
            { chartAccountId: coa.get("240805").id, debit: 0, credit: order.gst },
            { chartAccountId: coa.get("6135").id, debit: cogs, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: 0, credit: cogs },
        ], thirdParty, coa.get("1305").id), costCenterId),
    });
};

export const postPurchaseJournalEntry = async (tx, { accountId, createdById, purchase, totals, retentions = [], thirdParty }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const costCenterId = await resolveLocationCostCenter(tx, accountId, purchase.pointOfSaleId);
    const total = Number(totals.total || 0);
    const taxAmount = Number(totals.taxAmount || 0);
    const withheldTotal = round2(retentions.reduce((sum, retention) => sum + Number(retention.withheldAmount || 0), 0));
    const payable = round2(total + taxAmount - withheldTotal);
    if (payable < 0) throw new Error("Purchase withholdings cannot exceed the gross purchase total");

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: purchase.purchaseDate,
        description: `Compra ${purchase.purchaseNo}`,
        sourceType: "purchase",
        sourceId: purchase.id,
        lines: withCostCenter(withThirdParty([
            { chartAccountId: coa.get("1435").id, debit: total, credit: 0 },
            { chartAccountId: coa.get("240810").id, debit: taxAmount, credit: 0 },
            { chartAccountId: coa.get("2205").id, debit: 0, credit: payable },
            ...retentions.filter((retention) => Number(retention.withheldAmount) > 0).map((retention) => ({
                chartAccountId: retention.chartAccountId,
                debit: 0,
                credit: Number(retention.withheldAmount),
                description: `${retention.conceptCode} - ${retention.conceptName}`,
            })),
        ], thirdParty, coa.get("2205").id), costCenterId),
    });
};

// Fase 4 (multi-moneda): `payment.exchangeRateDifference` is 0 for every COP
// payment (unchanged behavior - cash moves by `payment.amount`, 1305 clears
// by that same amount). For a foreign-currency order settled with a
// different COP amount than what was booked at the invoice's frozen rate
// (see orderPayment.service.js#registerOrderPayment), 1305 clears by
// exactly the RECEIVABLE that was cleared (`payment.amount -
// exchangeRateDifference`), never by the cash amount itself, and the gap
// goes to 4210 (ganancia) or 5305 (pérdida) - same "credit revenue / debit
// expense depending on the sign" branching postPurchaseReturnJournalEntry
// already uses for its own variance.
// Fase 5 (causación automática) - `feeAmount` is 0 unless the payment was
// registered against a PaymentMethod with a configured commission (see
// orderPayment.service.js#registerOrderPayment). It never touches
// clearedReceivable (1305 still clears by the FULL sale amount - the
// customer paid the invoice in full, the commission is Ohnix's own cost,
// not a discount) - only the cash leg shrinks to what actually landed in
// the bank after the processor's cut, with the difference debited to the
// method's own expense account. Purely additive on the debit side (cash
// down, expense up by the same amount), so it never disturbs the FX
// gain/loss balancing above - both can coexist in the same entry.
export const postOrderPaymentJournalEntry = async (tx, { accountId, createdById, payment, cashAccount, order, thirdParty }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
    const costCenterId = await resolveLocationCostCenter(tx, accountId, order.pointOfSaleId);
    // Prisma Decimal's `valueOf()` returns a STRING - `-` still forces
    // numeric coercion regardless, but `+` below would silently do string
    // concatenation instead of addition if fed a raw Decimal. Converting
    // once here avoids that footgun for every line below.
    const paymentAmount = Number(payment.amount);
    const fxDifference = round2(payment.exchangeRateDifference || 0);
    const clearedReceivable = round2(paymentAmount - fxDifference);
    const feeAmount = round2(payment.feeAmount || 0);
    // Retenciones sufridas: the customer settled `amount` in full but kept
    // these back for the DIAN - they never reach the cash account, they're
    // an anticipo de impuestos instead (see OrderPayment's schema comment).
    const withholdings = [
        ["135515", round2(payment.withheldIncomeTax || 0)],
        ["135517", round2(payment.withheldVat || 0)],
        ["135518", round2(payment.withheldIca || 0)],
    ].filter(([, value]) => value > 0);
    const withheldTotal = round2(withholdings.reduce((sum, [, value]) => sum + value, 0));
    const cashDelta = round2(paymentAmount - feeAmount - withheldTotal);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: payment.paidAt,
        description: `Pago de pedido ${order.invoiceNo}`,
        sourceType: "order_payment",
        sourceId: payment.id,
        lines: withCostCenter(withThirdParty([
            { chartAccountId: cashChartAccountId, debit: cashDelta, credit: 0 },
            { chartAccountId: coa.get("1305").id, debit: 0, credit: clearedReceivable },
            ...(fxDifference > 0 ? [{ chartAccountId: coa.get("4210").id, debit: 0, credit: fxDifference }] : []),
            ...(fxDifference < 0 ? [{ chartAccountId: coa.get("5305").id, debit: -fxDifference, credit: 0 }] : []),
            ...(feeAmount > 0 ? [{ chartAccountId: payment.paymentMethod.expenseAccountId, debit: feeAmount, credit: 0 }] : []),
            // Tagged with the customer too: who withheld is what a
            // certificado de retención / exógena needs to reconcile against.
            ...withholdings.map(([code, value]) => ({
                chartAccountId: coa.get(code).id,
                debit: value,
                credit: 0,
                ...(thirdParty ? { thirdPartyType: thirdParty.type, thirdPartyId: thirdParty.id || null, thirdPartyName: thirdParty.name, thirdPartyDocument: thirdParty.document || null } : {}),
            })),
        ], thirdParty, coa.get("1305").id), costCenterId),
    });
};

export const postPurchasePaymentJournalEntry = async (tx, { accountId, createdById, payment, cashAccount, purchase, thirdParty }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const cashChartAccountId = await resolveCashAccountChartAccount(tx, accountId, cashAccount);
    const costCenterId = await resolveLocationCostCenter(tx, accountId, purchase.pointOfSaleId);
    // See postOrderPaymentJournalEntry's matching comment on why this gets
    // converted once up front (a raw Decimal fed into `+` below would
    // silently string-concatenate instead of adding).
    const paymentAmount = Number(payment.amount);
    const fxDifference = round2(payment.exchangeRateDifference || 0);
    const clearedPayable = round2(paymentAmount - fxDifference);
    // Opposite direction from the order side: paying a supplier via a
    // method with a fee costs MORE cash than the payable itself (the fee is
    // an extra cost on top, not deducted from what the supplier receives).
    const feeAmount = round2(payment.feeAmount || 0);
    const cashDelta = round2(paymentAmount + feeAmount);

    // Opposite sign meaning from the order side above: here `fxDifference`
    // is `amount paid - payable booked`, so paying MORE than what was
    // booked (fxDifference > 0) is a PÉRDIDA (we spent more COP than
    // expected settling a payable), not a gain - flipped debit/credit vs.
    // postOrderPaymentJournalEntry's receivable-side branching.
    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate: payment.paidAt,
        description: `Pago de compra ${purchase.purchaseNo}`,
        sourceType: "purchase_payment",
        sourceId: payment.id,
        lines: withCostCenter(withThirdParty([
            { chartAccountId: coa.get("2205").id, debit: clearedPayable, credit: 0 },
            { chartAccountId: cashChartAccountId, debit: 0, credit: cashDelta },
            ...(fxDifference > 0 ? [{ chartAccountId: coa.get("5305").id, debit: fxDifference, credit: 0 }] : []),
            ...(fxDifference < 0 ? [{ chartAccountId: coa.get("4210").id, debit: 0, credit: -fxDifference }] : []),
            ...(feeAmount > 0 ? [{ chartAccountId: payment.paymentMethod.expenseAccountId, debit: feeAmount, credit: 0 }] : []),
        ], thirdParty, coa.get("2205").id), costCenterId),
    });
};

// Fase 4b - reversal for order_cancellation/order_return/credit_note_restock.
// `lines` is one entry per returned/cancelled OrderDetail line in this call:
// [{ quantity, unitcost, taxRateApplied, buyingPrice }]. Exact mirror-flip of
// postOrderSaleJournalEntry, line for line: Cr Clientes (reduce what's owed)
// / Dr Ingresos (reduce recorded revenue) / Dr IVA generado (reduce tax
// owed) / Dr Inventarios (goods back) / Cr Costo de ventas (reduce recorded
// cost) - same live-buyingPrice simplification as the forward posting (no
// historical cost layers anywhere in this codebase).
export const postOrderReturnJournalEntry = async (tx, { accountId, createdById, sourceType, sourceId, entryDate, description, lines, thirdParty, pointOfSaleId }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const costCenterId = await resolveLocationCostCenter(tx, accountId, pointOfSaleId);

    let refundTotal = 0;
    let taxTotal = 0;
    let cogsTotal = 0;
    for (const line of lines) {
        const lineRefund = line.quantity * Number(line.unitcost);
        refundTotal += lineRefund;
        taxTotal += Number(((lineRefund * Number(line.taxRateApplied)) / 100).toFixed(2));
        cogsTotal += line.quantity * getLineCostBasis(line);
    }
    refundTotal = Number(refundTotal.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));
    cogsTotal = Number(cogsTotal.toFixed(2));

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description,
        sourceType,
        sourceId,
        lines: withCostCenter(withThirdParty([
            { chartAccountId: coa.get("1305").id, debit: 0, credit: refundTotal + taxTotal },
            { chartAccountId: coa.get("4135").id, debit: refundTotal, credit: 0 },
            { chartAccountId: coa.get("240805").id, debit: taxTotal, credit: 0 },
            { chartAccountId: coa.get("1435").id, debit: cogsTotal, credit: 0 },
            { chartAccountId: coa.get("6135").id, debit: 0, credit: cogsTotal },
        ], thirdParty, coa.get("1305").id), costCenterId),
    });
};

// Fase 4b - reversal for purchase_return. `lines`: [{ quantity, unitcost,
// taxRateApplied }] - no COGS/buyingPrice line, purchases have no
// cost-of-sale concept. Mirror-flip of postPurchaseJournalEntry: Dr
// Proveedores (reduce what's owed) / Cr Inventarios (goods out) / Cr IVA
// descontable (reduce credit claimed).
export const postPurchaseReturnJournalEntry = async (tx, { accountId, createdById, sourceId, entryDate, description, lines, retentionReturns = [], thirdParty, pointOfSaleId }) => {
    const coa = await getChartAccountMap(tx, accountId);
    const costCenterId = await resolveLocationCostCenter(tx, accountId, pointOfSaleId);

    const { refundBase: total, taxTotal, inventoryTotal, variance } = calculatePurchaseReturnValues(lines);
    const withholdingReversal = round2(retentionReturns.reduce((sum, retention) => sum + Number(retention.withheldNow || 0), 0));
    const supplierDebit = round2(total + taxTotal - withholdingReversal);

    return recordJournalEntry(tx, {
        accountId,
        createdById,
        entryDate,
        description,
        sourceType: "purchase_return",
        sourceId,
        lines: withCostCenter(withThirdParty([
            { chartAccountId: coa.get("2205").id, debit: supplierDebit, credit: 0 },
            ...retentionReturns.filter((retention) => Number(retention.withheldNow) > 0).map((retention) => ({
                chartAccountId: retention.chartAccountId,
                debit: Number(retention.withheldNow),
                credit: 0,
                description: `Reversa ${retention.conceptCode} - ${retention.conceptName}`,
            })),
            { chartAccountId: coa.get("1435").id, debit: 0, credit: inventoryTotal },
            { chartAccountId: coa.get("240810").id, debit: 0, credit: taxTotal },
            ...(variance > 0
                ? [{ chartAccountId: coa.get("4295").id, debit: 0, credit: variance }]
                : variance < 0
                  ? [{ chartAccountId: coa.get("5195").id, debit: -variance, credit: 0 }]
                  : []),
        ], thirdParty, coa.get("2205").id), costCenterId),
    });
};
