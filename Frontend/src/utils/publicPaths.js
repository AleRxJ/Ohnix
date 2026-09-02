// Marketing/SEO routes that ship the leaner marketingStyles.js CSS bundle
// (no antd) instead of the full application appStyles.js bundle - see
// main.jsx and App.jsx's StyleBundleSync. Kept in one place so both stay in
// sync; they used to duplicate this list and could drift apart.
export const PUBLIC_PATHS = new Set([
    "/", "/precios", "/demo", "/software-inventario-pymes",
    "/facturacion-electronica-dian", "/comparativa/ohnix-vs-alegra",
    "/colaboracion-en-equipo", "/blog",
]);

export const isPublicMarketingPath = (pathname) =>
    PUBLIC_PATHS.has(pathname) || pathname.startsWith("/blog/");
