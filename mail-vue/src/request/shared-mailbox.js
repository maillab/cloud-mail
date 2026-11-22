import http from '@/axios/index.js'

// One mail workspace, many inboxes. The member does not "switch mailbox": the
// personal mailbox and every shared inbox they belong to are all present at
// once, and the server decides which ones exist for them.

export const sharedMailboxList = () => http.get('/shared-mailbox/list')

export const sharedMailboxCurrent = () => http.get('/shared-mailbox/current')

// Queue counts per shared inbox, for the mail navigation badges.
export const sharedMailboxSummary = () => http.get('/shared-mailbox/summary')

export const sharedMailboxSelect = (mailboxId) => http.put('/shared-mailbox/select', {mailboxId})

export const sharedMailboxConversations = (params) => http.get('/shared-mailbox/conversations', {params})

export const sharedMailboxConversation = (emailId) => http.get('/shared-mailbox/conversation', {params: {emailId}})

export const sharedMailboxTimeline = (emailId) => http.get('/shared-mailbox/timeline', {params: {emailId}})

// One route carries every workflow change; `action` picks the operation.
export const sharedMailboxConversationAction = (data) => http.put('/shared-mailbox/conversation', data)

export const sharedMailboxAddNote = (emailId, body) => http.post('/shared-mailbox/note', {emailId, body})

export const sharedMailboxLinkRequest = (data) => http.post('/shared-mailbox/link-request', data)

export const sharedMailboxAssignees = (mailboxId) => http.get('/shared-mailbox/assignees', {params: {mailboxId}})

export const sharedMailboxTags = () => http.get('/shared-mailbox/tags')

export const sharedMailboxTagCreate = (name, color) => http.post('/shared-mailbox/tags', {name, color})

export const sharedMailboxTagDelete = (tagId) => http.delete(`/shared-mailbox/tags/${tagId}`)

export const sharedMailboxMembers = (mailboxId) => http.get('/shared-mailbox/members', {params: {mailboxId}})

export const sharedMailboxMemberAudit = (mailboxId) => http.get('/shared-mailbox/member-audit', {params: {mailboxId}})

// ----- admin management -------------------------------------------------
// Creating and updating shared mailboxes, and administering their members.
// These require the 'mailbox:manage' permission and are used by the admin
// Shared Mailboxes screen.
export const sharedMailboxAdminList = () => http.get('/shared-mailbox/admin/list')

export const sharedMailboxMemberOptions = () => http.get('/shared-mailbox/member-options')

export const sharedMailboxCreate = (data) => http.post('/account/sharedMailbox', data)

export const sharedMailboxUpdate = (data) => http.put('/account/sharedMailbox', data)

export const sharedMailboxMemberAdd = (data) => http.post('/shared-mailbox/members', data)

export const sharedMailboxMemberUpdate = (data) => http.put('/shared-mailbox/members', data)

export const sharedMailboxMemberRemove = (data) => http.delete('/shared-mailbox/members', {data})

// Senders the member may legitimately use in the composer's From selector.
export const senderIdentities = () => http.get('/account/mailboxes')
