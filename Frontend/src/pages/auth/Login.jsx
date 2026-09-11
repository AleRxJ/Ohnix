import { useState, useContext, useEffect } from "react";
import { Form, Divider, Alert } from "antd";
import { DisconnectOutlined } from "@ant-design/icons";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import SeoHead from "../../components/common/SeoHead";
import { EmailInput, PasswordInput } from "../../components/auth/FormItems";
import AuthButton from "../../components/auth/AuthButton";
import useI18n from "../../hooks/useI18n";
import { getConnectivityState, subscribeConnectivity, checkNow } from "../../offline/connectivity";

const Login = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { t, currentLanguage } = useI18n();
    const [isOffline, setIsOffline] = useState(!getConnectivityState());

    // Logging in is the one thing that genuinely can never work offline -
    // there's no prior session on this device yet to fall back to (unlike
    // every other offline-aware screen in the app). Rather than let someone
    // type a password and only find out from a generic failed-submit toast,
    // check for real on mount (navigator.onLine alone isn't reliable enough
    // to trust silently - see connectivity.js) and show it up front.
    useEffect(() => {
        checkNow();
        return subscribeConnectivity((online) => setIsOffline(!online));
    }, []);

    // ProtectedRoute stashes the page the user was actually trying to reach
    // (pathname + query string, e.g. /billing?payment=cancelled&requestId=...
    // after bouncing back from an expired-session payment redirect) in
    // router state before sending them here. Always landing on /dashboard
    // instead silently threw that away - the user had no way to tell what
    // had happened to a payment they'd just made, short of digging through
    // the payment provider's own receipt page. `from` only ever comes from
    // our own ProtectedRoute (never attacker-controlled via the URL itself),
    // and is just a same-origin pathname+search, so this can't be turned
    // into an open redirect.
    const from = location.state?.from;
    const postLoginRedirect = from?.pathname
        ? `${from.pathname}${from.search || ""}`
        : "/dashboard";

    useEffect(() => {
        const emailFromQuery = searchParams.get("email");
        if (emailFromQuery) {
            form.setFieldsValue({ email: emailFromQuery });
        }
    }, [form, searchParams]);

    const onFinish = async (values) => {
        setLoading(true);
        const result = await login(values);
        if (result.success) {
            navigate(postLoginRedirect, { replace: true });
        }
        setLoading(false);
    };

    return (
        <AuthLayout>
            <SeoHead
                title="Iniciar sesion | Ohnix"
                description="Accede a tu cuenta de Ohnix para gestionar inventario, compras y ventas."
                canonicalPath="/login"
                lang={currentLanguage || "es"}
                noIndex={true}
            />
            <AuthCard
                title={t('auth.login')}
                subtitle={t('auth.login_success')}
            >
                {isOffline && (
                    <Alert
                        className="mb-5 dark-alert dark-alert-amber"
                        type="warning"
                        showIcon
                        icon={<DisconnectOutlined />}
                        message={t("auth.login_requires_connection")}
                    />
                )}
                <Form
                    form={form}
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
                            className="text-sm text-[var(--ohnix-text-muted)] hover:text-[#44F3F0] transition-colors"
                        >
                            {t('auth.forgot_password')}
                        </Link>
                    </div>

                    <Form.Item className="mb-0">
                        <AuthButton loading={loading}>{t('auth.login')}</AuthButton>
                    </Form.Item>

                    <Divider plain className="my-6 text-[var(--ohnix-text-muted)] text-sm before:border-[var(--ohnix-line-4)] after:border-[var(--ohnix-line-4)]">
                        {t('common.or')}
                    </Divider>

                    <div className="text-center text-sm">
                        <span className="text-[var(--ohnix-text-muted)]">
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
