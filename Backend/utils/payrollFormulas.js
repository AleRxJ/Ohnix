// Pure calculation functions for Colombian payroll (nómina) - no DB access,
// so every formula here can be unit-tested and reviewed in isolation from
// the orchestration in services/payroll.service.js. Every rate/threshold
// that the law sets ANNUALLY (SMLMV, auxilio de transporte, UVT, monthly
// work-hours divisor, fondo de solidaridad pensional brackets) is a
// parameter passed in from PayrollLegalParameter, never a constant here -
// only rates fixed by law for years at a time (ARL risk classes, overtime/
// surcharge multipliers, the 4%/12% health/pension rates, the retención en
// la fuente bracket structure) are hardcoded below.
//
// IMPORTANT: these formulas implement the general-case rules (CST, Ley 100/
// 1993, ET art. 383 procedimiento 1). Edge cases this version does NOT
// fully model: aprendices en etapa lectiva (no devengan salario, solo
// apoyo de sostenimiento con reglas propias), salario integral's exact
// seguridad-social base in every scenario, and any collective-bargaining
// agreement that changes these defaults. Have an accountant/labor lawyer
// validate against real payrolls before relying on this for filings.

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Decreto 1607 de 2002 - minimum rate per ARL risk class, applied to the
// same IBC (ingreso base de cotización) used for salud/pensión.
export const ARL_RATES_BY_RISK_LEVEL = {
    I: 0.00522,
    II: 0.01044,
    III: 0.02436,
    IV: 0.0435,
    V: 0.0696,
};

// CST art. 168/179 - multipliers applied to the ordinary hourly rate
// (baseSalary / monthlyWorkHours). *_SURCHARGE values are the recargo ONLY
// (paid on top of the ordinary hour already covered by the base salary);
// *_OVERTIME values are the full hour (ordinary + extra), since overtime
// hours are worked BEYOND the ordinary schedule and aren't in the base
// salary at all.
export const HOURLY_MULTIPLIERS = {
    overtimeDay: 1.25,
    overtimeNight: 1.75,
    nightSurcharge: 0.35,
    sundayHolidaySurcharge: 0.75,
    sundayHolidayOvertimeDay: 2.0,
    sundayHolidayOvertimeNight: 2.5,
};

// ET art. 383 (procedimiento 1) - bracket structure in UVT. This has stayed
// stable for years; only the COP value of one UVT changes annually (see
// PayrollLegalParameter.uvt). `subtractUvt` is the table's own published
// constant for each bracket, not a derived value.
const WITHHOLDING_BRACKETS_UVT = [
    { minUvt: 0, maxUvt: 95, rate: 0, subtractUvt: 0 },
    { minUvt: 95, maxUvt: 150, rate: 0.19, subtractUvt: 95 },
    { minUvt: 150, maxUvt: 360, rate: 0.28, subtractUvt: 150, addUvt: 10 },
    { minUvt: 360, maxUvt: 640, rate: 0.33, subtractUvt: 360, addUvt: 69 },
    { minUvt: 640, maxUvt: 945, rate: 0.35, subtractUvt: 640, addUvt: 162 },
    { minUvt: 945, maxUvt: 2300, rate: 0.37, subtractUvt: 945, addUvt: 268 },
    { minUvt: 2300, maxUvt: Infinity, rate: 0.39, subtractUvt: 2300, addUvt: 770 },
];

const PERIOD_DAYS = { monthly: 30, biweekly: 15, weekly: 7 };
export const daysInPeriod = (periodicity) => PERIOD_DAYS[periodicity] ?? 30;

// Every proration in Colombian payroll runs off a flat 30-day month
// regardless of periodicity or the real calendar - a daily rate derived
// this way is what makes monthly/quincenal/semanal payrolls comparable and
// is the convention every Colombian payroll system uses.
export const dailyRate = (monthlyAmount) => Number(monthlyAmount) / 30;

export const computeBasicEarning = ({ baseSalary, workedDays }) => round2(dailyRate(baseSalary) * Number(workedDays));

// Auxilio de transporte (Ley 15/1959, monto fijado anualmente) - only owed
// when the employee's full MONTHLY salary (not the prorated period amount)
// is at most 2 SMLMV, and never for a salario integral employee (already
// bundled into the agreed pay).
export const isTransportAllowanceEligible = ({ baseSalary, isIntegralSalary, smlmv }) =>
    !isIntegralSalary && Number(baseSalary) <= 2 * Number(smlmv);

export const computeTransportAllowanceEarning = ({ baseSalary, isIntegralSalary, smlmv, transportAllowance, workedDays }) =>
    isTransportAllowanceEligible({ baseSalary, isIntegralSalary, smlmv })
        ? round2(dailyRate(transportAllowance) * Number(workedDays))
        : 0;

export const hourlyRate = ({ baseSalary, monthlyWorkHours }) => Number(baseSalary) / Number(monthlyWorkHours);

// `hours` for each kind of extra/surcharge - every caller passes 0 for the
// ones that don't apply this period rather than omitting them, so the
// PayrollDocumentLine set this feeds is always the same shape.
export const computeHourlyEarnings = ({ baseSalary, monthlyWorkHours, hours }) => {
    const rate = hourlyRate({ baseSalary, monthlyWorkHours });
    const h = hours || {};
    return {
        overtimeDay: round2(rate * HOURLY_MULTIPLIERS.overtimeDay * (h.overtimeDay || 0)),
        overtimeNight: round2(rate * HOURLY_MULTIPLIERS.overtimeNight * (h.overtimeNight || 0)),
        nightSurcharge: round2(rate * HOURLY_MULTIPLIERS.nightSurcharge * (h.nightSurcharge || 0)),
        sundayHolidaySurcharge: round2(rate * HOURLY_MULTIPLIERS.sundayHolidaySurcharge * (h.sundayHolidaySurcharge || 0)),
        sundayHolidayOvertimeDay: round2(rate * HOURLY_MULTIPLIERS.sundayHolidayOvertimeDay * (h.sundayHolidayOvertimeDay || 0)),
        sundayHolidayOvertimeNight: round2(rate * HOURLY_MULTIPLIERS.sundayHolidayOvertimeNight * (h.sundayHolidayOvertimeNight || 0)),
    };
};

// IBC (ingreso base de cotización) for salud/pensión/ARL/parafiscales -
// EXCLUDES auxilio de transporte (it isn't salary) and, for a salario
// integral employee, is only 70% of the agreed pay (Ley 100/1993 art. 5
// parágrafo - the other 30% is deemed to already cover prestaciones
// sociales). Capped at 25 SMLMV either way.
export const computeIbc = ({ salarialEarnings, isIntegralSalary, smlmv }) => {
    const base = isIntegralSalary ? Number(salarialEarnings) * 0.7 : Number(salarialEarnings);
    const cap = 25 * Number(smlmv);
    return round2(Math.min(base, cap));
};

// Fondo de solidaridad pensional (Ley 100/1993 art. 27) - an extra
// percentage on top of the base 4% pensión employee contribution once the
// IBC crosses 4 SMLMV, stepped further at higher brackets. `brackets` is
// PayrollLegalParameter.pensionSolidarityBrackets, sorted ascending by
// minSmlmv; the highest bracket the IBC actually reaches wins.
export const computePensionSolidarityRate = ({ ibc, smlmv, brackets }) => {
    const ibcInSmlmv = Number(ibc) / Number(smlmv);
    const applicable = (brackets || [])
        .filter((b) => ibcInSmlmv >= Number(b.minSmlmv))
        .sort((a, b) => Number(b.minSmlmv) - Number(a.minSmlmv))[0];
    return applicable ? Number(applicable.rate) / 100 : 0;
};

export const computeDeductions = ({ ibc, smlmv, pensionSolidarityBrackets }) => {
    const health = round2(Number(ibc) * 0.04);
    const pension = round2(Number(ibc) * 0.04);
    const solidarityRate = computePensionSolidarityRate({ ibc, smlmv, brackets: pensionSolidarityBrackets });
    const pensionSolidarityFund = round2(Number(ibc) * solidarityRate);
    return { health, pension, pensionSolidarityFund };
};

// Retención en la fuente por salarios, procedimiento 1 (ET art. 383/388).
// `taxableMonthlyEarnings` must already be the FULL MONTHLY-equivalent
// gravable income (salarial earnings minus what isn't taxable - auxilio de
// transporte is exempt entirely) - the caller is responsible for scaling a
// non-monthly period up to a monthly-equivalent figure before calling this,
// since the bracket table is inherently monthly.
export const computeWithholdingTax = ({ taxableMonthlyEarnings, healthEmployee, pensionEmployee, uvt }) => {
    const afterMandatoryContributions = Math.max(Number(taxableMonthlyEarnings) - Number(healthEmployee) - Number(pensionEmployee), 0);
    // 25% renta exenta general (ET art. 206 num. 10), capped at 240 UVT/month.
    const exemptCap = 240 * Number(uvt);
    const exempt = Math.min(afterMandatoryContributions * 0.25, exemptCap);
    const taxableBase = Math.max(afterMandatoryContributions - exempt, 0);
    const baseUvt = taxableBase / Number(uvt);

    const bracket = WITHHOLDING_BRACKETS_UVT.find((b) => baseUvt > b.minUvt && baseUvt <= b.maxUvt) || WITHHOLDING_BRACKETS_UVT[0];
    if (bracket.rate === 0) return 0;

    const taxUvt = (baseUvt - bracket.subtractUvt) * bracket.rate + (bracket.addUvt || 0);
    return round2(Math.max(taxUvt, 0) * Number(uvt));
};

// Ley 1819/2016 exoneración de aportes - eligibility is a fact about the
// COMPANY (declarante de renta, etc. - Company.payrollAportesExonerados)
// combined with a per-EMPLOYEE wage threshold (< 10 SMLMV). Only salud/
// SENA/ICBF are ever exonerated; pensión, ARL and caja de compensación are
// always owed regardless.
export const isExemptFromHealthAndParafiscales = ({ companyExonerated, baseSalary, smlmv }) =>
    Boolean(companyExonerated) && Number(baseSalary) < 10 * Number(smlmv);

export const computeEmployerContributions = ({ ibc, baseSalary, smlmv, riskLevel, companyExonerated }) => {
    const exempt = isExemptFromHealthAndParafiscales({ companyExonerated, baseSalary, smlmv });
    const arlRate = ARL_RATES_BY_RISK_LEVEL[riskLevel] ?? ARL_RATES_BY_RISK_LEVEL.I;
    return {
        health: exempt ? 0 : round2(Number(ibc) * 0.085),
        pension: round2(Number(ibc) * 0.12),
        arl: round2(Number(ibc) * arlRate),
        sena: exempt ? 0 : round2(Number(ibc) * 0.02),
        icbf: exempt ? 0 : round2(Number(ibc) * 0.03),
        compensationFund: round2(Number(ibc) * 0.04),
    };
};

// Base para cesantías/prima (CST/Ley 52 de 1975) - UNLIKE the seguridad-
// social IBC above, this DOES include auxilio de transporte.
export const computeBenefitsBase = ({ salarialEarnings, transportAllowanceEarning }) =>
    round2(Number(salarialEarnings) + Number(transportAllowanceEarning));

// Monthly-equivalent provisions for the four prestaciones sociales, prorated
// by the period's actual worked days over a 360-day year (standard payroll
// convention, not 365). Skipped entirely by the caller for a salario
// integral employee - already bundled into their pay, see Employee.
// isIntegralSalary's schema comment.
export const computeBenefitAccruals = ({ benefitsBase, baseSalary, workedDays, priorSeveranceBalance }) => {
    const severance = round2(Number(benefitsBase) * 0.0833);
    const serviceBonus = round2(Number(benefitsBase) * 0.0833);
    // Intereses a las cesantías (Ley 52/1975 art. 1): 12% anual sobre el
    // saldo de cesantías, prorateado por los días de este período - using
    // the balance AFTER adding this period's own severance accrual, the
    // conventional basis.
    const severanceInterest = round2((Number(priorSeveranceBalance) + severance) * (Number(workedDays) / 360) * 0.12);
    // CST art. 186: 15 working days per 360 days worked = 1.25 days/month.
    const vacationDays = round2((Number(workedDays) / 360) * 15);
    const vacationProvision = round2(vacationDays * dailyRate(baseSalary));
    return { severance, serviceBonus, severanceInterest, vacationDays, vacationProvision };
};
