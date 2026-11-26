// Turns the worker permission tree (whose `name` values come back translated,
// often Chinese, and whose leaves expose raw `perm_key`s) into a clean,
// English, human-readable catalogue grouped by module.
//
// The worker cannot be trusted to localise these labels for every locale, so
// the shell derives its own labels from the stable `perm_key` (e.g. "crm:query"
// -> "View contacts"). Raw keys are never shown to the user as primary copy.

export const MODULE_GROUPS = [
  { id: 'overview', label: 'Overview', prefixes: ['overview', 'dashboard'] },
  { id: 'mail', label: 'Mail', prefixes: ['email', 'mail', 'mailbox', 'all-email', 'draft', 'star', 'folder', 'template', 'send'] },
  { id: 'crm', label: 'CRM', prefixes: ['crm', 'contacts', 'leads', 'deals', 'organizations', 'companies', 'pipelines', 'stages', 'opportunities', 'activities', 'tasks', 'events', 'contact-organizations', 'relationships'] },
  { id: 'support', label: 'Support Inbox', prefixes: ['support'] },
  { id: 'whatsapp', label: 'WhatsApp', prefixes: ['whatsapp'] },
  { id: 'finance', label: 'Finance', prefixes: ['finance'] },
  { id: 'documents', label: 'Documents', prefixes: ['documents', 'document'] },
  { id: 'projects', label: 'Projects', prefixes: ['projects', 'project'] },
  { id: 'calendar', label: 'Calendar', prefixes: ['calendar'] },
  { id: 'notes', label: 'Notes', prefixes: ['notes', 'note'] },
  { id: 'requests', label: 'Requests & Approvals', prefixes: ['requests', 'approvals', 'approval'] },
  { id: 'team', label: 'XPass Team', prefixes: ['people', 'team', 'teams'] },
  { id: 'announcements', label: 'Announcements', prefixes: ['announcements', 'announcement'] },
  { id: 'connections', label: 'Connections & Integrations', prefixes: ['connections', 'integrations', 'connection'] },
  { id: 'ai', label: 'XPass AI', prefixes: ['ai'] },
  { id: 'automations', label: 'Automations', prefixes: ['automations', 'automation'] },
  { id: 'reports', label: 'Reports & Analytics', prefixes: ['analysis', 'reports', 'report'] },
  { id: 'notifications', label: 'Notifications', prefixes: ['notifications', 'notification'] },
  { id: 'account', label: 'My Account', prefixes: ['my', 'account'] },
  { id: 'admin', label: 'Administration', prefixes: ['user', 'role', 'setting', 'settings', 'reg-key', 'invite', 'system'] }
]

const SUBJECTS = {
  email: 'mail', mail: 'mail', mailbox: 'mailboxes', 'all-email': 'all company mail',
  draft: 'drafts', star: 'starred mail', folder: 'mail folders', template: 'email templates', send: 'mail',
  crm: 'CRM records', contacts: 'contacts', leads: 'leads', deals: 'deals',
  organizations: 'organizations', companies: 'companies', pipelines: 'pipelines',
  stages: 'pipeline stages', opportunities: 'opportunities', activities: 'activities',
  tasks: 'tasks', events: 'linked events', 'contact-organizations': 'contact links',
  relationships: 'relationships',
  support: 'support conversations', whatsapp: 'WhatsApp', finance: 'finance records',
  documents: 'documents', document: 'documents', projects: 'projects', project: 'projects',
  calendar: 'calendar events', notes: 'notes', note: 'notes', requests: 'requests',
  approvals: 'approvals', people: 'people', team: 'teams', announcements: 'announcements',
  connections: 'connections', integrations: 'integrations', ai: 'XPass AI',
  automations: 'automations', analysis: 'reports',
  user: 'members', role: 'roles and access', setting: 'company settings',
  'reg-key': 'invite codes', invite: 'invitations', notifications: 'notifications',
  my: 'your account', account: 'your account', overview: 'the overview'
}

const ACTION_LABELS = {
  query: 'View', view: 'View', add: 'Create', create: 'Create', edit: 'Edit', update: 'Edit',
  delete: 'Delete', remove: 'Delete', manage: 'Manage', configure: 'Configure', send: 'Send',
  reply: 'Reply', approve: 'Approve', reject: 'Reject', act: 'Act on', assign: 'Assign',
  export: 'Export', import: 'Import', set: 'Change', 'set-type': 'Set role for',
  'set-status': 'Set status for', 'reset-mfa': 'Reset authenticator for',
  'reset-password': 'Reset password for', 'delete-account': 'Delete', deleteAccount: 'Delete',
  use: 'Use', 'view-audit': 'View audit for', star: 'Star', clean: 'Clear', pin: 'Pin',
  unpin: 'Unpin', mark: 'Mark', read: 'Mark read for'
}

function humanize(value) {
  return String(value || '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

function prefixOf(permKey) {
  const key = String(permKey || '')
  const idx = key.indexOf(':')
  return idx === -1 ? key : key.slice(0, idx)
}

function actionOf(permKey) {
  const key = String(permKey || '')
  const idx = key.indexOf(':')
  return idx === -1 ? '' : key.slice(idx + 1)
}

// The worker's tree is built with an ORM that returns camelCase fields
// (permKey / permId), while older code and SQL use snake_case. Accept both so
// the catalogue never comes back empty because of a casing change.
function readPermKey(node) {
  if (!node) return ''
  return node.permKey ?? node.perm_key ?? ''
}

function readPermId(node) {
  if (!node) return undefined
  return node.permId ?? node.perm_id
}

export function groupIdFor(permKey) {
  const prefix = prefixOf(permKey)
  const group = MODULE_GROUPS.find((g) => g.prefixes.includes(prefix))
  return group ? group.id : 'admin'
}

export function moduleLabelFor(groupId) {
  const group = MODULE_GROUPS.find((g) => g.id === groupId)
  return group ? group.label : 'Other'
}

export function leafLabel(permKey) {
  const subject = SUBJECTS[prefixOf(permKey)] || humanize(prefixOf(permKey))
  const verb = ACTION_LABELS[actionOf(permKey)] || humanize(actionOf(permKey)) || 'Manage'
  const trimmed = subject ? `${verb} ${subject}` : verb
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

// Flatten the worker tree's leaves and regroup them under stable English module
// headings. Returns [{ id, label, leaves: [{ perm_id, perm_key, label }] }].
export function groupPermissions(tree) {
  const leaves = []
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (Array.isArray(node.children) && node.children.length) {
        walk(node.children)
      } else {
        const key = readPermKey(node)
        if (key) {
          leaves.push({ perm_id: readPermId(node), perm_key: key, label: leafLabel(key) })
        }
      }
    }
  }
  walk(tree)

  const buckets = new Map()
  for (const leaf of leaves) {
    const id = groupIdFor(leaf.perm_key)
    if (!buckets.has(id)) buckets.set(id, { id, label: moduleLabelFor(id), leaves: [] })
    buckets.get(id).leaves.push(leaf)
  }

  return MODULE_GROUPS
    .map((g) => buckets.get(g.id))
    .filter(Boolean)
}