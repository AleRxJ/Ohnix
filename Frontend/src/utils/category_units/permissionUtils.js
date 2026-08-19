export const canEdit = (item, user, isAdmin) => {
    return (
        isAdmin ||
        item.created_by?._id === user?._id ||
        item.created_by === user?._id
    );
};

export const canDelete = (item, user, isAdmin) => {
    return (
        isAdmin ||
        item.created_by?._id === user?._id ||
        item.created_by === user?._id
    );
};

// Just the recorded username - no "You"/"Other User" framing. Team
// resources are always registered under the account owner's id regardless
// of which member actually created them (see the Team model comment in
// schema.prisma), so comparing created_by against the viewer's own id gives
// a meaningless (or actively wrong, for a member viewing their own work)
// result. The username itself is still accurate and worth showing.
export const getOwnershipText = (item) => item.created_by?.username || "—";
