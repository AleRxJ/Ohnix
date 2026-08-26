// DIVIPOLA department-level codes (DANE) - the 32 departments plus Bogotá
// D.C. as its own special district, 33 entries total. This list is fixed
// and hasn't changed in decades, unlike municipality-level codes (1100+,
// too many to embed here with full confidence) - see
// ElectronicInvoicingSettings.jsx for why municipality stays free-text with
// a cross-field consistency check instead of a full DIVIPOLA picker.
export const COLOMBIA_DEPARTMENTS = [
    { code: "05", name: "Antioquia" },
    { code: "08", name: "Atlántico" },
    { code: "11", name: "Bogotá, D.C." },
    { code: "13", name: "Bolívar" },
    { code: "15", name: "Boyacá" },
    { code: "17", name: "Caldas" },
    { code: "18", name: "Caquetá" },
    { code: "19", name: "Cauca" },
    { code: "20", name: "Cesar" },
    { code: "23", name: "Córdoba" },
    { code: "25", name: "Cundinamarca" },
    { code: "27", name: "Chocó" },
    { code: "41", name: "Huila" },
    { code: "44", name: "La Guajira" },
    { code: "47", name: "Magdalena" },
    { code: "50", name: "Meta" },
    { code: "52", name: "Nariño" },
    { code: "54", name: "Norte de Santander" },
    { code: "63", name: "Quindío" },
    { code: "66", name: "Risaralda" },
    { code: "68", name: "Santander" },
    { code: "70", name: "Sucre" },
    { code: "73", name: "Tolima" },
    { code: "76", name: "Valle del Cauca" },
    { code: "81", name: "Arauca" },
    { code: "85", name: "Casanare" },
    { code: "86", name: "Putumayo" },
    { code: "88", name: "Archipiélago de San Andrés, Providencia y Santa Catalina" },
    { code: "91", name: "Amazonas" },
    { code: "94", name: "Guainía" },
    { code: "95", name: "Guaviare" },
    { code: "97", name: "Vaupés" },
    { code: "99", name: "Vichada" },
];

export const findDepartmentName = (code) => COLOMBIA_DEPARTMENTS.find((d) => d.code === code)?.name || "";
