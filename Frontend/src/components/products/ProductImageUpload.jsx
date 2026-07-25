import React from "react";
import { Form, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";

const ProductImageUpload = ({ imageUrl, onChange }) => {
    return (
        <Form.Item
            name="product_image"
            valuePropName="fileList"
            getValueFromEvent={(e) => {
                if (Array.isArray(e)) {
                    return e;
                }
                return e?.fileList;
            }}
            className="w-full flex items-center justify-center mt-10"
        >
            <Upload
                listType="picture"
                maxCount={1}
                beforeUpload={() => false}
                onChange={onChange}
                showUploadList={false}
                className="block w-full"
            >
                {imageUrl ? (
                    <div className="w-full h-48 sm:h-56 md:h-64 border border-dashed border-white/12 rounded-lg overflow-hidden hover:border-[#29D8D5]/60 transition-colors duration-200 cursor-pointer bg-white/[0.03]">
                        <img
                            src={imageUrl}
                            alt="Product"
                            className="w-full h-full object-cover"
                        />
                    </div>
                ) : (
                    <div className="w-full h-48 sm:h-56 md:h-64 border border-dashed border-white/12 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] hover:border-[#29D8D5]/60 transition-all duration-200 cursor-pointer flex items-center justify-center">
                        <div className="flex flex-col items-center justify-center gap-3 px-4">
                            <div className="w-12 h-12 rounded-full bg-[#29D8D5]/10 flex items-center justify-center">
                                <UploadOutlined className="text-2xl text-[#29D8D5]" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium text-white mb-1">
                                    Click to upload product image
                                </p>
                                <p className="text-xs text-[#A9B3B8]">
                                    PNG, JPG up to 5MB
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </Upload>
        </Form.Item>
    );
};

export default ProductImageUpload;