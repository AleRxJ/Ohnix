import React from "react";
import { Row, Col, Card, Divider } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { useAuth } from "../hooks/useAuth";
import { useCategories } from "../hooks/categories_units/useCategories";
import { useUnits } from "../hooks/categories_units/useUnits";
import PageHeader from "../components/common/PageHeader";
import StatsSection from "../components/common/StatsSection";
import CategorySection from "../components/categories/CategorySection";
import UnitSection from "../components/units/UnitSection";
import useI18n from "../hooks/useI18n";
import { useTeam } from "../context/TeamContext";

const CategoryUnit = () => {
    const { t } = useI18n();
    const { user, isAdmin } = useAuth();
    const { team } = useTeam();
    // ✅ Llamar a los hooks UNA SOLA VEZ aquí
    const categoryHook = useCategories();
    const unitHook = useUnits();

    return (
        <div className="min-h-screen p-4 sm:p-6 bg-transparent text-white">
            <div className="max-w-7xl mx-auto">
                {/* Enhanced Header */}
                <div className="mb-8">
                    <PageHeader
                        title={t("categories_units.categories_units")}
                        subtitle={t("categories_units.manage_inventory_categories_units")}
                        icon={<InboxOutlined />}
                    />
                </div>

                <div className="mb-8">
                    <StatsSection
                        categoryStats={categoryHook.stats}
                        unitStats={unitHook.stats}
                        showMineStats={!team}
                    />
                </div>

                {/* Main Content with Enhanced Layout */}
                <Row gutter={[24, 24]}>
                    <Col xs={24} xl={12}>
                        <div className="h-full">
                            <div className="h-full rounded-xl border border-white/10 bg-[#0B0B0B]/90 shadow-[0_16px_36px_rgba(0,0,0,0.3)]">
                                <CategorySection
                                    user={user}
                                    isAdmin={isAdmin}
                                    categoryHook={categoryHook}
                                />
                            </div>
                        </div>
                    </Col>
                    <Col xs={24} xl={12}>
                        <div className="h-full">
                            <div className="h-full rounded-xl border border-white/10 bg-[#0B0B0B]/90 shadow-[0_16px_36px_rgba(0,0,0,0.3)]">
                                <UnitSection 
                                    user={user} 
                                    isAdmin={isAdmin}
                                    unitHook={unitHook}
                                />
                            </div>
                        </div>
                    </Col>
                </Row>

                {/* Optional Divider for Visual Separation */}
            </div>
        </div>
    );
};

export default CategoryUnit;
