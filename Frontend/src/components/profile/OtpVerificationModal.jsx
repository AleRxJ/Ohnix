import React from "react";
import { Modal, Form, Input, Button, Typography } from "antd";
import { MailOutlined, SafetyOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

const OtpVerificationModal = ({
    showOtpModal,
    setShowOtpModal,
    otpForm,
    handleVerifyOtp,
    handleSendOtp,
    loading,
    newPasswordData,
}) => {
    const { t } = useI18n();
    return (
        <Modal
            title={null}
            open={showOtpModal}
            onCancel={() => setShowOtpModal(false)}
            footer={null}
            centered
            width={440}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                body: { padding: "32px" },
            }}
        >
            <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 rounded-full bg-[#29D8D5]/10 flex items-center justify-center mb-4">
                    <SafetyOutlined className="text-[#44F3F0] text-2xl" />
                </div>
                <h2 className="text-xl font-semibold text-[var(--ohnix-text-primary)] mb-2">
                    {newPasswordData
                        ? t("profile.otp_modal.verify_password_change_title")
                        : t("profile.otp_modal.verify_email_title")}
                </h2>
                <Text className="text-[var(--ohnix-text-muted)] text-sm">
                    {newPasswordData
                        ? t("profile.otp_modal.verify_password_change_description")
                        : t("profile.otp_modal.verify_email_description")}
                </Text>
            </div>

            <Form form={otpForm} layout="vertical" onFinish={handleVerifyOtp}>
                <Form.Item
                    name="otp"
                    rules={[
                        {
                            required: true,
                            message: t("profile.otp_modal.otp_required"),
                        },
                    ]}
                    className="mb-6"
                >
                    <Input
                        placeholder="000000"
                        className="text-center text-2xl tracking-widest font-mono rounded-lg h-14 auth-ohnix-input"
                        maxLength={6}
                        size="large"
                    />
                </Form.Item>

                <div className="space-y-3">
                    <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        block
                        className="bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 rounded-lg h-11 font-medium shadow-sm text-[#021314]"
                    >
                        {t("profile.otp_modal.verify_code")}
                    </Button>

                    <div className="flex items-center justify-center gap-2 text-sm">
                        <Text className="text-[var(--ohnix-text-muted)]">
                            {t("profile.otp_modal.no_code_received")}
                        </Text>
                        <Button
                            type="link"
                            onClick={() => handleSendOtp()}
                            className="text-[#44F3F0] hover:!text-[#29D8D5] p-0 h-auto font-medium"
                        >
                            {t("profile.otp_modal.resend")}
                        </Button>
                    </div>
                </div>
            </Form>
        </Modal>
    );
};

export default OtpVerificationModal;
