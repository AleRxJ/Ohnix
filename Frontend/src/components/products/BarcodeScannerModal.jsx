import React, { useRef, useState } from "react";
import { Modal, Alert } from "antd";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { ScanOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const SCAN_REGION_ID = "ohnix-barcode-scan-region";

const SUPPORTED_FORMATS = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.ITF,
];

const BarcodeScannerModal = ({ open, onCancel, onDetected }) => {
    const { t } = useI18n();
    const scannerRef = useRef(null);
    const [error, setError] = useState(null);

    const stopScanner = () => {
        const activeScanner = scannerRef.current;
        scannerRef.current = null;
        if (!activeScanner) return;
        const clear = () => {
            try {
                activeScanner.clear();
            } catch {
                // scan region already torn down
            }
        };
        try {
            // stop() throws synchronously (not a rejected promise) when the
            // scanner isn't actively scanning yet - e.g. the modal was
            // closed while the camera was still starting, or start() had
            // already failed. Without this try/catch that throw escapes
            // uncaught from antd's modal-close transition and crashes the app.
            activeScanner.stop().catch(() => {}).finally(clear);
        } catch {
            clear();
        }
    };

    // Started from Modal's afterOpenChange (fires once the open transition
    // has actually finished) rather than a useEffect keyed on `open` -
    // antd's Modal mounts its content through an rc-motion transition, so
    // the #ohnix-barcode-scan-region div isn't reliably in the DOM yet on
    // the same tick `open` flips true, which made html5-qrcode throw
    // "HTML Element with id=... not found" the first time the modal opened.
    const startScanner = () => {
        setError(null);
        const scanner = new Html5Qrcode(SCAN_REGION_ID, {
            formatsToSupport: SUPPORTED_FORMATS,
            verbose: false,
        });
        scannerRef.current = scanner;
        let detected = false;

        scanner
            .start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    if (detected) return;
                    detected = true;
                    onDetected(decodedText);
                }
            )
            .catch(() => {
                setError(t("products.barcode_scanner_camera_error"));
            });
    };

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            afterOpenChange={(isOpen) => {
                if (isOpen) {
                    startScanner();
                } else {
                    stopScanner();
                }
            }}
            footer={null}
            destroyOnClose
            centered
            width={420}
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <ScanOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {t("products.barcode_scanner_title")}
                    </span>
                </div>
            }
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background:
                        "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            {error ? (
                <Alert className="dark-alert dark-alert-rose" type="error" showIcon message={error} />
            ) : (
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-3">
                    {t("products.barcode_scanner_hint")}
                </p>
            )}
            <div
                id={SCAN_REGION_ID}
                className="rounded-lg overflow-hidden border border-[var(--ohnix-line-4)] bg-black"
            />
        </Modal>
    );
};

export default BarcodeScannerModal;
