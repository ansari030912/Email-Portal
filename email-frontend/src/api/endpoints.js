import { request, qs, API_BASE } from "./client";

// ---- auth ----
export const registerUser = (body) => request("POST", "/auth/registerUser", body);
export const loginUser = (body) => request("POST", "/auth/loginUser", body);
export const logoutUser = () => request("POST", "/auth/logoutUser", {}, { silentAuth: true });
export const getMyProfile = () => request("GET", "/auth/getMyProfile", undefined, { silentAuth: true });
export const updateMyProfile = (body) => request("PUT", "/auth/updateMyProfile", body);
export const changeMyPassword = (body) => request("PUT", "/auth/changeMyPassword", body);

// ---- google authenticator ----
export const verifyLoginTwoFactorCode = (body) => request("POST", "/google-auth-2fa/verifyLoginTwoFactorCode", body);
export const getTwoFactorStatus = () => request("GET", "/google-auth-2fa/getTwoFactorStatus");
export const generateTwoFactorSetup = () => request("POST", "/google-auth-2fa/generateTwoFactorSetup", {});
export const enableTwoFactor = (body) => request("POST", "/google-auth-2fa/enableTwoFactor", body);
export const disableTwoFactor = (body) => request("POST", "/google-auth-2fa/disableTwoFactor", body);

// ---- inbox ----
export const getMyMailboxes = () => request("GET", "/email-inbox/getMyMailboxes");
export const getMyInboxEmails = (params) => request("GET", `/email-inbox/getMyInboxEmails${qs(params)}`);
export const getMyInboxProjects = () => request("GET", "/email-inbox/getMyInboxProjects");
export const getEmailById = (id) => request("GET", `/email-inbox/getEmailById/${id}`);
export const updateEmailReadStatus = (body) => request("PUT", "/email-inbox/updateEmailReadStatus", body);
export const updateEmailStarStatus = (body) => request("PUT", "/email-inbox/updateEmailStarStatus", body);
export const attachmentUrl = (emailId, attachmentId) =>
  `${API_BASE}/email-inbox/downloadEmailAttachment/${emailId}/${attachmentId}`;

// ---- super admin: users ----
export const getAllPortalUsers = (params) => request("GET", `/user-management/getAllPortalUsers${qs(params)}`);
export const updatePortalUserRole = (body) => request("PUT", "/user-management/updatePortalUserRole", body);
export const updatePortalUserStatus = (body) => request("PUT", "/user-management/updatePortalUserStatus", body);
export const resetPortalUserTwoFactor = (body) => request("PUT", "/user-management/resetPortalUserTwoFactor", body);

// ---- super admin: mailbox access ----
export const getAllRecipientMailboxes = (params) => request("GET", `/recipient-mailbox/getAllRecipientMailboxes${qs(params)}`);
export const getRecipientMailboxProjects = () => request("GET", "/recipient-mailbox/getRecipientMailboxProjects");
export const assignRecipientMailboxesToUsers = (body) => request("PUT", "/recipient-mailbox/assignRecipientMailboxesToUsers", body);
export const unassignRecipientMailboxesFromUsers = (body) => request("PUT", "/recipient-mailbox/unassignRecipientMailboxesFromUsers", body);
export const setRecipientMailboxUsers = (body) => request("PUT", "/recipient-mailbox/setRecipientMailboxUsers", body);

// ---- super admin: projects ----
export const getAllIngestClients = () => request("GET", "/ingest-clients/getAllIngestClients");
export const createIngestClient = (body) => request("POST", "/ingest-clients/createIngestClient", body);
export const rotateIngestClientSecret = (body) => request("PUT", "/ingest-clients/rotateIngestClientSecret", body);
export const updateIngestClientSettings = (body) => request("PUT", "/ingest-clients/updateIngestClientSettings", body);
export const deleteIngestClient = (body) => request("DELETE", "/ingest-clients/deleteIngestClient", body);

// ---- referrals (invite-only registration) ----
export const verifyInviteReferral = (body) => request("POST", "/invite-referral/verifyInviteReferral", body);
export const getAllInviteReferrals = (params) => request("GET", `/invite-referral/getAllInviteReferrals${qs(params)}`);
export const createInviteReferral = (body) => request("POST", "/invite-referral/createInviteReferral", body);
export const revokeInviteReferral = (body) => request("PUT", "/invite-referral/revokeInviteReferral", body);

// ---- super admin: API logs ----
export const getApiLogs = (params) => request("GET", `/api-logs/getApiLogs${qs(params)}`);
export const getApiLogById = (id) => request("GET", `/api-logs/getApiLogById/${id}`);
export const getApiLogStats = () => request("GET", "/api-logs/getApiLogStats");

// ---- super admin: activity ----
export const getActivityLogs = (params) => request("GET", `/activity-logs/getActivityLogs${qs(params)}`);
