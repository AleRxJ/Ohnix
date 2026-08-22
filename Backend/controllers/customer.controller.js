import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { prisma } from "../db/prisma.js";
import { isForeignKeyRestrictError } from "../utils/prismaErrors.js";
import { emitPosEvent } from "../live/dataEvents.js";
import { updateWithConflictCheck, parseExpectedUpdatedAt } from "../utils/optimisticConcurrency.js";
import { hasPosAccess, resolveOrAssertPointOfSaleId } from "../middleware/pos.permissions.js";

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
    identification_document_code: customer.identificationDocumentCode,
    identification: customer.identification,
    legal_organization_code: customer.legalOrganizationCode,
    tribute_code: customer.tributeCode,
    municipality_code: customer.municipalityCode,
    country_code: customer.countryCode,
    photo: customer.photo,
    created_by: {
        _id: toExternalId(customer.createdBy),
        username: customer.createdBy.username,
    },
    point_of_sale: customer.pointOfSale
        ? { _id: customer.pointOfSale.id, name: customer.pointOfSale.name }
        : { _id: customer.pointOfSaleId },
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
            pointOfSale: {
                select: { id: true, name: true },
            },
        },
    });

const fiscalCustomerData = (body) => {
    const fields = {
        identification_document_code: "identificationDocumentCode",
        identification: "identification",
        legal_organization_code: "legalOrganizationCode",
        tribute_code: "tributeCode",
        municipality_code: "municipalityCode",
        country_code: "countryCode",
    };
    return Object.fromEntries(
        Object.entries(fields)
            .filter(([input]) => body[input] !== undefined)
            .map(([input, field]) => [
                field,
                `${body[input] || ""}`.trim().toUpperCase() || null,
            ])
    );
};

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
        is_tutorial_data,
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

        const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);

        let photoUrl = "default-customer.png";
        if (req.file) {
            const photo = await uploadFile(req.file, {
                ownerId: req.user.prismaId,
                entity: "customers",
            });
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
                isTutorialData: is_tutorial_data === true || is_tutorial_data === "true",
                createdById: req.user.prismaId,
                pointOfSaleId,
                ...fiscalCustomerData(req.body),
            },
            include: {
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                pointOfSale: {
                    select: { id: true, name: true },
                },
            },
        });

        emitPosEvent(req.user.prismaId, pointOfSaleId, "customer", "created");
        return res
            .status(201)
            .json(new ApiResponse(201, mapCustomer(customer), "Customer created successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
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
                pointOfSale: {
                    select: { id: true, name: true },
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
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getUserCustomers = asyncHandler(async (req, res, next) => {
    try {
        const where = { createdById: req.user.prismaId };
        // Restricted-scope actors (see pos.permissions.js) only ever see
        // customers created at their own location(s) - same rule as
        // getAllOrders. Full-scope (owner, posScopeAll, or the platform
        // "admin" role) needs no extra filter, same reasoning.
        if (req.user.role !== "admin" && !req.user.posScopeAll) {
            where.pointOfSaleId = { in: req.user.posScopeIds || [] };
        }

        const customers = await prisma.customer.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                pointOfSale: {
                    select: { id: true, name: true },
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
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
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
        if (req.user.role !== "admin" && !hasPosAccess(req.user, existingCustomer.pointOfSaleId)) {
            return next(new ApiError(403, "No tienes acceso a este punto de venta."));
        }

        if (req.file) {
            const photo = await uploadFile(req.file, {
                ownerId: req.user.prismaId,
                entity: "customers",
            });
            if (photo) {
                updateData.photo = photo.url;
            }
        }

        const customer = await updateWithConflictCheck({
            model: prisma.customer,
            id: existingCustomer.id,
            expectedUpdatedAt: parseExpectedUpdatedAt(updateData.expected_updated_at),
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
                ...fiscalCustomerData(updateData),
            },
            include: {
                createdBy: {
                    select: { id: true, legacyMongoId: true, username: true },
                },
                pointOfSale: {
                    select: { id: true, name: true },
                },
            },
            conflictMessage: "This customer was changed by someone else. Reload to see the latest version.",
        });

        // Fire-and-forget: the old photo is only orphaned once the DB row
        // safely points at the new one, and deleteFile() already swallows
        // its own errors, so this can't turn a successful update into a
        // failed response.
        if (req.file && updateData.photo !== existingCustomer.photo) {
            deleteFile(existingCustomer.photo);
        }

        emitPosEvent(existingCustomer.createdById, existingCustomer.pointOfSaleId, "customer", "updated");
        return res
            .status(200)
            .json(new ApiResponse(200, mapCustomer(customer), "Customer updated successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
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
        if (req.user.role !== "admin" && !hasPosAccess(req.user, existingCustomer.pointOfSaleId)) {
            return next(new ApiError(403, "No tienes acceso a este punto de venta."));
        }

        await prisma.customer.delete({ where: { id: existingCustomer.id } });
        deleteFile(existingCustomer.photo);

        emitPosEvent(existingCustomer.createdById, existingCustomer.pointOfSaleId, "customer", "deleted");
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Customer deleted successfully"));
    } catch (error) {
        if (isForeignKeyRestrictError(error)) {
            return next(
                new ApiError(
                    409,
                    "This customer can't be deleted because it still has orders assigned to it. Reassign or delete those orders first.",
                    [],
                    "",
                    "customer_has_orders"
                )
            );
        }
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export {
    createCustomer,
    getAllCustomers,
    getUserCustomers,
    updateCustomer,
    deleteCustomer,
};
