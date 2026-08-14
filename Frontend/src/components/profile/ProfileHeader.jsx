import React from "react";
import {
    Card,
    Avatar,
    Badge,
    Spin,
    Upload,
    Button,
    Tooltip,
    Typography,
} from "antd";
import {
    UserOutlined,
    EditOutlined,
    MailOutlined,
    CheckCircleOutlined,
    CameraOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

const ProfileHeader = ({
    user,
    isVerified,
    avatarLoading,
    handleAvatarUpload,
    customUploadRequest,
    setEditMode,
}) => {
    const { t } = useI18n();

    // Generar avatar por defecto si no existe o está vacío
    const getAvatarSrc = () => {
        if (user?.avatar && user.avatar.trim()) {
            let avatarUrl = user.avatar;

            // Si es una ruta relativa local, convertirla a URL HTTP
            if (avatarUrl.startsWith("/") && !avatarUrl.startsWith("//")) {
                // Es una ruta relativa local, agregar el API base URL
                const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
                avatarUrl = `${apiBaseUrl}${avatarUrl}`;
            }

            return avatarUrl;
        }
        // Fallback: generar usando ui-avatars.com
        const name = encodeURIComponent(user?.username || "User");
        return `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${name}&size=128`;
    };

    return (
        <Card
            className="mb-0 border-0 rounded-none shadow-none bg-transparent"
            bodyStyle={{ padding: 0 }}
        >
            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(41,216,213,0.18),transparent_36%),linear-gradient(135deg,var(--ohnix-surface-card),var(--ohnix-surface-card-soft))] px-5 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
                <div className="absolute inset-0 bg-[linear-gradient(120deg,var(--ohnix-line-2),transparent_20%,transparent_80%,var(--ohnix-line-1))] opacity-40" />
                <div className="relative grid grid-cols-1 xl:grid-cols-[1.3fr_0.8fr] gap-6 lg:gap-8 items-start">
                    <div className="flex flex-col gap-6 md:flex-row md:items-start">
                        <div className="flex justify-center md:justify-start">
                            <div className="relative">
                            <Badge
                                dot={isVerified}
                                color="#10b981"
                                offset={[-8, 8]}
                            >
                                <Spin spinning={avatarLoading}>
                                    <Avatar
                                            size={120}
                                        src={getAvatarSrc()}
                                        icon={!getAvatarSrc() && <UserOutlined />}
                                            className="ring-4 ring-[var(--ohnix-line-4)] shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)]"
                                    />
                                </Spin>
                            </Badge>
                            <Upload
                                name="avatar"
                                showUploadList={false}
                                customRequest={customUploadRequest}
                                onChange={handleAvatarUpload}
                            >
                                <Button
                                    type="primary"
                                    shape="circle"
                                    icon={<CameraOutlined />}
                                    size="small"
                                        className="absolute bottom-1 right-1 bg-[#29D8D5] hover:bg-[#44F3F0] border-2 border-[var(--ohnix-bg-alt)] shadow-[0_10px_24px_rgba(41,216,213,0.3)] text-[#021314]"
                                />
                            </Upload>
                        </div>
                    </div>
                        <div className="flex-1 text-center md:text-left">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[var(--ohnix-text-muted)] mb-4">
                                {t("profile.hero_title")}
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
                                            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--ohnix-text-primary)]">
                                                {user?.username}
                                            </h1>
                                            {isVerified && (
                                                <Tooltip title={t("profile.verified_account")}>
                                                    <CheckCircleOutlined className="text-[#44F3F0] text-lg" />
                                                </Tooltip>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-center md:justify-start gap-2 text-[var(--ohnix-text-muted)] mb-2">
                                            <MailOutlined className="text-sm" />
                                            <p className="text-sm truncate max-w-xs sm:max-w-md">
                                                {user?.email}
                                            </p>
                                        </div>
                                        <p className="text-sm text-[var(--ohnix-text-muted)] max-w-2xl mx-auto md:mx-0">
                                            {user?.role === "admin"
                                                ? t("profile.administrator_account")
                                                : t("profile.standard_account")}
                                        </p>
                                    </div>

                                    <div className="flex justify-center md:justify-start">
                                        <Button
                                            type="primary"
                                            icon={<EditOutlined />}
                                            onClick={() => setEditMode(true)}
                                            className="h-11 px-6 rounded-xl border-0 bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0] shadow-[0_14px_32px_rgba(41,216,213,0.24)] font-medium"
                                        >
                                            {t("profile.edit_profile")}
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-4 backdrop-blur-sm">
                                        <Text className="text-[11px] uppercase tracking-[0.22em] text-[var(--ohnix-text-muted)] block mb-2">
                                            {t("profile.member_since")}
                                        </Text>
                                        <p className="text-sm font-medium text-[var(--ohnix-text-primary)] truncate">
                                            {user?.createdAt
                                                ? new Date(user.createdAt).toLocaleDateString()
                                                : t("common.na")}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-4 backdrop-blur-sm">
                                        <Text className="text-[11px] uppercase tracking-[0.22em] text-[var(--ohnix-text-muted)] block mb-2">
                                            {t("profile.account_type")}
                                        </Text>
                                        <p className="text-sm font-medium text-[var(--ohnix-text-primary)] capitalize truncate">
                                            {user?.role || t("common.unknown")}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-4 backdrop-blur-sm">
                                        <Text className="text-[11px] uppercase tracking-[0.22em] text-[var(--ohnix-text-muted)] block mb-2">
                                            {t("profile.verification_status")}
                                        </Text>
                                        <p className={`text-sm font-medium truncate ${isVerified ? "text-[#44F3F0]" : "text-amber-300"}`}>
                                            {isVerified ? t("profile.verified") : t("profile.unverified")}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default ProfileHeader;
