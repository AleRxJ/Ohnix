import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { prisma } from "../db/prisma.js";
import { isForeignKeyRestrictError } from "../utils/prismaErrors.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const mapSupplier = (supplier, currentUser) => ({
    _id: toExternalId(supplier),
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    shopname: supplier.shopname,
    type: supplier.type,
    bank_name: supplier.bankName,
    account_holder: supplier.accountHolder,
    account_number: supplier.accountNumber,
    photo: supplier.photo,
    owner: supplier.createdBy
        ? {
              _id: toExternalId(supplier.createdBy),
              username: supplier.createdBy.username,
              email: supplier.createdBy.email,
          }
        : null,
    canEdit: currentUser
        ? currentUser.role === "admin" || supplier.createdById === currentUser.prismaId
        : false,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
});

const findSupplierByAnyId = async (id) =>
    prisma.supplier.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        include: {
            createdBy: {
                select: {
                    id: true,
                    legacyMongoId: true,
                    username: true,
                    email: true,
                },
            },
        },
    });

const createSupplier = asyncHandler(async (req, res, next) => {
    const {
        name,
        email,
        phone,
        address,
        shopname,
        type,
        bank_name,
        account_holder,
        account_number,
        is_tutorial_data,
    } = req.body;

    if (!name || !email || !phone || !address) {
        return next(
            new ApiError(400, "Name, email, phone, and address are required")
        );
    }

    try {
        const existingSupplier = await prisma.supplier.findFirst({
            where: {
                createdById: req.user.prismaId,
                OR: [{ email: email.toLowerCase().trim() }, { phone: phone.trim() }],
            },
            select: { id: true },
        });

        if (existingSupplier) {
            return next(
                new ApiError(409, "Supplier with this email or phone already exists")
            );
        }

        let photoUrl = "default-supplier.png";
        if (req.file) {
            const photo = await uploadFile(req.file, {
                ownerId: req.user.prismaId,
                entity: "suppliers",
            });
            if (photo) {
                photoUrl = photo.url;
            }
        }

        const supplier = await prisma.supplier.create({
            data: {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                phone: phone.trim(),
                address: address.trim(),
                shopname: shopname?.trim() || null,
                type: type?.trim() || "individual",
                bankName: bank_name?.trim() || null,
                accountHolder: account_holder?.trim() || null,
                accountNumber: account_number?.trim() || null,
                photo: photoUrl,
                isTutorialData: is_tutorial_data === true || is_tutorial_data === "true",
                createdById: req.user.prismaId,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });

        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    mapSupplier(supplier, req.user),
                    "Supplier created successfully"
                )
            );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getSuppliers = asyncHandler(async (req, res, next) => {
    try {
        const suppliers = await prisma.supplier.findMany({
            where: { createdById: req.user.prismaId },
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    suppliers.map((supplier) => mapSupplier(supplier, req.user)),
                    "Suppliers fetched successfully"
                )
            );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getAllSuppliers = asyncHandler(async (req, res, next) => {
    try {
        const suppliers = await prisma.supplier.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    suppliers.map((supplier) => mapSupplier(supplier, req.user)),
                    "All suppliers fetched successfully"
                )
            );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const updateSupplier = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingSupplier = await findSupplierByAnyId(id);

        if (!existingSupplier) {
            return next(new ApiError(404, "Supplier not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingSupplier.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to update this supplier")
            );
        }

        let photoUrl = existingSupplier.photo;
        if (req.file) {
            const photo = await uploadFile(req.file, {
                ownerId: req.user.prismaId,
                entity: "suppliers",
            });
            if (photo) {
                photoUrl = photo.url;
            }
        }

        const updatedSupplier = await prisma.supplier.update({
            where: { id: existingSupplier.id },
            data: {
                ...(req.body.name !== undefined && { name: req.body.name.trim() }),
                ...(req.body.email !== undefined && {
                    email: req.body.email.toLowerCase().trim(),
                }),
                ...(req.body.phone !== undefined && { phone: req.body.phone.trim() }),
                ...(req.body.address !== undefined && {
                    address: req.body.address?.trim() || null,
                }),
                ...(req.body.shopname !== undefined && {
                    shopname: req.body.shopname?.trim() || null,
                }),
                ...(req.body.type !== undefined && {
                    type: req.body.type?.trim() || "individual",
                }),
                ...(req.body.bank_name !== undefined && {
                    bankName: req.body.bank_name?.trim() || null,
                }),
                ...(req.body.account_holder !== undefined && {
                    accountHolder: req.body.account_holder?.trim() || null,
                }),
                ...(req.body.account_number !== undefined && {
                    accountNumber: req.body.account_number?.trim() || null,
                }),
                photo: photoUrl,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });

        // Fire-and-forget: the old photo is only orphaned once the DB row
        // safely points at the new one, and deleteFile() already swallows
        // its own errors, so this can't turn a successful update into a
        // failed response.
        if (req.file && photoUrl !== existingSupplier.photo) {
            deleteFile(existingSupplier.photo);
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    mapSupplier(updatedSupplier, req.user),
                    "Supplier updated successfully"
                )
            );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const deleteSupplier = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingSupplier = await findSupplierByAnyId(id);

        if (!existingSupplier) {
            return next(new ApiError(404, "Supplier not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingSupplier.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to delete this supplier")
            );
        }

        await prisma.supplier.delete({ where: { id: existingSupplier.id } });
        deleteFile(existingSupplier.photo);

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Supplier deleted successfully"));
    } catch (error) {
        if (isForeignKeyRestrictError(error)) {
            return next(
                new ApiError(
                    409,
                    "This supplier can't be deleted because it still has purchases assigned to it. Reassign or delete those purchases first.",
                    [],
                    "",
                    "supplier_has_purchases"
                )
            );
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export {
    createSupplier,
    getSuppliers as getUserSuppliers,
    getSuppliers,
    getAllSuppliers,
    updateSupplier,
    deleteSupplier,
};
