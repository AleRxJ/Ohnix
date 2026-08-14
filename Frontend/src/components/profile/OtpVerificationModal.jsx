import React from "react";
import { Modal, Form, Input, Button, Typography } from "antd";
import { MailOutlined, SafetyOutlined } from "@ant-design/icons";

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
                    borderRadius: "20px",
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
                        ? "Verify Password Change"
                        : "Verify Your Email"}
                </h2>
                <Text className="text-[var(--ohnix-text-muted)] text-sm">
                    {newPasswordData
                        ? "Enter the verification code sent to your email to confirm your password change."
                        : "We've sent a 6-digit verification code to your email address."}
                </Text>
            </div>

            <Form form={otpForm} layout="vertical" onFinish={handleVerifyOtp}>
                <Form.Item
                    name="otp"
                    rules={[
                        {
                            required: true,
                            message: "Please input the OTP!",
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
                        Verify Code
                    </Button>

                    <div className="flex items-center justify-center gap-2 text-sm">
                        <Text className="text-[var(--ohnix-text-muted)]">
                            Didn't receive the code?
                        </Text>
                        <Button
                            type="link"
                            onClick={() => handleSendOtp()}
                            className="text-[#44F3F0] hover:!text-[#29D8D5] p-0 h-auto font-medium"
                        >
                            Resend
                        </Button>
                    </div>
                </div>
            </Form>
        </Modal>
    );
};

export default OtpVerificationModal;
