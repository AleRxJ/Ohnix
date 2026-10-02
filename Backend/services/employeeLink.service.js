import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// Employee (payroll record) <-> User (Ohnix login) link. A payroll employee
// and a team member are separate records - the link is what lets the app
// say "the waiter on table 4 is employee Juan Pérez" (Order.waiterId), and
// later feed tips/commissions into that person's payroll.

// People of this account who can be linked: the owner plus every active
// team member, each with the employee they're already linked to (if any).
export const listLinkableUsers = async (accountId) => {
    const [owner, team] = await Promise.all([
        prisma.user.findUnique({ where: { id: accountId }, select: { id: true, username: true, email: true, employeeProfile: { select: { id: true } } } }),
        prisma.team.findUnique({
            where: { ownerId: accountId },
            select: {
                members: {
                    where: { status: "active" },
                    select: {
                        role: { select: { name: true } },
                        user: { select: { id: true, username: true, email: true, employeeProfile: { select: { id: true } } } },
                    },
                },
            },
        }),
    ]);
    const rows = [];
    if (owner) rows.push({ _id: owner.id, username: owner.username, email: owner.email, role_name: null, is_owner: true, employee_id: owner.employeeProfile?.id || null });
    for (const member of team?.members || []) {
        if (!member.user || member.user.id === accountId) continue;
        rows.push({
            _id: member.user.id,
            username: member.user.username,
            email: member.user.email,
            role_name: member.role?.name || null,
            is_owner: false,
            employee_id: member.user.employeeProfile?.id || null,
        });
    }
    return rows;
};

// Only the account's own people - never someone else's user id.
export const assertLinkableUser = async (accountId, userId) => {
    if (userId === accountId) return;
    const member = await prisma.teamMember.findFirst({
        where: { userId, status: "active", team: { ownerId: accountId } },
        select: { id: true },
    });
    if (!member) throw new ApiError(400, "Ese usuario no es miembro activo de tu equipo.", [], "", "employee_user_not_member");
};

// Invitation accepted -> if the account has an unlinked employee with that
// email, link them (the usual path: create the employee, then "Invitar al
// equipo" from their record). Runs inside acceptInvitation's transaction.
export const autoLinkEmployeeByEmail = async (tx, { accountId, email, userId }) => {
    if (!email) return null;
    const employee = await tx.employee.findFirst({
        where: { createdById: accountId, userId: null, email: { equals: String(email).trim(), mode: "insensitive" } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
    });
    if (!employee) return null;
    await tx.employee.update({ where: { id: employee.id }, data: { userId } });
    return employee.id;
};
