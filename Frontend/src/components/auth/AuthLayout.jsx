import React from "react";
import PropTypes from "prop-types";

const AuthLayout = ({ children, imageSrc }) => {
    return (
        <div className="relative flex min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(41,216,213,0.14),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(68,243,240,0.1),transparent_30%),linear-gradient(180deg,#070707_0%,#050505_100%)]">
            <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:46px_46px]" />

            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden border-r border-white/10">
                <div className="absolute -left-20 top-20 h-56 w-56 rounded-full border border-[#29D8D5]/30" />
                <div className="absolute right-10 bottom-12 h-64 w-64 rounded-full border border-white/10" />
                <div className="absolute inset-0 bg-gradient-to-br from-[#041314]/40 via-transparent to-[#040505]/80" />
                <div className="relative z-10 flex items-center justify-center w-full p-12">
                    <img
                        src={imageSrc || "/Ohnix_FullLogo.svg"}
                        alt="Authentication"
                        className="object-contain max-h-[80vh] w-auto drop-shadow-2xl animate-float-glow"
                    />
                </div>
            </div>

            <div className="relative w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8 lg:p-12">
                <div className="w-full max-w-md animate-fade-up">{children}</div>
            </div>
        </div>
    );
};

AuthLayout.propTypes = {
    children: PropTypes.node.isRequired,
    imageSrc: PropTypes.string,
};

export default AuthLayout;
