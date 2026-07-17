import { useState } from "react";
import { Form, Steps, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/api.js";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import {
    EmailInput,
    PasswordInput,
    OtpInput,
} from "../../components/auth/FormItems";
import AuthButton from "../../components/auth/AuthButton";
import useI18n from "../../hooks/useI18n";

const { Step } = Steps;

const ResetPassword = () => {
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const navigate = useNavigate();
    const { t } = useI18n();

    const handleSendOTP = async () => {
        if (!email) {
            message.error(t("auth.email_required"));
            return;
        }

        try {
            setLoading(true);
            const response = await api.post("/users/send-reset-otp", { email });

            if (response.data.success) {
                message.success(t("auth.otp_sent"));
                setOtpSent(true);
                setCurrentStep(1);
            } else {
                message.error(response.data.message || t("auth.failed_send_otp"));
            }
        } catch (error) {
            const errorMessage =
                error.response?.data?.message || t("common.error");
            message.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!otp) {
            message.error(t("auth.otp_required"));
            return;
        }

        if (!newPassword) {
            message.error(t("auth.password_required"));
            return;
        }

        if (newPassword !== confirmPassword) {
            message.error(t("validation.passwords_dont_match"));
            return;
        }

        try {
            setLoading(true);
            const response = await api.post("/users/reset-password", {
                email,
                otp,
                newPassword,
            });

            if (response.data.success) {
                message.success(t("auth.password_reset_success"));
                navigate("/login");
            } else {
                message.error(
                    response.data.message || t("auth.failed_reset_password")
                );
            }
        } catch (error) {
            const errorMessage =
                error.response?.data?.message || t("common.error");
            message.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const steps = [
        {
            title: t("common.email"),
            content: (
                <Form layout="vertical" className="space-y-5">
                    <EmailInput
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <AuthButton onClick={handleSendOTP} loading={loading}>
                        {t("auth.send_otp")}
                    </AuthButton>
                </Form>
            ),
        },
        {
            title: t("auth.verify"),
            content: (
                <Form layout="vertical" className="space-y-4">
                    <OtpInput
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                    />
                    <div className="space-y-3">
                        <PasswordInput
                            name="newPassword"
                            placeholder={t("auth.enter_new_password")}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <PasswordInput
                            name="confirmPassword"
                            placeholder={t("auth.confirm_new_password")}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                    <AuthButton onClick={handleResetPassword} loading={loading}>
                        {t("auth.reset_password")}
                    </AuthButton>
                </Form>
            ),
        },
    ];

    return (
        <AuthLayout>
            <AuthCard
                title={t("auth.reset_password")}
                subtitle={
                    otpSent
                        ? t("auth.enter_otp_sent_email")
                        : t("auth.enter_email_reset")
                }
            >
                <div className="mb-6">
                    <Steps
                        current={currentStep}
                        size="small"
                        className="max-w-xs mx-auto"
                    >
                        {steps.map((item) => (
                            <Step key={item.title} title={item.title} />
                        ))}
                    </Steps>
                </div>

                <div className="mt-6">{steps[currentStep].content}</div>

                {currentStep === 1 && (
                    <div className="mt-5 text-center">
                        <AuthButton
                            type="link"
                            onClick={handleSendOTP}
                            disabled={loading}
                            className="p-0 h-auto text-sm text-gray-600 hover:text-blue-600"
                        >
                            {t("auth.resend_otp")}
                        </AuthButton>
                    </div>
                )}

                <div className="text-center mt-6 pt-4 border-t border-gray-100">
                    <span className="text-sm text-gray-500">
                        {t("auth.remember_password")} {" "}
                    </span>
                    <Link
                        to="/login"
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                        {t("auth.login")}
                    </Link>
                </div>
            </AuthCard>
        </AuthLayout>
    );
};

export default ResetPassword;
