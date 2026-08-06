import { useState, useEffect, useContext } from "react";
import { Form, Spin, Typography } from "antd";
import {
    CheckCircleOutlined,
    ArrowLeftOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import { OtpInput } from "../../components/auth/FormItems";
import AuthButton from "../../components/auth/AuthButton";
import { api } from "../../api/api";
import useI18n from "../../hooks/useI18n";

const { Text, Title } = Typography;

const EmailVerify = () => {
    const [loading, setLoading] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [justVerified, setJustVerified] = useState(false);
    const [devOtp, setDevOtp] = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    const navigate = useNavigate();
    const { user, setUser } = useContext(AuthContext);
    const { t } = useI18n();

    useEffect(() => {
        if (user?.isVerified && !justVerified) {
            toast.success(t("auth.email_already_verified"));
            navigate("/dashboard");
        } else if (user?.isVerified && justVerified) {
            navigate("/dashboard");
        }
    }, [user, navigate, justVerified, t]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const interval = setInterval(() => {
            setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, [resendCooldown]);

    const sendVerificationOtp = async () => {
        if (resendCooldown > 0) return;
        setLoading(true);
        try {
            const response = await api.post(
                `/users/send-verify-otp`,
                {},
                {
                    withCredentials: true,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            const data = response.data;

            if (data.success) {
                // Local/dev fallback: the backend returns the OTP directly
                // in the response when email delivery isn't configured or
                // fails, instead of leaving the user stuck with no way to
                // get their code. Never present in production (that path
                // returns a 503 instead).
                if (data.data?.devOtp) {
                    setDevOtp(data.data.devOtp);
                } else {
                    setDevOtp("");
                }
                toast.success(data.message || t("auth.otp_sent"));
                setOtpSent(true);
                setResendCooldown(45);
            } else {
                toast.error(data.message || t("auth.failed_send_otp"));
            }
        } catch (error) {
            if (error.response?.status === 429) {
                toast.error(t("auth.otp_rate_limited"));
                setResendCooldown(60);
            } else {
                toast.error(
                    error.response?.data?.message || t("common.error")
                );
            }
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const onFinish = async (values) => {
        setVerifying(true);
        try {
            const response = await api.post(
                `/users/verify-email`,
                {
                    otp: values.otp,
                },
                {
                    withCredentials: true,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            const data = response.data;

            if (data.success) {
                setJustVerified(true);
                toast.success(t("auth.email_verified_success"));

                if (setUser) {
                    setUser((prev) => ({ ...prev, isVerified: true }));
                }

                setTimeout(() => {
                    navigate("/dashboard");
                }, 1500);
            } else {
                toast.error(data.message || t("auth.verification_failed"));
            }
        } catch (error) {
            toast.error(
                error.response?.data?.message || t("common.error")
            );
            console.error(error);
        } finally {
            setVerifying(false);
        }
    };

    useEffect(() => {
        if (!otpSent && !user?.isVerified) {
            sendVerificationOtp();
        }
    }, []);

    return (
        <AuthLayout>
            <AuthCard
                title={t("auth.verify_your_email")}
                subtitle={t("auth.enter_6_digit_code")}
            >
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Spin size="large" />
                        <Text className="mt-4 text-[#A9B3B8]">
                            {t("auth.sending_verification_code")}
                        </Text>
                    </div>
                ) : (
                    <>
                        {otpSent ? (
                            <Form
                                name="otp-verification"
                                onFinish={onFinish}
                                layout="vertical"
                            >
                                {devOtp && (
                                    <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center">
                                        <Text className="block text-xs uppercase tracking-wide text-amber-300">
                                            {t("auth.dev_otp_notice")}
                                        </Text>
                                        <Text className="mt-1 block text-2xl font-bold tracking-[0.3em] text-white">
                                            {devOtp}
                                        </Text>
                                    </div>
                                )}
                                <div className="mb-8">
                                    <OtpInput />
                                </div>

                                <Form.Item className="mb-6">
                                    <AuthButton
                                        loading={verifying}
                                        icon={<CheckCircleOutlined />}
                                        className="w-full h-11"
                                    >
                                        {t("auth.verify_email_action")}
                                    </AuthButton>
                                </Form.Item>

                                <div className="flex items-center justify-center gap-6 text-sm">
                                    <button
                                        type="button"
                                        onClick={sendVerificationOtp}
                                        disabled={loading || resendCooldown > 0}
                                        className="text-[#44F3F0] hover:text-[#29D8D5] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {resendCooldown > 0
                                            ? t("auth.resend_code_cooldown", { seconds: resendCooldown })
                                            : t("auth.resend_code")}
                                    </button>
                                    <span className="text-white/20">|</span>
                                    <button
                                        type="button"
                                        onClick={() => navigate("/login")}
                                        className="text-[#A9B3B8] hover:text-white font-medium transition-colors inline-flex items-center gap-1"
                                    >
                                        <ArrowLeftOutlined className="text-xs" />
                                        {t("auth.back_to_login")}
                                    </button>
                                </div>
                            </Form>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8">
                                <AuthButton
                                    onClick={() => navigate("/login")}
                                    className="w-full max-w-xs h-11"
                                >
                                    {t("auth.login_to_continue")}
                                </AuthButton>
                            </div>
                        )}
                    </>
                )}

                <div className="mt-8 pt-6 border-t border-white/10 text-center">
                    <Text className="text-sm text-[#A9B3B8]">
                        {t("auth.need_help")} {" "}
                        <a
                            href="mailto:alejandrosoftware.engineering@gmail.com"
                            className="text-[#44F3F0] hover:text-[#29D8D5] font-medium transition-colors"
                        >
                            {t("auth.contact_support")}
                        </a>
                    </Text>
                </div>
            </AuthCard>
        </AuthLayout>
    );
};

export default EmailVerify;
