import { useEffect, useRef, useState } from "react";
import { CheckCircleFilled, CloudUploadOutlined, FileExcelOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import { ContentSection } from "../components/landing/LandingPageSections";
import { api } from "../api/api";
import useI18n from "../hooks/useI18n";
import { trackContactFormLead } from "../utils/metaPixel";
import { trackContactFormConversion } from "../utils/googleAds";

// Landing point of the Instagram/TikTok "comenta DEMO" funnel (ManyChat DMs
// this link with UTMs). The optional product list is parsed HERE, in the
// prospect's browser, and sent as { headers, rows } JSON next to the file -
// the backend never runs a spreadsheet parser on uploads (see
// Backend/services/demoCatalog.service.js).

const WHATSAPP_NUMBER = "573142193936";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_COLUMNS = 40;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
const BUSINESS_TYPES = ["retail", "distribution", "food", "manufacturing", "services", "other"];
const PRODUCT_COUNT_RANGES = ["1-50", "51-200", "201-1000", "1000+"];

const inputClass =
    "w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/10 text-white placeholder-[#6B7280] focus:border-[#29D8D5] focus:outline-none transition-colors";
const labelClass = "block text-sm font-medium text-white mb-2";

const EMPTY_FORM = {
    name: "",
    company_name: "",
    phone: "",
    email: "",
    business_type: "",
    product_count_range: "",
    preferred_date: "",
    preferred_slot: "morning",
    message: "",
    data_consent: false,
    website: "",
};

// First row with at least two filled cells is the header row - real
// spreadsheets often start with a title line or a blank row.
const parseCatalogFile = async (file) => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "", raw: true });
    const headerIndex = matrix.findIndex((row) => row.filter((cell) => `${cell}`.trim()).length >= 2);
    if (headerIndex === -1) return null;
    const headers = matrix[headerIndex].slice(0, MAX_COLUMNS).map((cell) => `${cell}`.trim());
    const allRows = matrix.slice(headerIndex + 1).filter((row) => row.some((cell) => `${cell}`.trim()));
    return {
        headers,
        rows: allRows.slice(0, MAX_ROWS).map((row) => row.slice(0, headers.length)),
        truncated: allRows.length > MAX_ROWS,
    };
};

const ERROR_KEYS = {
    demo_request_required_fields: "demo_booking.error_required",
    demo_request_invalid_email: "demo_booking.error_email",
    demo_request_invalid_phone: "demo_booking.error_phone",
    demo_request_consent_required: "demo_booking.error_consent",
    demo_request_invalid_date: "demo_booking.error_date",
    demo_catalog_too_large: "demo_booking.file_too_large",
    demo_catalog_invalid_type: "demo_booking.file_invalid",
    demo_catalog_invalid: "demo_booking.file_invalid",
};

const DemoBooking = () => {
    const { t, currentLanguage } = useI18n();
    const fileInputRef = useRef(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [utm, setUtm] = useState({});
    const [minDate, setMinDate] = useState("");
    const [file, setFile] = useState(null);
    const [catalog, setCatalog] = useState(null);
    const [fileState, setFileState] = useState("idle"); // idle | reading | ready | unreadable | error
    const [fileError, setFileError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [submittedName, setSubmittedName] = useState(null);

    // Read after mount only - URL params and "today" differ between the
    // prerendered HTML and the visitor's browser (hydration mismatch).
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setUtm(Object.fromEntries(UTM_KEYS.map((key) => [key, params.get(key) || ""]).filter(([, value]) => value)));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setMinDate(tomorrow.toISOString().slice(0, 10));
    }, []);

    const update = (event) => {
        const { name, value, type, checked } = event.target;
        setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const clearFile = () => {
        setFile(null);
        setCatalog(null);
        setFileState("idle");
        setFileError("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleFile = async (selected) => {
        if (!selected) return;
        const name = selected.name.toLowerCase();
        if (![".xlsx", ".xls", ".csv"].some((ext) => name.endsWith(ext))) {
            clearFile();
            setFileState("error");
            setFileError(t("demo_booking.file_invalid"));
            return;
        }
        if (selected.size > MAX_FILE_BYTES) {
            clearFile();
            setFileState("error");
            setFileError(t("demo_booking.file_too_large"));
            return;
        }
        setFile(selected);
        setFileError("");
        setFileState("reading");
        try {
            const parsed = await parseCatalogFile(selected);
            setCatalog(parsed);
            setFileState(parsed && parsed.rows.length ? "ready" : "unreadable");
        } catch {
            // Still worth sending: the team can open the original file.
            setCatalog(null);
            setFileState("unreadable");
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.data_consent) {
            setErrorMessage(t("demo_booking.error_consent"));
            return;
        }
        setSubmitting(true);
        setErrorMessage("");
        const payload = new FormData();
        Object.entries(form).forEach(([key, value]) => payload.append(key, `${value}`));
        Object.entries(utm).forEach(([key, value]) => payload.append(key, value));
        if (file) payload.append("catalog_file", file);
        if (catalog?.rows.length) payload.append("catalog_json", JSON.stringify({ headers: catalog.headers, rows: catalog.rows }));

        try {
            await api.post("/demo-requests", payload, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 });
            trackContactFormLead();
            trackContactFormConversion();
            setSubmittedName({ name: form.name.split(" ")[0], company: form.company_name });
            setForm(EMPTY_FORM);
            clearFile();
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error) {
            const code = error?.response?.data?.code;
            setErrorMessage(ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : !error?.response ? t("demo_booking.error_network") : t("demo_booking.error_generic"));
        } finally {
            setSubmitting(false);
        }
    };

    const steps = [1, 2, 3].map((n) => ({ title: t(`demo_booking.step_${n}_title`), body: t(`demo_booking.step_${n}_body`) }));
    const whatsappUrl = submittedName
        ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t("demo_booking.whatsapp_message", { company: submittedName.company }))}`
        : `https://wa.me/${WHATSAPP_NUMBER}`;

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title={t("demo_booking.seo_title")}
                description={t("demo_booking.seo_description")}
                canonicalPath="/agenda-demo"
                lang={currentLanguage || "es"}
            />
            <Navbar />
            <main className="bg-[#050505] pt-24">
                <ContentSection id="agenda-demo" shell={false}>
                    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
                        <div className="space-y-8">
                            <div>
                                <span className="inline-flex items-center gap-2 rounded-full border border-[#29D8D5]/40 bg-[#29D8D5]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-[#29D8D5]">
                                    {t("demo_booking.eyebrow")}
                                </span>
                                <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">{t("demo_booking.title")}</h1>
                                <p className="mt-4 text-lg leading-relaxed text-[#A9B3B8]">{t("demo_booking.description")}</p>
                            </div>
                            <ol className="space-y-5">
                                {steps.map((step, index) => (
                                    <li key={step.title} className="flex gap-4">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#29D8D5]/12 font-bold text-[#29D8D5]">{index + 1}</span>
                                        <div>
                                            <p className="font-semibold text-white">{step.title}</p>
                                            <p className="mt-1 text-sm leading-relaxed text-[#A9B3B8]">{step.body}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8">
                            {submittedName ? (
                                <div className="flex flex-col items-center py-10 text-center" role="status">
                                    <CheckCircleFilled className="text-5xl text-[#29D8D5]" />
                                    <h2 className="mt-6 text-2xl font-bold text-white">{t("demo_booking.success_title", { name: submittedName.name })}</h2>
                                    <p className="mt-3 max-w-md text-[#A9B3B8]">{t("demo_booking.success_body")}</p>
                                    <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-8 inline-flex items-center justify-center rounded-full bg-[#25D366] px-6 py-3.5 text-sm font-semibold text-[#021314] transition-all hover:-translate-y-0.5"
                                    >
                                        {t("demo_booking.success_whatsapp")}
                                    </a>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
                                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                        <div>
                                            <label htmlFor="db-name" className={labelClass}>{t("demo_booking.name_label")}</label>
                                            <input id="db-name" name="name" value={form.name} onChange={update} required maxLength={120} autoComplete="name" className={inputClass} />
                                        </div>
                                        <div>
                                            <label htmlFor="db-company" className={labelClass}>{t("demo_booking.company_label")}</label>
                                            <input id="db-company" name="company_name" value={form.company_name} onChange={update} required maxLength={160} autoComplete="organization" className={inputClass} />
                                        </div>
                                        <div>
                                            <label htmlFor="db-phone" className={labelClass}>{t("demo_booking.phone_label")}</label>
                                            <input id="db-phone" name="phone" type="tel" value={form.phone} onChange={update} required maxLength={30} autoComplete="tel" placeholder="+57 300 000 0000" className={inputClass} />
                                        </div>
                                        <div>
                                            <label htmlFor="db-email" className={labelClass}>{t("demo_booking.email_label")}</label>
                                            <input id="db-email" name="email" type="email" value={form.email} onChange={update} required maxLength={160} autoComplete="email" className={inputClass} />
                                        </div>
                                        <div>
                                            <label htmlFor="db-business" className={labelClass}>{t("demo_booking.business_label")}</label>
                                            <select id="db-business" name="business_type" value={form.business_type} onChange={update} className={inputClass}>
                                                <option value="">{t("demo_booking.select_placeholder")}</option>
                                                {BUSINESS_TYPES.map((value) => (
                                                    <option key={value} value={value}>{t(`demo_booking.business_${value}`)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="db-count" className={labelClass}>{t("demo_booking.product_count_label")}</label>
                                            <select id="db-count" name="product_count_range" value={form.product_count_range} onChange={update} className={inputClass}>
                                                <option value="">{t("demo_booking.select_placeholder")}</option>
                                                {PRODUCT_COUNT_RANGES.map((value) => (
                                                    <option key={value} value={value}>{value}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="db-date" className={labelClass}>{t("demo_booking.date_label")}</label>
                                            <input id="db-date" name="preferred_date" type="date" min={minDate || undefined} value={form.preferred_date} onChange={update} className={`${inputClass} [color-scheme:dark]`} />
                                        </div>
                                        <fieldset>
                                            <legend className={labelClass}>{t("demo_booking.slot_label")}</legend>
                                            <div className="grid grid-cols-2 gap-2">
                                                {["morning", "afternoon"].map((slot) => (
                                                    <label
                                                        key={slot}
                                                        className={`cursor-pointer rounded-lg border px-3 py-3 text-center text-sm font-medium transition-colors ${
                                                            form.preferred_slot === slot ? "border-[#29D8D5] bg-[#29D8D5]/10 text-white" : "border-white/10 bg-white/[0.05] text-[#A9B3B8]"
                                                        }`}
                                                    >
                                                        <input type="radio" name="preferred_slot" value={slot} checked={form.preferred_slot === slot} onChange={update} className="sr-only" />
                                                        {t(`demo_booking.slot_${slot}`)}
                                                    </label>
                                                ))}
                                            </div>
                                        </fieldset>
                                    </div>

                                    <div>
                                        <span className={labelClass}>{t("demo_booking.file_label")}</span>
                                        <label
                                            htmlFor="db-file"
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={(event) => {
                                                event.preventDefault();
                                                handleFile(event.dataTransfer.files?.[0]);
                                            }}
                                            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/[0.03] px-6 py-6 text-center transition-colors hover:border-[#29D8D5]/60"
                                        >
                                            {fileState === "reading" ? (
                                                <LoadingOutlined className="text-2xl text-[#29D8D5]" />
                                            ) : file ? (
                                                <FileExcelOutlined className="text-2xl text-[#29D8D5]" />
                                            ) : (
                                                <CloudUploadOutlined className="text-2xl text-[#29D8D5]" />
                                            )}
                                            <span className="text-sm font-medium text-white">{file ? file.name : t("demo_booking.file_cta")}</span>
                                            <span className="text-xs text-[#A9B3B8]">{t("demo_booking.file_hint")}</span>
                                        </label>
                                        <input
                                            id="db-file"
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".xlsx,.xls,.csv"
                                            className="sr-only"
                                            onChange={(event) => handleFile(event.target.files?.[0])}
                                        />
                                        <div className="mt-2 min-h-[20px] text-sm" aria-live="polite">
                                            {fileState === "ready" && (
                                                <span className="text-[#29D8D5]">
                                                    <CheckCircleFilled /> {t("demo_booking.file_ready", { count: catalog.rows.length })}
                                                    {catalog.truncated ? ` ${t("demo_booking.file_truncated", { max: MAX_ROWS })}` : ""}
                                                </span>
                                            )}
                                            {fileState === "unreadable" && (
                                                <span className="text-[#f5a524]">
                                                    <WarningOutlined /> {t("demo_booking.file_unreadable")}
                                                </span>
                                            )}
                                            {fileState === "error" && <span className="text-red-400">{fileError}</span>}
                                            {file && (
                                                <button type="button" onClick={clearFile} className="ml-3 text-[#A9B3B8] underline hover:text-white">
                                                    {t("demo_booking.file_remove")}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="db-message" className={labelClass}>{t("demo_booking.message_label")}</label>
                                        <textarea id="db-message" name="message" rows={3} value={form.message} onChange={update} maxLength={2000} placeholder={t("demo_booking.message_placeholder")} className={`${inputClass} resize-none`} />
                                    </div>

                                    {/* Honeypot - hidden from people, filled by bots. */}
                                    <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
                                        <label htmlFor="db-website">Website</label>
                                        <input id="db-website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={update} />
                                    </div>

                                    <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-[#A9B3B8]">
                                        <input type="checkbox" name="data_consent" checked={form.data_consent} onChange={update} required className="mt-1 h-4 w-4 shrink-0 accent-[#29D8D5]" />
                                        <span>{t("demo_booking.consent")}</span>
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={submitting || fileState === "reading"}
                                        className="w-full rounded-full bg-[#29D8D5] px-6 py-3.5 font-semibold text-[#021314] transition-all duration-300 hover:bg-[#44F3F0] disabled:opacity-50"
                                    >
                                        {submitting ? t("demo_booking.submitting") : t("demo_booking.submit")}
                                    </button>
                                    {errorMessage && <p className="text-center text-sm text-red-400" role="alert">{errorMessage}</p>}
                                </form>
                            )}
                        </div>
                    </div>
                </ContentSection>
            </main>
            <Footer />
        </div>
    );
};

export default DemoBooking;
