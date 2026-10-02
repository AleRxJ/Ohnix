import React from "react";
import { useTheme } from "../../context/ThemeContext";
import OhnixLogo from "./OhnixLogo";

// The round app icon used in the nav rail / mobile header / mobile menu.
// Dark keeps the rendered PNG badge; lite used Ohnix_Icon_Lite.png, whose
// thin light-gray strokes (and clipped "OHNIX" wordmark) washed out on light
// surfaces - it now draws the vector logo on a light badge instead. Sized by
// the parent's existing `img` / `.ohnix-app-icon` rules in navigation.css.
const OhnixAppIcon = () => {
    const { isLite } = useTheme();

    if (!isLite) return <img src="/ohnix-icon-v2-192.png" alt="" aria-hidden="true" />;

    return (
        <span className="ohnix-app-icon ohnix-app-icon--lite" aria-hidden="true">
            <OhnixLogo size="100%" />
        </span>
    );
};

export default OhnixAppIcon;
