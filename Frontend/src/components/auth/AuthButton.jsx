import React from "react";
import { Button } from "antd";
import PropTypes from "prop-types";

const AuthButton = ({
    children,
    loading = false,
    onClick,
    htmlType = "submit",
    icon,
    ...props
}) => {
    return (
        <Button
            type="primary"
            htmlType={htmlType}
            size="large"
            block
            loading={loading}
            onClick={onClick}
            icon={icon}
            className="h-11 rounded-xl bg-[#29D8D5] hover:bg-[#44F3F0] active:bg-[#23c4c1] text-[#021314] border-0 shadow-[0_10px_30px_rgba(41,216,213,0.26)] hover:shadow-[0_14px_35px_rgba(41,216,213,0.35)] transition-all duration-300 font-semibold"
            {...props}
        >
            {children}
        </Button>
    );
};

AuthButton.propTypes = {
    children: PropTypes.node.isRequired,
    loading: PropTypes.bool,
    onClick: PropTypes.func,
    htmlType: PropTypes.string,
    icon: PropTypes.node,
};

export default AuthButton;