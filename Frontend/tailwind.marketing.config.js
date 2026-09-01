import baseConfig from "./tailwind.config.js";

export default {
  ...baseConfig,
  content: [
    "./index.html",
    "./src/pages/LandingPage.jsx",
    "./src/pages/Precios.jsx",
    "./src/pages/Demo.jsx",
    "./src/pages/SoftwareInventarioPymes.jsx",
    "./src/pages/FacturacionElectronica.jsx",
    "./src/pages/OhnixVsAlegra.jsx",
    "./src/pages/ColaboracionEquipo.jsx",
    "./src/pages/Blog.jsx",
    "./src/pages/BlogPost.jsx",
    "./src/components/landing/**/*.jsx",
    "./src/components/layout/Navbar.jsx",
    "./src/components/layout/Footer.jsx",
    "./src/components/common/BillingCycleToggle.jsx",
  ],
};
