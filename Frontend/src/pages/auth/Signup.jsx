import { useState } from "react";
import { Form, Divider, Select } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import {
    EmailInput,
    PasswordInput,
    UsernameInput,
} from "../../components/auth/FormItems";
import AuthButton from "../../components/auth/AuthButton";
import AvatarUpload from "../../components/common/AvatarUpload";
import { api } from "../../api/api";
import useI18n from "../../hooks/useI18n";

const Signup = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [avatarFile, setAvatarFile] = useState(null);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t, currentLanguage } = useI18n();

    const initialDesiredPlan = ["starter", "growth", "enterprise"].includes(
        searchParams.get("plan")
    )
        ? searchParams.get("plan")
        : "starter";
    const initialEmail = searchParams.get("email") || "";

    const handleAvatarChange = (info) => {
        if (info.file.status === "done") {
            setAvatarFile(info.file.originFileObj);
        }
    };

    const onFinish = async (values) => {
        try {
            setLoading(true);

            const formData = new FormData();
            formData.append("username", values.username);
            formData.append("email", values.email);
            formData.append("password", values.password);
            formData.append("avatar", avatarFile);
            formData.append("preferredLanguage", currentLanguage || "es");
            if (values.desiredPlan && values.desiredPlan !== "starter") {
                formData.append("desiredPlan", values.desiredPlan);
            }

            const response = await api.post(`/users/register`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });

            if (response.data.success) {
                const requestedPlan = values.desiredPlan || "starter";
                if (["growth", "enterprise"].includes(requestedPlan)) {
                    toast.success(t("auth.account_created_plan_request"));
                } else {
                    toast.success(t("auth.account_created"));
                }
                navigate(`/signup/request-status?plan=${requestedPlan}`);
            }
        } catch (error) {
            const errorMessage =
                error.response?.data?.message ||
                t("auth.signup_failed");

            if (
                typeof errorMessage === "string" &&
                errorMessage.toLowerCase().includes("already exists")
            ) {
                toast.error(t("auth.account_exists_redirect_login"));
                navigate(
                    `/login?email=${encodeURIComponent(values.email || initialEmail || "")}`
                );
                return;
            }

            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <AuthCard
                title={t("auth.create_account")}
                subtitle={t("auth.join_platform")}
            >
                <Form
                    form={form}
                    name="signup_form"
                    onFinish={onFinish}
                    initialValues={{ desiredPlan: initialDesiredPlan, email: initialEmail }}
                    layout="vertical"
                    requiredMark={false}
                    className="w-full"
                >
                    <div className="flex justify-center mb-6">
                        <div className="w-24 h-24">
                            <AvatarUpload onChange={handleAvatarChange} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <UsernameInput />
                        <EmailInput />
                        <PasswordInput hasFeedback={true} />
                        <Form.Item
                            name="desiredPlan"
                            label={t("auth.desired_plan")}
                        >
                            <Select
                                options={[
                                    {
                                        value: "starter",
                                        label: t("profile.subscription.plan_starter"),
                                    },
                                    {
                                        value: "growth",
                                        label: t("profile.subscription.plan_growth"),
                                    },
                                    {
                                        value: "enterprise",
                                        label: t("profile.subscription.plan_enterprise"),
                                    },
                                ]}
                            />
                        </Form.Item>
                    </div>

                    <Form.Item className="mb-0 mt-6">
                        <AuthButton loading={loading}>{t("auth.signup")}</AuthButton>
                    </Form.Item>
                </Form>

                <Divider className="my-6" plain>
                    {t("common.or")}
                </Divider>

                <div className="text-center text-sm">
                    <span className="text-[#A9B3B8]">{t("auth.already_have_account")}</span>{" "}
                    <button
                        onClick={() => navigate("/login")}
                        className="text-[#44F3F0] font-medium hover:text-[#29D8D5] transition-colors"
                    >
                        {t("auth.login")}
                    </button>
                </div>
            </AuthCard>
        </AuthLayout>
    );
};

export default Signup;
