// DIAN check-digit ("dígito de verificación") algorithm for Colombian NIT
// numbers - Resolución 000012 de 2021, Anexo Técnico. Weights are fixed and
// applied right-to-left; not configurable per provider.
const DIAN_NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export const computeNitCheckDigit = (nit) => {
    const digits = `${nit || ""}`.replace(/\D/g, "");
    if (!digits) return null;

    let sum = 0;
    for (let i = 0; i < digits.length && i < DIAN_NIT_WEIGHTS.length; i += 1) {
        const digit = Number(digits[digits.length - 1 - i]);
        sum += digit * DIAN_NIT_WEIGHTS[i];
    }

    const remainder = sum % 11;
    const checkDigit = remainder > 1 ? 11 - remainder : remainder;
    return `${checkDigit}`;
};
