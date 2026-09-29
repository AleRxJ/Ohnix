import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { blockDuringImpersonation } from "../middleware/blockDuringImpersonation.middleware.js";
import {
    teamInvitationRateLimiter,
    invitationAcceptRateLimiter,
} from "../middleware/rateLimit.middleware.js";
import {
    loadTeam,
    requireTeamOwnerActor,
    requireTeamManager,
    requireTeamAccess,
    createTeam,
    getCurrentTeam,
    getPermissionCatalog,
    getTeam,
    updateTeam,
    listRoles,
    createRole,
    updateRole,
    deleteRole,
    createInvitation,
    listInvitations,
    resendInvitation,
    revokeInvitation,
    previewInvitation,
    acceptInvitation,
    listMembers,
    updateMember,
    listTeamSessions,
    listMemberSessions,
    revokeMemberSession,
    listActivity,
} from "../controllers/team.controller.js";

const router = Router();

// Public: the invitee has no account yet, the token itself is the credential.
router.route("/invitations/:token").get(invitationAcceptRateLimiter, previewInvitation);
router.route("/invitations/:token/accept").post(invitationAcceptRateLimiter, acceptInvitation);

router.use(verifyJWT);

router.route("/teams").post(createTeam);
router.route("/teams/current").get(getCurrentTeam);
// Declared before the "/teams/:id" loader below, same as /teams/current.
router.route("/teams/permission-catalog").get(getPermissionCatalog);

// Every /teams/:id route below needs the team loaded + membership checked
// first (see team.controller.js).
//
// "Basic team info" (this team's name/owner, the member roster with names/
// roles) is NOT gated by a module permission - any active member can see it,
// same as knowing who your coworkers are needs no special grant. This used
// to require requireModulePermission("team", "view") too, which is the wrong
// rule for this: it's "can I see my own team" (yes, always, if you're in it)
// vs. "can I administer the team" (owner-only, via requireTeamOwnerActor
// below) - conflating them meant a member with no role permissions at all
// got a hard 403 just for opening the team page. Invitations/roles/activity
// stay owner-only since they expose more (pending invite emails, the full
// role/permission matrix, an audit trail).
router.use("/teams/:id", loadTeam);

router.route("/teams/:id")
    .get(requireTeamAccess, getTeam)
    // Includes ownership transfer (newOwnerUserId) - never allowed while an
    // admin is impersonating the owner.
    .patch(requireTeamOwnerActor, blockDuringImpersonation, updateTeam);

router.route("/teams/:id/members")
    .get(requireTeamAccess, listMembers);
// Owner, or a co-administrador with the "team" module (view: see members'
// sessions, invitations, roles, activity; edit: invite, change a member's
// role/scope, revoke sessions; admin: manage roles). Every write is further
// bounded by teamDelegation.service.js - no granting above one's own role.
router.route("/teams/:id/members/:userId")
    .patch(requireTeamManager("edit"), updateMember);
router.route("/teams/:id/sessions")
    .get(requireTeamManager("view"), listTeamSessions);
router.route("/teams/:id/members/:userId/sessions")
    .get(requireTeamManager("view"), listMemberSessions);
router.route("/teams/:id/members/:userId/sessions/:sessionId")
    .delete(requireTeamManager("edit"), revokeMemberSession);

router.route("/teams/:id/invitations")
    .get(requireTeamManager("view"), listInvitations)
    .post(requireTeamManager("edit"), teamInvitationRateLimiter, createInvitation);
router.route("/teams/:id/invitations/:invId/resend")
    .post(requireTeamManager("edit"), teamInvitationRateLimiter, resendInvitation);
router.route("/teams/:id/invitations/:invId")
    .delete(requireTeamManager("edit"), revokeInvitation);

router.route("/teams/:id/roles")
    .get(requireTeamManager("view"), listRoles)
    .post(requireTeamManager("admin"), createRole);
router.route("/teams/:id/roles/:roleId")
    .patch(requireTeamManager("admin"), updateRole)
    .delete(requireTeamManager("admin"), deleteRole);

router.route("/teams/:id/activity")
    .get(requireTeamManager("view"), listActivity);

export default router;
