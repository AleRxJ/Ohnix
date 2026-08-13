import { Link } from "react-router-dom";

const BreadcrumbNav = ({ items }) => {
    if (!items || items.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--ohnix-text-muted)]">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    return (
                        <li key={`${item.label}-${index}`} className="flex items-center gap-2">
                            {item.to && !isLast ? (
                                <Link to={item.to} className="hover:text-[var(--ohnix-text-primary)] transition-colors">
                                    {item.label}
                                </Link>
                            ) : (
                                <span className={isLast ? "text-[var(--ohnix-text-primary)]" : ""}>{item.label}</span>
                            )}
                            {!isLast ? <span aria-hidden="true">/</span> : null}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

export default BreadcrumbNav;
