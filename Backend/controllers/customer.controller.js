import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { prisma } from "../db/prisma.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const mapCustomer = (customer) => ({
    _id: toExternalId(customer),
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    type: customer.type,
    store_name: customer.storeName,
    account_holder: customer.accountHolder,
    account_number: customer.accountNumber,
    photo: customer.photo,
    created_by: {
        _id: toExternalId(customer.createdBy),
        username: customer.createdBy.username,
    },
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
});

const findCustomerByAnyId = async (id) =>
    prisma.customer.findFirst({
        where: {
            OR: [{ id }, { legacyMongoId: id }],
        },
        include: {
            createdBy: {
                select: { id: true, legacyMongoId: true, username: true },
            },
        },
    });

const createCustomer = asyncHandler(async (req, res, next) => {
    const {
        name,
        email,
        phone,
        address,
        type,
        store_name,
        account_holder,
        account_number,
    } = req.body;

    if (!name || !email || !phone) {
        return next(new ApiError(400, "Name, email, and phone are required"));
    }

    try {
        const existingCustomer = await prisma.customer.findFirst({
            where: {
                createdById: req.user.prismaId,
                OR: [{ email: email.toLowerCase().trim() }, { phone: phone.trim() }],
            },
            select: { id: true },
        });

        if (existingCustomer) {
            return next(
                new ApiError(409, "Customer with this email or phone already exists")
            );
        }

        let photoUrl = "default-customer.png";
        if (req.file) {
            const photo = await uploadToCloudinary(req.file);
            if (photo) {
                photoUrl = photo.url;
            }
        }

        const customer = await prisma.customer.create({
            data: {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                phone: phone.trim(),
                address: address?.trim() || null,
                type: type?.trim() || "regular",
                storeName: store_name?.trim() || null,
                accountHolder: account_holder?.trim() || null,
                accountNumber: account_number?.trim() || null,
                photo: photoUrl,
                createdById: req.user.prismaId,
            },
            include: {
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        return res
            .status(201)
            .json(new ApiResponse(201, mapCustomer(customer), "Customer created successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const getAllCustomers = asyncHandler(async (_req, res, next) => {
    try {
        const customers = await prisma.customer.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    customers.map(mapCustomer),
                    "All customers fetched successfully"
                )
            );
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const getUserCustomers = asyncHandler(async (req, res, next) => {
    try {
        const customers = await prisma.customer.findMany({
            where: { createdById: req.user.prismaId },
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    customers.map(mapCustomer),
                    "Your customers fetched successfully"
                )
            );
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const updateCustomer = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const updateData = req.body;

    try {
        const existingCustomer = await findCustomerByAnyId(id);

        if (!existingCustomer) {
            return next(new ApiError(404, "Customer not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingCustomer.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to update this customer")
            );
        }

        if (req.file) {
            const photo = await uploadToCloudinary(req.file);
            if (photo) {
                updateData.photo = photo.url;
            }
        }

        const customer = await prisma.customer.update({
            where: { id: existingCustomer.id },
            data: {
                ...(updateData.name !== undefined && { name: updateData.name.trim() }),
                ...(updateData.email !== undefined && {
                    email: updateData.email.toLowerCase().trim(),
                }),
                ...(updateData.phone !== undefined && { phone: updateData.phone.trim() }),
                ...(updateData.address !== undefined && {
                    address: updateData.address?.trim() || null,
                }),
                ...(updateData.type !== undefined && {
                    type: updateData.type?.trim() || "regular",
                }),
                ...(updateData.store_name !== undefined && {
                    storeName: updateData.store_name?.trim() || null,
                }),
                ...(updateData.account_holder !== undefined && {
                    accountHolder: updateData.account_holder?.trim() || null,
                }),
                ...(updateData.account_number !== undefined && {
                    accountNumber: updateData.account_number?.trim() || null,
                }),
                ...(updateData.photo !== undefined && { photo: updateData.photo }),
            },
            include: {
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
            },
        });

        return res
            .status(200)
            .json(new ApiResponse(200, mapCustomer(customer), "Customer updated successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

const deleteCustomer = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    try {
        const existingCustomer = await findCustomerByAnyId(id);

        if (!existingCustomer) {
            return next(new ApiError(404, "Customer not found"));
        }

        if (
            req.user.role !== "admin" &&
            existingCustomer.createdById !== req.user.prismaId
        ) {
            return next(
                new ApiError(403, "You don't have permission to delete this customer")
            );
        }

        await prisma.customer.delete({ where: { id: existingCustomer.id } });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Customer deleted successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

export {
    createCustomer,
    getAllCustomers,
    getUserCustomers,
    updateCustomer,
    deleteCustomer,
};
