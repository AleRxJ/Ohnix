import React from "react";
import { Form, Input } from "antd";
import {
    UserOutlined,
    LockOutlined,
    MailOutlined,
    KeyOutlined,
} from "@ant-design/icons";
import PropTypes from "prop-types";
import useI18n from "../../hooks/useI18n";

export const EmailInput = ({ name = "email", required = true, ...props }) => {
    const { t } = useI18n();

    return (
        <Form.Item
            name={name}
            rules={[
                {
                    required,
                    message: t("auth.email_required"),
                },
                {
                    type: "email",
                    message: t("validation.invalid_email"),
                },
            ]}
            {...props}
        >
            <Input
                prefix={<MailOutlined className="text-slate-400" />}
                placeholder={t("common.email")}
                size="large"
                className="rounded-xl border-slate-200 hover:border-indigo-400 focus:border-indigo-500 bg-white transition-colors"
            />
        </Form.Item>
    );
};

export const PasswordInput = ({
    name = "password",
    placeholder = "Password",
    required = true,
    hasFeedback = false,
    ...props
}) => {
    const { t } = useI18n();

    return (
        <Form.Item
            name={name}
            rules={[
                {
                    required,
                    message: t("auth.password_required"),
                },
                {
                    min: 6,
                    message: t("validation.password_too_short"),
                },
            ]}
            hasFeedback={hasFeedback}
            {...props}
        >
            <Input.Password
                prefix={<LockOutlined className="text-slate-400" />}
                placeholder={placeholder === "Password" ? t("common.password") : placeholder}
                size="large"
                className="rounded-xl border-slate-200 hover:border-indigo-400 focus:border-indigo-500 bg-white transition-colors"
            />
        </Form.Item>
    );
};

export const UsernameInput = ({
    name = "username",
    required = true,
    ...props
}) => {
    const { t } = useI18n();

    return (
        <Form.Item
            name={name}
            rules={[
                {
                    required,
                    message: t("auth.username_required"),
                },
                {
                    min: 3,
                    message: t("validation.username_too_short"),
                },
            ]}
            {...props}
        >
            <Input
                prefix={<UserOutlined className="text-slate-400" />}
                placeholder={t("common.username")}
                size="large"
                className="rounded-xl border-slate-200 hover:border-indigo-400 focus:border-indigo-500 bg-white transition-colors"
            />
        </Form.Item>
    );
};

export const OtpInput = ({ name = "otp", required = true, ...props }) => {
    const { t } = useI18n();

    return (
        <Form.Item
            name={name}
            rules={[
                {
                    required,
                    message: t("auth.otp_required"),
                },
                {
                    len: 6,
                    message: t("validation.otp_six_digits"),
                },
                {
                    pattern: /^\d+$/,
                    message: t("validation.otp_numbers"),
                },
            ]}
            {...props}
        >
            <Input
                prefix={<KeyOutlined className="text-slate-400" />}
                placeholder={t("auth.enter_6_digit_code")}
                size="large"
                className="rounded-xl border-slate-200 hover:border-indigo-400 focus:border-indigo-500 bg-white transition-colors"
                maxLength={6}
            />
        </Form.Item>
    );
};

const inputPropTypes = {
    name: PropTypes.string,
    required: PropTypes.bool,
};

EmailInput.propTypes = inputPropTypes;

PasswordInput.propTypes = {
    ...inputPropTypes,
    placeholder: PropTypes.string,
    hasFeedback: PropTypes.bool,
};

UsernameInput.propTypes = inputPropTypes;

OtpInput.propTypes = inputPropTypes;