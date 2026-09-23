import { useState } from "react";
import { Collapse, Tag, Tooltip } from "antd";
import { BulbOutlined, InfoCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

// Collapsible "how to use this section" card - first used in Accounting.jsx,
// shared so other modules (e.g. ProductionOrders.jsx) explain their flow the
// same way. Starts open until the user toggles it once; that "seen" flag lives
// under storageKey (per-viewer convenience only, so a blocked storage just
// means it opens again).
const SectionGuide = ({ storageKey, title, summary, steps = [], result, concepts = [] }) => {
    const { t } = useI18n();
    const [openKeys, setOpenKeys] = useState(() => {
        try { return localStorage.getItem(storageKey) ? [] : ["guide"]; }
        catch { return ["guide"]; }
    });
    const handleChange = (keys) => {
        const normalized = Array.isArray(keys) ? keys : [keys].filter(Boolean);
        setOpenKeys(normalized);
        try { localStorage.setItem(storageKey, "seen"); } catch { /* browser storage may be disabled */ }
    };
    return (
        <div className="accounting-section-guide">
            <div className="accounting-section-guide__summary">
                <span className="accounting-section-guide__icon"><BulbOutlined /></span>
                <div><strong>{title}</strong><p>{summary}</p></div>
            </div>
            <Collapse
                ghost
                activeKey={openKeys}
                onChange={handleChange}
                expandIconPosition="end"
                items={[{
                    key: "guide",
                    label: <span className="accounting-section-guide__toggle"><QuestionCircleOutlined />{t("common.guide_how_it_works")}</span>,
                    children: (
                        <div className="accounting-section-guide__content">
                            {steps.length > 0 && <div><span>{t("common.guide_what_to_do")}</span><ol>{steps.map((step, index) => <li key={index}>{step}</li>)}</ol></div>}
                            {result && <div className="accounting-section-guide__result"><span>{t("common.guide_result")}</span><p>{result}</p></div>}
                            {concepts.length > 0 && <div className="accounting-section-guide__concepts"><span>{t("common.guide_key_concepts")}</span><div>{concepts.map((concept) => <Tooltip key={concept.label} title={concept.help}><Tag icon={<InfoCircleOutlined />}>{concept.label}</Tag></Tooltip>)}</div></div>}
                        </div>
                    ),
                }]}
            />
        </div>
    );
};

export default SectionGuide;
