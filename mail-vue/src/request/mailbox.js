import http from '@/axios/index.js'

export const mailboxFolderList = () => http.get('/mailbox/folders')
export const mailboxCounts = () => http.get('/mailbox/counts')
export const mailboxFolderCreate = (name) => http.post('/mailbox/folders', {name})
export const mailboxFolderDelete = (folderId) => http.delete(`/mailbox/folders/${folderId}`)
export const mailboxMove = (emailIds, destination, until) => http.post('/mailbox/move', {emailIds, destination, until})
export const mailboxTemplates = () => http.get('/mailbox/templates')
export const mailboxTemplateSave = (data) => http.post('/mailbox/templates', data)
export const mailboxTemplateDelete = (templateId) => http.delete(`/mailbox/templates/${templateId}`)
