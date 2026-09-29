// Single source of truth for indexable marketing routes used by prerender,
// sitemap generation, and robots.txt.

export const SITE_URL = "https://ohnix.co";

export const BLOG_SLUGS = [
    "como-pasar-de-excel-a-software-inventario",
    "kpis-inventario-para-pymes",
    "como-evitar-quiebres-de-stock",
    "inventario-y-ventas-sincronizados",
    "errores-comunes-implementar-software-inventario",
    "checklist-elegir-software-inventario",
];

export const MARKETING_ROUTES = [
    "/",
    "/precios",
    "/demo",
    "/agenda-demo",
    "/software-inventario-pymes",
    "/facturacion-electronica-dian",
    "/facturacion-electronica-sin-inventario",
    "/certificado-digital-dian",
    "/comparativa/ohnix-vs-alegra",
    "/colaboracion-en-equipo",
    "/deteccion-riesgos-oportunidades-negocio",
    "/integraciones",
    "/blog",
    ...BLOG_SLUGS.map((slug) => `/blog/${slug}`),
];

export const PRIVATE_ROUTE_PREFIXES = [
    "/dashboard",
    "/products",
    "/orders",
    "/purchases",
    "/customers",
    "/suppliers",
    "/categories",
    "/reports",
    "/billing",
    "/admin",
    "/profile",
    "/login",
    "/signup",
    "/email-verify",
    "/reset-password",
];
