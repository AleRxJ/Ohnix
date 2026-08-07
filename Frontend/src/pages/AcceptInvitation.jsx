import React, { useContext, useEffect, useState } from "react";
import { Form, Spin, Input } from "antd";
import { UsergroupAddOutlined, MailOutlined, WarningOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate, useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import AuthLayout from "../components/auth/AuthLayout";
import AuthCard from "../components/auth/AuthCard";
import { UsernameInput, PasswordInput } from "../components/auth/FormItems";
import AuthButton from "../components/auth/AuthButton";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import AuthContext from "../context/AuthContext";
import { teamService } from "../services/teamService";
import { api } from "../api/api";

const AcceptInvitation = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { t, currentLanguage } = useI18n();
    const { refreshUser } = useContext(AuthContext);
    const [form] = Form.useForm();

    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        teamService
            .previewInvitation(token)
            .then((res) => {
                if (cancelled) return;
                const data = res?.data;
                if (data?.status !== "pending") {
                    setError(data?.status === "expired" ? "expired" : "invalid");
                } else {
                    setPreview(data);
                }
            })
            .catch(() => {
                if (!cancelled) setError("invalid");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    const onFinish = async (values) => {
        setSubmitting(true);
        try {
            const res = await teamService.acceptInvitation(token, {
                username: values.username,
                password: values.password,
                preferredLanguage: currentLanguage || "es",
            });

            const accessToken = res?.data?.accessToken;
            if (accessToken) {
                localStorage.setItem("accessToken", accessToken);
                api.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
            }
            await refreshUser();
            toast.success(t("team.accept_success"));
            navigate("/dashboard", { replace: true });
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthLayout>
            <SeoHead title={t("team.accept_title")} />
            <AuthCard title={t("team.accept_title")} subtitle={preview?.teamName ? t("team.accept_subtitle_known_team", { inviter: preview.inviterUsername, team: preview.teamName }) : undefined}>
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Spin size="large" />
                    </div>
                ) : error ? (
                    <div className="text-center py-6">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
                            <WarningOutlined className="text-2xl text-red-400" />
                        </div>
                        <p className="text-white font-medium mb-2">
                            {error === "expired" ? t("team.accept_expired") : t("team.accept_invalid")}
                        </p>
                        <Link to="/login" className="text-[#44F3F0] text-sm">
                            {t("auth.back_to_login")}
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="mb-5 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <UsergroupAddOutlined className="text-[#44F3F0]" />
                            <div className="min-w-0">
                                <p className="m-0 text-sm font-medium text-white truncate">{preview.teamName}</p>
                                <p className="m-0 text-xs text-[#A9B3B8]">{preview.roleName}</p>
                            </div>
                        </div>
                        <div className="mb-5 flex items-center gap-2 text-sm text-[#A9B3B8]">
                            <MailOutlined />
                            {preview.email}
                        </div>

                        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
                            <UsernameInput />
                            <PasswordInput hasFeedback />
                            <Form.Item
                                name="confirmPassword"
                                dependencies={["password"]}
                                rules={[
                                    { required: true, message: t("validation.required_field") },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue("password") === value) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error(t("validation.passwords_dont_match")));
                                        },
                                    }),
                                ]}
                            >
                                <Input.Password
                                    prefix={<LockOutlined className="text-slate-400" />}
                                    placeholder={t("auth.confirm_password")}
                                    size="large"
                                    className="auth-ohnix-input rounded-xl border-white/12 hover:border-[#29D8D5]/35 focus:border-[#29D8D5] bg-[#111214] text-white transition-colors"
                                />
                            </Form.Item>
                            <AuthButton loading={submitting}>{t("team.accept_cta")}</AuthButton>
                        </Form>
                    </>
                )}
            </AuthCard>
        </AuthLayout>
    );
};

export default AcceptInvitation;
