// Postgres foreign-key violations reach us in two different shapes depending
// on how the relation's referential action was declared. Prisma's default
// action for a required relation is Restrict, which the migration engine
// writes into Postgres as an explicit `ON DELETE RESTRICT` - that produces
// SQLSTATE 23001, which Prisma does NOT recognize as a "known" error (unlike
// the plain NO ACTION violation, 23503, which it maps to P2003). A 23001
// violation instead surfaces as a raw PrismaClientUnknownRequestError with
// no `.code`, whose message is the unfiltered Postgres connector error -
// exactly what would otherwise leak to the client as a raw 500.
export const isForeignKeyRestrictError = (error) =>
    error?.code === "P2003" ||
    (typeof error?.message === "string" &&
        (error.message.includes("23001") ||
            error.message.includes("23503") ||
            error.message.includes("violates RESTRICT setting") ||
            error.message.includes("violates foreign key constraint")));
