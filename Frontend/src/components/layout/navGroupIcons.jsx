import { HomeOutlined, ShopOutlined, InboxOutlined, ShoppingOutlined, DollarCircleOutlined, SettingOutlined, ApartmentOutlined } from "@ant-design/icons";

// One icon per business area (see NAV_GROUPS in hooks/useNavItems.js) -
// shared by the sidebar rail and the header breadcrumb.
export const NAV_GROUP_ICONS = {
    home: <HomeOutlined />,
    sell: <ShopOutlined />,
    inventory: <InboxOutlined />,
    buy: <ShoppingOutlined />,
    money: <DollarCircleOutlined />,
    company: <SettingOutlined />,
    admin: <ApartmentOutlined />,
};
