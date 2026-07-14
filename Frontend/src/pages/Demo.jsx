import React from "react";
import { Layout } from "antd";
import Navbar from "../components/layout/Navbar";

const { Content } = Layout;

const Demo = () => {
    return (
        <Layout className="min-h-screen bg-white">
            <Navbar />
            <Content className="p-6 md:p-12">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-3xl font-bold mb-4">Product Demo</h1>
                    <p className="mb-6 text-gray-600">
                        Aquí tienes una demo rápida del panel de Ohnix by iTCycle.
                    </p>
                    <div className="aspect-video w-full rounded-lg overflow-hidden shadow-lg">
                        <iframe
                            title="Ohnix by iTCycle Demo"
                            width="100%"
                            height="480"
                            src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    </div>
                </div>
            </Content>
        </Layout>
    );
};

export default Demo;
