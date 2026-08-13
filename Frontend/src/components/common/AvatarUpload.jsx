import React, { useState } from "react";
import { LoadingOutlined, CameraOutlined } from "@ant-design/icons";
import { Upload, message } from "antd";
import useI18n from "../../hooks/useI18n";

const AvatarUpload = ({ onChange }) => {
    const [loading, setLoading] = useState(false);
    const [imageUrl, setImageUrl] = useState(null);
    const { t } = useI18n();

    const beforeUpload = (file) => {
        const ok = (file.type === "image/jpeg" || file.type === "image/png");
        if (!ok) message.error(t("common.only_jpg_png") || "Solo JPG/PNG");
        const sizeOk = file.size / 1024 / 1024 < 2;
        if (!sizeOk) message.error(t("common.max_2mb") || "Máx. 2 MB");
        return ok && sizeOk;
    };

    const customRequest = ({ file, onSuccess }) => {
        setLoading(true);
        const reader = new FileReader();
        reader.onload = (e) => {
            setImageUrl(e.target.result);
            setLoading(false);
            onSuccess("ok");
            if (onChange) {
                onChange({ file: { status: "done", originFileObj: file, name: file.name } });
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <Upload
            name="avatar"
            showUploadList={false}
            customRequest={customRequest}
            beforeUpload={beforeUpload}
            accept="image/jpeg,image/png"
        >
            <div className="group relative h-24 w-24 cursor-pointer rounded-full border border-[#29D8D5]/25 bg-[var(--ohnix-line-1)] transition-all duration-300 hover:border-[#29D8D5]/50 hover:bg-[var(--ohnix-line-2)] hover:shadow-[0_0_20px_rgba(41,216,213,0.15)] overflow-hidden flex items-center justify-center select-none">
                {imageUrl ? (
                    <>
                        <img src={imageUrl} alt="avatar" className="h-full w-full object-cover object-center" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <CameraOutlined className="text-[var(--ohnix-text-primary)] text-lg" />
                            <span className="text-[9px] text-[var(--ohnix-text-primary)] uppercase tracking-wider">{t("common.edit") || "Cambiar"}</span>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-1.5 text-[#5A6770] group-hover:text-[#29D8D5] transition-colors duration-300">
                        {loading
                            ? <LoadingOutlined className="text-xl" />
                            : <CameraOutlined className="text-xl" />
                        }
                        <span className="text-[9px] uppercase tracking-[0.2em] leading-none">
                            {t("auth.upload_photo")}
                        </span>
                    </div>
                )}
            </div>
        </Upload>
    );
};

export default AvatarUpload;
