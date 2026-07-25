import React from "react";
import { Form, Typography } from "antd";
import {
    LockOutlined,
    KeyOutlined,
    SafetyCertificateOutlined,
    CheckCircleOutlined,
} from "@ant-design/icons";
import { FormDivider, PrimaryButton, GradientCard } from "../common/UI";
import { ConfirmPasswordFormItem, PasswordFormItem } from "../common/FormItems";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

const PasswordChangeTab = ({
    passwordForm,
    handlePasswordRequest,
    loading,
}) => {
    const { t } = useI18n();

    return (
        <div className="animate-fadeIn w-full px-3 sm:px-4 md:px-6 py-6 sm:py-8 lg:py-10">
            <div className="max-w-6xl mx-auto w-full">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
                    <div className="lg:col-span-2 w-full">
                        <div className="lg:sticky lg:top-8 w-full">
                            <div className="flex items-center gap-3 mb-3 sm:mb-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#29D8D5] flex items-center justify-center shadow-[0_12px_28px_rgba(41,216,213,0.22)] flex-shrink-0">
                                    <KeyOutlined className="text-[#021314] text-lg sm:text-xl" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h1 className="text-2xl sm:text-3xl font-bold text-white m-0 truncate">
                                        {t("profile.password_panel_title")}
                                    </h1>
                                </div>
                            </div>
                            <Text className="text-sm sm:text-base text-[#A9B3B8] block mb-6 sm:mb-8">
                                {t("profile.password_panel_description")}
                            </Text>

                            <div className="space-y-3 sm:space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <CheckCircleOutlined className="text-emerald-300 text-sm" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <Text className="text-sm font-medium text-white block mb-1">
                                            {t("profile.strong_password")}
                                        </Text>
                                        <Text className="text-xs sm:text-sm text-[#A9B3B8]">
                                            {t("profile.strong_password_description")}
                                        </Text>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-[#29D8D5]/15 border border-[#29D8D5]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <SafetyCertificateOutlined className="text-[#44F3F0] text-sm" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <Text className="text-sm font-medium text-white block mb-1">
                                            {t("profile.email_verification")}
                                        </Text>
                                        <Text className="text-xs sm:text-sm text-[#A9B3B8]">
                                            {t("profile.email_verification_description")}
                                        </Text>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <LockOutlined className="text-white/80 text-sm" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <Text className="text-sm font-medium text-white block mb-1">
                                            {t("profile.secure_process")}
                                        </Text>
                                        <Text className="text-xs sm:text-sm text-[#A9B3B8]">
                                            {t("profile.secure_process_description")}
                                        </Text>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 w-full">
                        <div className="bg-white/[0.04] rounded-3xl shadow-[0_18px_50px_rgba(0,0,0,0.22)] border border-white/10 overflow-hidden w-full backdrop-blur-md">
                            <div className="bg-[linear-gradient(135deg,rgba(41,216,213,0.12),rgba(255,255,255,0.03))] px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
                                <Text className="text-base sm:text-lg font-semibold text-white block">
                                    {t("profile.update_password")}
                                </Text>
                                <Text className="text-xs sm:text-sm text-[#A9B3B8] block mt-1">
                                    {t("profile.security_description")}
                                </Text>
                            </div>

                            <div className="p-4 sm:p-6 md:p-8 w-full">
                                <Form
                                    form={passwordForm}
                                    layout="vertical"
                                    onFinish={handlePasswordRequest}
                                >
                                    <div className="space-y-5 sm:space-y-6">
                                        <div className="bg-[#050608]/70 rounded-2xl p-4 sm:p-5 border border-white/10 w-full">
                                            <div className="flex items-center gap-2 mb-3 sm:mb-4">
                                                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                                                    <LockOutlined className="text-white/70 text-xs" />
                                                </div>
                                                <Text className="text-xs font-semibold text-[#A9B3B8] uppercase tracking-wider">
                                                    {t("profile.current_authentication")}
                                                </Text>
                                            </div>
                                            <PasswordFormItem
                                                name="oldPassword"
                                                label={
                                                    <span className="text-sm font-medium text-white">
                                                        {t("profile.current_password")}
                                                    </span>
                                                }
                                                placeholder={t("profile.current_password")}
                                            />
                                        </div>

                                        <div className="relative">
                                            <div className="absolute left-1/2 -translate-x-1/2 -top-3 bg-[#050608] px-3 py-1 rounded-full border border-white/10 shadow-sm z-10">
                                                <Text className="text-xs font-medium text-[#A9B3B8] whitespace-nowrap">
                                                    {t("profile.new_credentials")}
                                                </Text>
                                            </div>
                                        </div>

                                        <div className="bg-[linear-gradient(135deg,rgba(41,216,213,0.12),rgba(11,11,11,0.9))] rounded-2xl p-4 sm:p-5 border border-[#29D8D5]/20 w-full">
                                            <div className="flex items-center gap-2 mb-3 sm:mb-4">
                                                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#29D8D5]/15 border border-[#29D8D5]/20 flex items-center justify-center flex-shrink-0">
                                                    <KeyOutlined className="text-[#44F3F0] text-xs" />
                                                </div>
                                                <Text className="text-xs font-semibold text-[#44F3F0] uppercase tracking-wider">
                                                    {t("profile.new_password_setup")}
                                                </Text>
                                            </div>

                                            <div className="space-y-4">
                                                <PasswordFormItem
                                                    name="password"
                                                    label={
                                                        <span className="text-sm font-medium text-white">
                                                            {t("profile.new_password")}
                                                        </span>
                                                    }
                                                    placeholder={t("profile.new_password")}
                                                />

                                                <ConfirmPasswordFormItem
                                                    label={
                                                        <span className="text-sm font-medium text-white">
                                                            {t("profile.confirm_new_password")}
                                                        </span>
                                                    }
                                                />
                                            </div>
                                        </div>

                                        <div className="bg-amber-500/10 rounded-2xl p-3 sm:p-4 border border-amber-500/20 flex items-start gap-2 sm:gap-3">
                                            <SafetyCertificateOutlined className="text-amber-300 text-sm sm:text-base mt-0.5 flex-shrink-0" />
                                            <Text className="text-xs sm:text-sm text-amber-50/90 leading-relaxed">
                                                {t("profile.email_verification_description")}
                                            </Text>
                                        </div>
                                    </div>

                                    <FormDivider />

                                    <Form.Item className="mb-0">
                                        <PrimaryButton
                                            htmlType="submit"
                                            loading={loading}
                                            icon={<LockOutlined />}
                                            block
                                            size="large"
                                            className="h-11 sm:h-12 text-sm sm:text-base font-semibold shadow-[0_12px_28px_rgba(41,216,213,0.22)] hover:shadow-[0_16px_34px_rgba(41,216,213,0.28)] transition-shadow w-full bg-[#29D8D5] border-0 text-[#021314]"
                                        >
                                            {t("profile.update_password_securely")}
                                        </PrimaryButton>
                                    </Form.Item>
                                </Form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PasswordChangeTab;
