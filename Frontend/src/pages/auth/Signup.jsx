import { useState } from "react";
import { Form, Divider } from "antd";
import { useNavigate } from "react-router-dom";
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
    const { t } = useI18n();

    const handleAvatarChange = (info) => {
        if (info.file.status === "done") {
            setAvatarFile(info.file.originFileObj);
        }
    };

    const onFinish = async (values) => {
        if (!avatarFile) {
            toast.error(t("auth.upload_avatar"));
            return;
        }

        try {
            setLoading(true);

            const formData = new FormData();
            formData.append("username", values.username);
            formData.append("email", values.email);
            formData.append("password", values.password);
            formData.append("avatar", avatarFile);

            const response = await api.post(`/users/register`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });

            if (response.data.success) {
                toast.success(t("auth.account_created"));
                navigate("/login");
            }
        } catch (error) {
            const errorMessage =
                error.response?.data?.message ||
                t("auth.signup_failed");
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout imageSrc="/imsTopImage.png">
            <AuthCard
                title={t("auth.create_account")}
                subtitle={t("auth.join_platform")}
            >
                <Form
                    form={form}
                    name="signup_form"
                    onFinish={onFinish}
                    layout="vertical"
                    requiredMark={false}
                    className="w-full"
                >
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-28 h-28">
                            <AvatarUpload onChange={handleAvatarChange} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <UsernameInput />
                        <EmailInput />
                        <PasswordInput hasFeedback={true} />
                    </div>

                    <Form.Item className="mb-0 mt-6">
                        <AuthButton loading={loading}>{t("auth.signup")}</AuthButton>
                    </Form.Item>
                </Form>

                <Divider className="my-6" plain>
                    {t("common.or")}
                </Divider>

                <div className="text-center text-sm">
                    <span className="text-gray-600">{t("auth.already_have_account")}</span>{" "}
                    <button
                        onClick={() => navigate("/login")}
                        className="text-blue-600 font-medium hover:text-blue-700 transition-colors"
                    >
                        {t("auth.login")}
                    </button>
                </div>
            </AuthCard>
        </AuthLayout>
    );
};

export default Signup;
