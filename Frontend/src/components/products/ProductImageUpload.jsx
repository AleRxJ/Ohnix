import React from "react";
import { Form, Upload } from "antd";
import PhotoDropZone from "../common/PhotoDropZone";
import useI18n from "../../hooks/useI18n";

const ProductImageUpload = ({ imageUrl, onChange }) => {
    const { t } = useI18n();
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
                className="product-image-upload block w-full"
            >
                <PhotoDropZone
                    imageUrl={imageUrl}
                    title={t("products.upload_image_hint")}
                    subtitle={t("products.upload_image_size_hint")}
                />
            </Upload>
        </Form.Item>
    );
};

export default ProductImageUpload;