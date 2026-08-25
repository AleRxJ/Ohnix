import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blogPosts } from "../src/data/blogPosts.js";
import {
    MARKETING_ROUTES,
    PRIVATE_ROUTE_PREFIXES,
    SITE_URL,
} from "./seo-routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

const today = new Date().toISOString().slice(0, 10);

const blogLastModBySlug = Object.fromEntries(
    blogPosts.map((post) => [post.slug, post.publishDate]),
);

const routePriority = (route) => {
    if (route === "/") return "1.0";
    if (
        route === "/precios"
        || route === "/software-inventario-pymes"
        || route === "/colaboracion-en-equipo"
    ) {
        return "0.9";
    }
    if (route === "/demo" || route === "/blog") return "0.8";
    return "0.7";
};

const routeChangeFreq = (route) => (
    route.startsWith("/blog/") && route !== "/blog" ? "monthly" : "weekly"
);

const routeLastMod = (route) => {
    if (route.startsWith("/blog/") && route !== "/blog") {
        const slug = route.slice("/blog/".length);
        return blogLastModBySlug[slug] || today;
    }
    return today;
};

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${MARKETING_ROUTES.map((route) => {
    const loc = `${SITE_URL}${route === "/" ? "/" : route}`;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${routeLastMod(route)}</lastmod>
    <changefreq>${routeChangeFreq(route)}</changefreq>
    <priority>${routePriority(route)}</priority>
  </url>`;
}).join("\n")}
</urlset>
`;

const robotsTxt = `User-agent: *
Allow: /

${PRIVATE_ROUTE_PREFIXES.map((path) => `Disallow: ${path}`).join("\n")}

Sitemap: ${SITE_URL}/sitemap.xml
`;

writeFileSync(join(publicDir, "sitemap.xml"), sitemapXml, "utf8");
writeFileSync(join(publicDir, "robots.txt"), robotsTxt, "utf8");

console.log(
    `[seo] Wrote sitemap.xml (${MARKETING_ROUTES.length} URLs) and robots.txt to public/`,
);
