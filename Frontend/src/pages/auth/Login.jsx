import { useState, useContext } from "react";
import { Form, Divider } from "antd";
import { Link, useNavigate } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import { EmailInput, PasswordInput } from "../../components/auth/FormItems";
import AuthButton from "../../components/auth/AuthButton";
import useI18n from "../../hooks/useI18n";

const Login = () => {
    const [loading, setLoading] = useState(false);
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();
    const { t } = useI18n();

    const onFinish = async (values) => {
        setLoading(true);
        const result = await login(values);
        if (result.success) {
            navigate("/dashboard");
        }
        setLoading(false);
    };

    return (
        <AuthLayout>
            <AuthCard
                title={t('auth.login')}
                subtitle={t('auth.login_success')}
            >
                <Form
                    name="login-form"
                    className="w-full"
                    onFinish={onFinish}
                    layout="vertical"
                >
                    <div className="space-y-4 mb-6">
                        <EmailInput />
                        <PasswordInput />
                    </div>

                    <div className="flex justify-end mb-5">
                        <Link
                            to="/reset-password"
                            className="text-sm text-[#A9B3B8] hover:text-[#44F3F0] transition-colors"
                        >
                            {t('auth.forgot_password')}
                        </Link>
                    </div>

                    <Form.Item className="mb-0">
                        <AuthButton loading={loading}>{t('auth.login')}</AuthButton>
                    </Form.Item>

                    <Divider plain className="my-6 text-[#A9B3B8] text-sm before:border-white/10 after:border-white/10">
                        {t('common.or')}
                    </Divider>

                    <div className="text-center text-sm">
                        <span className="text-[#A9B3B8]">
                            {t('auth.dont_have_account')}
                        </span>{" "}
                        <Link
                            to="/signup"
                            className="text-[#44F3F0] hover:text-[#29D8D5] font-medium transition-colors"
                        >
                            {t('auth.signup')}
                        </Link>
                    </div>
                </Form>
            </AuthCard>
        </AuthLayout>
    );
};

export default Login;
