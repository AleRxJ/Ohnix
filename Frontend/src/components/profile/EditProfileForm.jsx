import React from "react";
import { Form, Typography } from "antd";
import {
    SaveOutlined,
    CloseOutlined,
    UserOutlined,
    MailOutlined,
    LockOutlined,
} from "@ant-design/icons";
import { FormDivider, PrimaryButton, SecondaryButton } from "../common/UI";
import { EmailFormItem, UsernameFormItem } from "../common/FormItems";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

const EditProfileForm = ({
    profileForm,
    handleProfileUpdate,
    loading,
    setEditMode,
    user,
}) => {
    const { t } = useI18n();

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div className="rounded-3xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] shadow-[0_18px_50px_rgba(0,0,0,0.24)] overflow-hidden backdrop-blur-md">
                <div className="bg-[linear-gradient(135deg,rgba(41,216,213,0.16),var(--ohnix-line-1))] px-5 sm:px-6 py-5 sm:py-6 border-b border-[var(--ohnix-line-4)]">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#29D8D5] flex items-center justify-center shadow-[0_12px_28px_rgba(41,216,213,0.24)]">
                            <UserOutlined className="text-[#021314] text-xl" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-semibold text-[var(--ohnix-text-primary)] m-0 leading-tight">
                                {t("profile.edit_profile")}
                            </h2>
                            <Text className="text-sm text-[var(--ohnix-text-muted)]">
                                {t("profile.edit_profile_description")}
                            </Text>
                        </div>
                    </div>
                </div>

                <div className="p-5 sm:p-6 lg:p-8">
                    <Form
                        form={profileForm}
                        layout="vertical"
                        onFinish={handleProfileUpdate}
                    >
                        <div className="space-y-5 lg:space-y-6">
                            <div className="rounded-2xl p-5 border border-[var(--ohnix-line-4)] bg-[#050608]/70">
                                <div className="flex items-center gap-2.5 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] flex items-center justify-center">
                                        <UserOutlined className="text-[#44F3F0] text-base" />
                                    </div>
                                    <div>
                                        <Text
                                            strong
                                            className="text-sm text-[var(--ohnix-text-primary)] block leading-none"
                                        >
                                            {t("profile.username")}
                                        </Text>
                                        <Text className="text-xs text-[var(--ohnix-text-muted)]">
                                            {t("profile.choose_unique_username")}
                                        </Text>
                                    </div>
                                </div>
                                <UsernameFormItem />
                            </div>

                            <div className="rounded-2xl p-5 border border-[var(--ohnix-line-4)] bg-[#050608]/70">
                                <div className="flex items-center gap-2.5 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] flex items-center justify-center">
                                        <MailOutlined className="text-[var(--ohnix-text-muted)] text-base" />
                                    </div>
                                    <div>
                                        <Text
                                            strong
                                            className="text-sm text-[var(--ohnix-text-primary)] block leading-none"
                                        >
                                            {t("profile.email")}
                                        </Text>
                                        <Text className="text-xs text-[var(--ohnix-text-muted)] flex items-center gap-1">
                                            <LockOutlined className="text-xs" />
                                            {t("profile.email_cannot_be_changed")}
                                        </Text>
                                    </div>
                                </div>
                                <EmailFormItem value={user?.email} />
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-[var(--ohnix-line-4)]">
                            <Form.Item className="mb-0">
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                    <PrimaryButton
                                        htmlType="submit"
                                        loading={loading}
                                        icon={<SaveOutlined />}
                                        className="sm:flex-none h-11 font-medium rounded-xl border-0 bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0] shadow-[0_12px_28px_rgba(41,216,213,0.22)]"
                                    >
                                        {t("profile.save_changes")}
                                    </PrimaryButton>

                                    <SecondaryButton
                                        onClick={() => setEditMode(false)}
                                        icon={<CloseOutlined />}
                                        className="sm:flex-none h-11 font-medium rounded-xl border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:bg-[var(--ohnix-line-2)] hover:border-[var(--ohnix-line-6)]"
                                    >
                                        {t("profile.cancel")}
                                    </SecondaryButton>
                                </div>
                            </Form.Item>
                        </div>
                    </Form>
                </div>
            </div>
        </div>
    );
};

export default EditProfileForm;
