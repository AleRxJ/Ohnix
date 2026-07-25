import React from "react";
import { Select } from "antd";
import { DollarOutlined } from "@ant-design/icons";
import { useCurrency } from "../../context/CurrencyContext";

const CurrencySelector = ({ className = "" }) => {
    const { currencyCode, setCurrencyCode, currencyOptions } = useCurrency();

    return (
        <Select
            value={currencyCode}
            onChange={setCurrencyCode}
            options={currencyOptions}
            prefix={<DollarOutlined />}
            className={className}
            style={{ minWidth: 220 }}
        />
    );
};

export default CurrencySelector;
