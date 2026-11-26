import http from '@/axios/index.js'

// XPass Team directory and member administration.
export function teamMembers(params = {}) {
    return http.get('/team/members', {params})
}

export function teamOverview() {
    return http.get('/team/overview')
}

export function createTeamMember(body) {
    return http.post('/team/member', body)
}

export function updateTeamMember(userId, body) {
    return http.put(`/team/member/${userId}`, body)
}

export function setMemberStatus(userId, status, reason) {
    return http.put(`/team/member/${userId}/status`, {status, reason})
}

export function memberTeams(userId) {
    return http.get(`/team/members/${userId}/teams`)
}

export function addMemberTeam(userId, teamId) {
    return http.post(`/team/member/${userId}/teams`, {teamId})
}

export function removeMemberTeam(userId, teamId) {
    return http.delete(`/team/member/${userId}/teams/${teamId}`)
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export function listTeams(includeArchived = false) {
    return http.get('/setting/teams', {params: {include_archived: includeArchived}})
}

export function createTeam(body) {
    return http.post('/setting/team', body)
}

export function updateTeam(id, body) {
    return http.put(`/setting/team/${id}`, body)
}

export function archiveTeam(id) {
    return http.delete(`/setting/team/${id}`)
}

// ---------------------------------------------------------------------------
// Roles (existing role builder)
// ---------------------------------------------------------------------------

export function listRoles() {
    return http.get('/role/list')
}

export function roleTree() {
    return http.get('/role/tree')
}

export function createRole(body) {
    return http.post('/role/add', body)
}

export function updateRole(body) {
    return http.put('/role/set', body)
}

export function deleteRole(id) {
    return http.delete('/role/delete', {params: {roleId: id}})
}

export function roleMembers(roleId) {
    return http.get('/role/members', {params: {roleId}})
}

export function roleHistory(roleId) {
    return http.get('/role/history', {params: {roleId}})
}

export function roleAccess(roleId) {
    return http.get('/role/access', {params: {roleId}})
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export function listAnnouncements() {
    return http.get('/announcements')
}

export function acknowledgeAnnouncement(id) {
    return http.post(`/announcements/${id}/ack`)
}

export function markAnnouncementRead(id) {
    return http.post(`/announcements/${id}/read`)
}

export function manageAnnouncements() {
    return http.get('/announcements/manage')
}

export function announcementDetail(id) {
    return http.get(`/announcements/manage/${id}`)
}

export function createAnnouncement(body) {
    return http.post('/announcements/manage', body)
}

export function updateAnnouncement(id, body) {
    return http.put(`/announcements/manage/${id}`, body)
}

export function setAnnouncementStatus(id, status) {
    return http.post(`/announcements/manage/${id}/status`, {status})
}

export function deleteAnnouncement(id) {
    return http.delete(`/announcements/manage/${id}`)
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export function listConnections() {
    return http.get('/connections')
}

export function connectionDetail(provider) {
    return http.get(`/connections/${provider}`)
}

export function saveConnection(provider, body) {
    return http.put(`/connections/${provider}`, body)
}

export function disconnectConnection(provider) {
    return http.delete(`/connections/${provider}`)
}

export function verifyConnection(provider, identity) {
    return http.post(`/connections/${provider}/verify`, {identity})
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export function listInvitations() {
    return http.get('/invitations')
}

export function createInvitation(userId, ttlDays) {
    return http.post('/invitations', {userId, ttlDays})
}

export function revokeInvitation(id) {
    return http.delete(`/invitations/${id}`)
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export function notificationPreferences() {
    return http.get('/notifications/preferences')
}

export function saveNotificationPreferences(body) {
    return http.put('/notifications/preferences', body)
}