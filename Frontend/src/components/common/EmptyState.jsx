import { InboxOutlined } from "@ant-design/icons";

// antd's default <Empty/> ships light-theme colors (near-invisible light-gray
// illustration + dark-gray text) with no dark algorithm configured anywhere
// in the app (see AntdConfigProvider.jsx) - this was already being
// hand-patched with an inline div in ProductDetailsDrawer.jsx and
// OrderDetailsDrawer.jsx (copy-pasted, not shared). Centralized here so new
// empty states don't repeat the same patch a third/fourth/fifth time.
const EmptyState = ({
    icon = <InboxOutlined />,
    title,
    subtitle,
    action,
    className = "",
    compact = false,
}) => (
    <div
        className={`flex flex-col items-center justify-center text-center gap-2 ${compact ? "py-6" : "py-10 sm:py-12"} ${className}`}
    >
        <span className="text-2xl sm:text-3xl text-[var(--ohnix-text-dim)]">{icon}</span>
        {title && (
            <p className="text-sm sm:text-base font-medium text-[var(--ohnix-text-primary)] m-0">
                {title}
            </p>
        )}
        {subtitle && (
            <p className="text-xs sm:text-sm text-[var(--ohnix-text-muted)] m-0 max-w-xs">
                {subtitle}
            </p>
        )}
        {action && <div className="mt-2">{action}</div>}
    </div>
);

export default EmptyState;
