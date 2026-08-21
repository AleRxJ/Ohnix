import { useState } from "react";
import { Form } from "antd";
import { toast } from "react-hot-toast";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";

export const useSupplierForm = (onSuccess) => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive, effectiveSteps, stepIndex } = useInventoryTour();
    const [modalVisible, setModalVisible] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [fileList, setFileList] = useState([]);
    const [form] = Form.useForm();

    const isTourCreateStep = isTutorialActive && !editMode && effectiveSteps[stepIndex]?.id === "create-supplier";

    const openCreateModal = () => {
        setEditMode(false);
        setSelectedSupplier(null);
        form.resetFields();
        setFileList([]);
        if (isTourCreateStep) {
            form.setFieldsValue({
                name: t("inventory_tour.practice_supplier_name"),
                email: "practica@ohnix.app",
                phone: "3000000000",
                address: t("inventory_tour.practice_address"),
            });
        }
        setModalVisible(true);
    };

    const openEditModal = (supplier) => {
        setSelectedSupplier(supplier);
        setEditMode(true);
        form.setFieldsValue({
            name: supplier.name,
            email: supplier.email,
            phone: supplier.phone,
            address: supplier.address,
            shopname: supplier.shopname,
            type: supplier.type,
            bank_name: supplier.bank_name,
            account_holder: supplier.account_holder,
            account_number: supplier.account_number,
        });
        if (supplier.photo && supplier.photo !== "default-supplier.png") {
            setFileList([
                {
                    uid: "-1",
                    name: "current-photo.jpg",
                    status: "done",
                    url: supplier.photo,
                },
            ]);
        } else {
            setFileList([]);
        }
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        form.resetFields();
        setFileList([]);
        setEditMode(false);
        setSelectedSupplier(null);
    };

    const handleSubmit = async (values, createFn, updateFn) => {
        const formData = new FormData();

        Object.keys(values).forEach((key) => {
            if (values[key] !== undefined && values[key] !== null) {
                formData.append(key, values[key]);
            }
        });

        if (fileList.length > 0 && fileList[0].originFileObj) {
            formData.append("photo", fileList[0].originFileObj);
        }

        let success;
        if (editMode && selectedSupplier) {
            // Lets the backend reject this save if someone else edited the
            // same supplier after this form opened, instead of silently
            // overwriting their changes.
            if (selectedSupplier.updatedAt) {
                formData.append("expected_updated_at", selectedSupplier.updatedAt);
            }
            success = await updateFn(selectedSupplier._id, formData);
        } else {
            success = await createFn(formData);
        }

        if (success) {
            closeModal();
            onSuccess?.();
        }
    };

    const uploadProps = {
        beforeUpload: (file) => {
            const isImage = file.type.startsWith("image/");
            if (!isImage) {
                toast.error(t("suppliers.upload_image_only"));
                return false;
            }
            const isLt2M = file.size / 1024 / 1024 < 2;
            if (!isLt2M) {
                toast.error(t("common.max_2mb"));
                return false;
            }
            return false;
        },
        fileList,
        // showUploadList is false so SupplierForm's own PhotoDropZone renders
        // the preview - antd only auto-generates thumbUrl inside its own list
        // renderer, which never mounts in that mode, so a freshly picked
        // file needs its data-URL preview built here instead.
        onChange: ({ fileList: newFileList }) => {
            setFileList(newFileList);
            const latest = newFileList[newFileList.length - 1];
            if (latest?.originFileObj && !latest.thumbUrl && !latest.url) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    setFileList((prev) =>
                        prev.map((f) =>
                            f.uid === latest.uid ? { ...f, thumbUrl: e.target.result } : f
                        )
                    );
                };
                reader.readAsDataURL(latest.originFileObj);
            }
        },
        maxCount: 1,
        accept: "image/*",
        listType: "picture",
        showUploadList: false,
    };

    return {
        modalVisible,
        editMode,
        selectedSupplier,
        form,
        fileList,
        uploadProps,
        openCreateModal,
        openEditModal,
        closeModal,
        handleSubmit,
        isTourCreateStep,
    };
};
