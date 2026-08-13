import React from "react";
import { Spin, Typography } from "antd";

const { Text } = Typography;

const LoadingSpinner = ({ tip = "Loading...", height = "75vh" }) => {
    return (
        <div
            className="flex flex-col items-center justify-center relative overflow-hidden"
            style={{ height }}
        >
            <div className="absolute h-40 w-40 rounded-full border border-[#29D8D5]/15 animate-drift" />
            <div className="absolute h-56 w-56 rounded-full border border-[var(--ohnix-line-3)] animate-glow-pulse" />
            <div className="relative z-10 flex flex-col items-center">
                <Spin size="large" />
                <Text className="mt-4 text-[var(--ohnix-text-muted)]">{tip}</Text>
            </div>
        </div>
    );
};

export default LoadingSpinner;
