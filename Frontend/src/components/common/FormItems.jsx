import React from "react";
import { Form, Input } from "antd";
import { LockOutlined, UserOutlined, MailOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

export const UsernameFormItem = ({
    required = true,
    disabled = false,
    value,
}) => {
    const { t } = useI18n();

    return (
        <Form.Item
            label={
                <span className="text-indigo-700 font-medium">{t("common.username")}</span>
            }
            name="username"
            rules={
                required
                    ? [
                          {
                              required: true,
                              message: t("auth.username_required"),
                          },
                      ]
                    : []
            }
        >
            <Input
                prefix={<UserOutlined className="text-indigo-400" />}
                placeholder={t("common.username")}
                size="large"
                className="rounded-lg h-12"
                disabled={disabled}
                value={value}
            />
        </Form.Item>
    );
};

export const EmailFormItem = ({ disabled = true, value }) => {
    const { t } = useI18n();

    return (
        <Form.Item
            label={<span className="text-indigo-700 font-medium">{t("common.email")}</span>}
        >
            <Input
                prefix={<MailOutlined className="text-indigo-400" />}
                value={value}
                disabled={disabled}
                className="rounded-lg h-12 !bg-[var(--ohnix-line-2)] !border-[var(--ohnix-line-4)] !text-[var(--ohnix-text-primary)]"
                style={{
                    color: "var(--ohnix-text-primary)",
                    WebkitTextFillColor: "var(--ohnix-text-primary)",
                    opacity: 1,
                }}
                size="large"
            />
        </Form.Item>
    );
};

export const PasswordFormItem = ({
    name,
    label,
    placeholder,
    required = true,
}) => {
    const { t } = useI18n();

    return (
        <Form.Item
            label={<span className="text-indigo-700 font-medium">{label}</span>}
            name={name}
            rules={[
                {
                    required: required,
                    message: t("auth.password_required"),
                },
                name === "password" && {
                    min: 6,
                    message: t("validation.password_too_short"),
                },
            ].filter(Boolean)}
        >
            <Input.Password
                prefix={<LockOutlined className="text-indigo-400" />}
                placeholder={placeholder}
                size="large"
                className="rounded-lg h-12"
            />
        </Form.Item>
    );
};

export const ConfirmPasswordFormItem = () => {
    const { t } = useI18n();

    return (
        <Form.Item
            label={
                <span className="text-indigo-700 font-medium">
                    {t("auth.confirm_new_password")}
                </span>
            }
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
                {
                    required: true,
                    message: t("auth.confirm_password_required"),
                },
                ({ getFieldValue }) => ({
                    validator(_, value) {
                        if (!value || getFieldValue("password") === value) {
                            return Promise.resolve();
                        }
                        return Promise.reject(
                            new Error(t("auth.password_mismatch"))
                        );
                    },
                }),
            ]}
        >
            <Input.Password
                prefix={<LockOutlined className="text-indigo-400" />}
                placeholder={t("auth.confirm_new_password")}
                size="large"
                className="rounded-lg h-12"
            />
        </Form.Item>
    );
};
