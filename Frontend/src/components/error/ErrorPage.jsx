import { useNavigate } from "react-router-dom";
import { Button } from "antd";
import { CompassOutlined, HomeOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

// Replaces antd's stock <Result status="404" /> - that illustration/copy/
// button are all unbranded (generic shrugging-guy SVG, "Sorry, the page you
// visited does not exist.", default antd blue), and its title/subtitle text
// colors assume a light page background, so they were nearly invisible
// against this app's black canvas. This route sits outside DashboardLayout
// (see App.jsx's catch-all, "/*" -> ErrorPage, not nested under the sidebar
// shell) so it gets the same standalone dark-brand backdrop as AuthLayout
// (radial glow + grid) instead of DashboardLayout's chrome.
const ErrorPage = () => {
    const { t } = useI18n();
    const navigate = useNavigate();

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(41,216,213,0.14),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(68,243,240,0.10),transparent_30%),linear-gradient(180deg,#050608_0%,#050505_100%)] px-6">
            <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:46px_46px]" />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <div className="h-[440px] w-[440px] rounded-full bg-[#29D8D5]/14 blur-[120px] animate-blob-float" />
                <div className="absolute h-[220px] w-[220px] rounded-full bg-[#7C6AF7]/10 blur-[70px] animate-blob-float-alt" />
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
                <div className="absolute h-[560px] w-[560px] rounded-full border border-[#29D8D5]/[0.08] animate-orbit-xs">
                    <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#29D8D5] shadow-[0_0_14px_5px_rgba(41,216,213,0.9),0_0_32px_rgba(41,216,213,0.45)]" />
                </div>
                <div className="absolute h-[700px] w-[700px] rounded-full border border-[#44F3F0]/[0.06] animate-orbit-mid">
                    <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#44F3F0] shadow-[0_0_12px_4px_rgba(68,243,240,0.85)]" />
                </div>
            </div>

            <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 text-center animate-fade-up-slow">
                <div className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-[#29D8D5]/30 bg-[#29D8D5]/10 shadow-[0_0_40px_rgba(41,216,213,0.18)]">
                    <CompassOutlined className="text-4xl text-[#44F3F0]" />
                </div>

                <div>
                    <p className="bg-gradient-to-r from-[#29D8D5] via-[#44F3F0] to-[#7C6AF7] bg-clip-text text-6xl font-extrabold leading-none text-transparent">
                        404
                    </p>
                    <h1 className="mt-4 text-xl font-semibold text-[var(--ohnix-text-primary)]">
                        {t("common.error_page_title")}
                    </h1>
                    <p className="mt-2 text-sm text-[var(--ohnix-text-muted)]">
                        {t("common.error_page_subtitle")}
                    </p>
                </div>

                <Button
                    type="primary"
                    size="large"
                    icon={<HomeOutlined />}
                    className="!h-11 !rounded-xl !border-0 !bg-gradient-to-r !from-[#29D8D5] !to-[#44F3F0] !px-6 !font-semibold !text-[#031416] hover:!shadow-[0_0_26px_rgba(41,216,213,0.28)]"
                    onClick={() => navigate("/dashboard")}
                >
                    {t("common.error_page_back_home")}
                </Button>
            </div>
        </div>
    );
};

export default ErrorPage;
