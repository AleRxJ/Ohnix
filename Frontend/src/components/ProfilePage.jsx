import React, { useState, useContext, useEffect } from "react";
import { Layout, Card, Form, Tabs } from "antd";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { userService } from "../services/userService";
import { useNavigate } from "react-router-dom";
import { ArrowLeftOutlined } from "@ant-design/icons";

import ProfileHeader from "../components/profile/ProfileHeader";
import EditProfileForm from "../components/profile/EditProfileForm";
import AccountInfoTab from "../components/profile/AccountInfoTab";
import PasswordChangeTab from "../components/profile/PasswordChangeTab";
import OtpVerificationModal from "../components/profile/OtpVerificationModal";

const { Content } = Layout;

const ProfilePage = () => {
    const { user, refreshUser } = useContext(AuthContext);
    const { t } = useI18n();
    const navigate = useNavigate();

    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();
    const [otpForm] = Form.useForm();

    const [loading, setLoading] = useState(false);
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [activeTab, setActiveTab] = useState("1");
    const [editMode, setEditMode] = useState(false);

    const [isVerified, setIsVerified] = useState(user?.isVerified || false);
    const [newPasswordData, setNewPasswordData] = useState(null);

    useEffect(() => {
        if (user) {
            profileForm.setFieldsValue({
                username: user.username,
            });
            setIsVerified(user.isVerified || false);
        }
    }, [user, profileForm]);

    const handleProfileUpdate = async (values) => {
        try {
            setLoading(true);
            await userService.updateProfile(values.username);
            refreshUser();
            setEditMode(false);
        } catch (error) {
            console.error("Profile update error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async (info) => {
        if (info.file.status === "uploading") {
            setAvatarLoading(true);
            return;
        }

        if (info.file.originFileObj) {
            try {
                await userService.updateAvatar(info.file.originFileObj);
                refreshUser();
            } catch (error) {
                console.error("Avatar upload error:", error);
            } finally {
                setAvatarLoading(false);
            }
        }
    };

    const customUploadRequest = ({ onSuccess }) => {
        setTimeout(() => {
            onSuccess("ok");
        }, 0);
    };

    const handlePasswordRequest = (values) => {
        setNewPasswordData({
            oldPassword: values.oldPassword,
            newPassword: values.password,
        });
        setShowOtpModal(true);
        handleSendOtp();
    };

    const handleSendOtp = async () => {
        try {
            setLoading(true);
            await userService.sendChangePasswordOtp();
        } catch (error) {
            console.error("Send OTP error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (values) => {
        try {
            setLoading(true);
            const verifyResponse = await userService.verifyOtp(values.otp);

            if (verifyResponse.success) {
                if (newPasswordData) {
                    await userService.changePassword(
                        newPasswordData.oldPassword,
                        newPasswordData.newPassword
                    );
                    passwordForm.resetFields();
                    setShowOtpModal(false);
                    setNewPasswordData(null);
                    refreshUser();
                } else {
                    toast.success("Your email has been verified successfully", {
                        position: "top-right",
                        duration: 3000,
                    });
                    setIsVerified(true);
                    refreshUser();
                    setShowOtpModal(false);
                }
            }
        } catch (error) {
            console.error("Verify OTP error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleTabChange = (key) => {
        setActiveTab(key);
    };

    return (
        <Content className="min-h-screen bg-[#050608] text-white relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-[#29D8D5]/12 blur-3xl" />
                <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-[#44F3F0]/10 blur-3xl" />
                <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
            </div>

            <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 lg:py-10 space-y-6 sm:space-y-7">
                <div className="flex justify-start">
                    <button
                        type="button"
                        onClick={() => navigate("/dashboard")}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.08] hover:border-white/15"
                    >
                        <ArrowLeftOutlined className="text-[#44F3F0]" />
                        {t("profile.back_to_dashboard")}
                    </button>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_70px_rgba(0,0,0,0.35)] overflow-hidden backdrop-blur-md">
                    <ProfileHeader
                        user={user}
                        isVerified={isVerified}
                        avatarLoading={avatarLoading}
                        handleAvatarUpload={handleAvatarUpload}
                        customUploadRequest={customUploadRequest}
                        setEditMode={setEditMode}
                    />

                    <div className="border-t border-white/10 bg-[#0B0B0B]/78">
                        {editMode ? (
                            <div className="p-4 sm:p-6 lg:p-8">
                                <EditProfileForm
                                    profileForm={profileForm}
                                    handleProfileUpdate={handleProfileUpdate}
                                    loading={loading}
                                    setEditMode={setEditMode}
                                    user={user}
                                />
                            </div>
                        ) : (
                            <Tabs
                                activeKey={activeTab}
                                onChange={handleTabChange}
                                size="large"
                                className="profile-tabs px-2 sm:px-4 lg:px-6 pt-1"
                                items={[
                                    {
                                        key: "1",
                                        label: t("profile.account_information"),
                                        children: (
                                            <AccountInfoTab
                                                user={user}
                                                isVerified={isVerified}
                                                refreshUser={refreshUser}
                                                handleTabChange={
                                                    handleTabChange
                                                }
                                            />
                                        ),
                                    },
                                    {
                                        key: "2",
                                        label: t("profile.change_password"),
                                        children: (
                                            <PasswordChangeTab
                                                passwordForm={passwordForm}
                                                handlePasswordRequest={
                                                    handlePasswordRequest
                                                }
                                                loading={loading}
                                            />
                                        ),
                                    },
                                ]}
                            />
                        )}
                    </div>
                </div>
            </div>

            <OtpVerificationModal
                showOtpModal={showOtpModal}
                setShowOtpModal={setShowOtpModal}
                otpForm={otpForm}
                handleVerifyOtp={handleVerifyOtp}
                handleSendOtp={handleSendOtp}
                loading={loading}
                newPasswordData={newPasswordData}
            />
        </Content>
    );
};

export default ProfilePage;
