import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  tutorialsGet, tutorialsPreferencesSet, tutorialsComplete, tutorialsDismiss,
  tutorialsReset, tutorialsAccessAck, tutorialsFirstComplete,
} from '@/request/notifications.js'
import { useUserStore } from '@/store/user.js'

// The personalized XPass HQ Guide.
//
// Tour *definitions* are built from the member's real, backend-enforced access
// (their permKeys), never from a generic role name. The backend only persists
// progress, preferences and the last-acknowledged access version. This store
// decides what to show:
//   - a first-workspace tour over ONLY the modules the member can reach
//   - short, replayable mini-tours for each module they open
//   - an access-change prompt when an administrator grants/removes access
//
// A step has: target (CSS selector), route (optional route name to visit
// first), title, body, placement.

// Friendly module metadata. `perm` is the read permission that makes a module
// visible; a module is only ever mentioned if the member holds it. `tour` gives
// the mini-tour steps, each pointing at a real route and a real control.
const MODULES = [
  {
    key: 'mail', label: 'Mail', perm: 'email:query', route: 'email',
    blurb: 'your inbox, composing, and sender identity',
    tour: [
      { target: '[class*="folder-list"], .mail-folder-list, aside', title: 'Your mail', body: 'Your inbox and folders live here. Open a folder to filter your mail.', placement: 'right' },
      { target: '[class*="mail-list"], .mail-list, main', title: 'Messages', body: 'Select a message to read it. Use Compose to write a new email with your XPass sender identity and signature.', placement: 'bottom' },
    ],
  },
  {
    key: 'support', label: 'Support Inbox', perm: 'support:query', route: 'support',
    blurb: 'the shared support queue and replies',
    tour: [
      { target: 'main, .module-container', title: 'Support Inbox', body: 'This is your support queue. Conversations needing attention appear here.', placement: 'center' },
      { target: '[class*="filter"], .fin-filters, form', title: 'Assignment & status', body: 'Filter by assignee and status. Open a conversation to see its status, assign it, or add an internal note.', placement: 'bottom' },
      { target: '[class*="reply"], textarea, .reply-box', title: 'Reply as XPass Support', body: 'Replies here go out from the shared XPass Support identity, and internal notes stay private to the team.', placement: 'top' },
    ],
  },
  {
    key: 'documents', label: 'Documents', perm: 'documents:query', route: 'documents',
    blurb: 'your files, shared files, and company files',
    tour: [
      { target: '[class*="doc-tabs"], .tabs, aside', title: 'My Files', body: 'My Files holds documents you own. Shared With Me shows files others shared with you.', placement: 'right' },
      { target: 'main, .module-container', title: 'Company Files & sharing', body: 'Company Files is the shared library. Use the share control on any file to give a teammate access.', placement: 'bottom' },
    ],
  },
  {
    key: 'finance', label: 'Finance', perm: 'finance:view', route: 'finance',
    blurb: 'the finance areas you can see',
    tour: [
      { target: '[class*="finance"], .fin-tabs, aside', title: 'Finance', body: 'Finance is split into tabs. You only see the tabs and actions you have been granted.', placement: 'right' },
      { target: 'main, .module-container', title: 'Read-only figures', body: 'Figures and lists reflect your access. If a control is missing, you have view-only access to that area.', placement: 'bottom' },
    ],
  },
  {
    key: 'requests', label: 'Requests', perm: 'requests:query', route: 'requests',
    blurb: 'work waiting on you and the next valid action',
    tour: [
      { target: 'main, .module-container', title: 'Requests', body: 'This shows what is waiting on you. You only see the next valid action for each request.', placement: 'center' },
      { target: '[class*="status"], .fin-status, table', title: 'Statuses', body: 'Each status tells you what a request needs: waiting on you, waiting on someone else, approved, or completed.', placement: 'bottom' },
    ],
  },
  {
    key: 'approvals', label: 'Approvals', perm: 'approvals:query', route: 'approvals',
    blurb: 'items awaiting your decision',
    tour: [
      { target: 'main, .module-container', title: 'Approvals', body: 'Items awaiting a decision appear here. Open one to approve, reject, or request changes.', placement: 'center' },
    ],
  },
  {
    key: 'projects', label: 'Projects', perm: 'projects:query', route: 'projects',
    blurb: 'project progress, tasks, milestones and files',
    tour: [
      { target: 'main, .module-container', title: 'Projects', body: 'Each project shows progress, tasks, milestones, and files in one place.', placement: 'center' },
      { target: '[class*="task"], [class*="milestone"], table', title: 'Tasks & milestones', body: 'Open a project to see its tasks, owners, milestones, and recent updates.', placement: 'bottom' },
    ],
  },
  {
    key: 'calendar', label: 'Calendar', perm: 'calendar:query', route: 'calendar',
    blurb: 'who created events, who can see them, and who is attending',
    tour: [
      { target: 'main, .module-container', title: 'Calendar', body: 'This shows company and personal events. Each event lists who created it, who can see it, and who is attending.', placement: 'center' },
    ],
  },
  {
    key: 'crm', label: 'CRM', perm: 'contacts:query', route: 'crm-overview',
    blurb: 'assigned leads, contacts, follow-ups and history',
    tour: [
      { target: 'main, .module-container', title: 'CRM', body: 'Your assigned leads and contacts appear here. Open a record to see follow-ups and full history.', placement: 'center' },
      { target: '[class*="tab"], aside, [role="tablist"]', title: 'Contacts, leads & deals', body: 'Switch between contacts, leads, deals and tasks. Each record keeps its activity history.', placement: 'right' },
    ],
  },
  {
    key: 'notes', label: 'Notes', perm: 'notes:query', route: 'notes',
    blurb: 'personal notes and reminders',
    tour: [
      { target: 'main, .module-container', title: 'Notes', body: 'A lightweight place for personal notes and reminders that stay close to the work they relate to.', placement: 'center' },
    ],
  },
  {
    key: 'people', label: 'People', perm: 'people:query', route: 'people',
    blurb: 'the team directory',
    tour: [
      { target: 'main, .module-container', title: 'People', body: 'The team directory. Find colleagues and see who is available.', placement: 'center' },
    ],
  },
]

// Map an individual permission key to a plain-English capability phrase, so an
// access change can be described precisely ("You can now view Finance →
// Transactions") rather than dumping raw keys. Unknown keys fall back to their
// module name so nothing is ever shown as a raw machine string.
const PERM_PHRASES = {
  'email:query': 'read and send Mail',
  'email:send': 'send Mail',
  'support:query': 'use the Support Inbox',
  'support:reply': 'reply from the XPass Support mailbox',
  'support:assign': 'assign support conversations',
  'contacts:query': 'view CRM contacts',
  'leads:query': 'view CRM leads',
  'deals:query': 'view CRM deals',
  'finance:view': 'view Finance',
  'finance.transactions:view': 'view Finance → Transactions',
  'finance.transactions:create': 'record Finance transactions',
  'finance:approve': 'approve finance requests',
  'finance.invoices:view': 'view Finance → Invoices',
  'finance.invoices:send': 'share Finance invoices',
  'documents:query': 'view Documents',
  'documents:company': 'manage Company Files',
  'requests:query': 'view Requests',
  'requests:act': 'act on Requests',
  'approvals:query': 'view Approvals',
  'approvals:approve': 'approve items',
  'projects:query': 'view Projects',
  'calendar:query': 'view the Calendar',
  'notes:query': 'view Notes',
  'people:query': 'view the People directory',
  'user:query': 'view and manage members',
  'role:query': 'view roles and permissions',
  'setting:query': 'view Company Settings',
}

const userStore = () => useUserStore()
const currentPerms = () => {
  const keys = userStore().user?.permKeys
  return Array.isArray(keys) ? keys : []
}
function can(perm) {
  const keys = currentPerms()
  return keys.includes('*') || keys.includes(perm)
}

const VERSION = 1

export const useTutorialStore = defineStore('tutorial', () => {
  const progress = ref({})       // { [tourId]: { version, completedAt, dismissedAt } }
  const preferences = ref({ showOnFirstVisit: true, showGuideButton: true })
  const guide = ref({ accessHash: null, ackAccessHash: null, ackPerms: [], firstTourCompleted: false })
  const activeTour = ref(null)
  const activeStep = ref(0)
  const intro = ref(null)        // the "workspace ready" / "workspace updated" prompt
  const loaded = ref(false)

  // Accessible modules, in display order.
  const myModules = computed(() => MODULES.filter(m => can(m.perm)))

  // ---- tour builders -----------------------------------------------------

  function buildWorkspaceTour() {
    const modules = myModules.value
    const steps = [
      {
        target: null,
        title: 'Your XPass HQ workspace is ready',
        body: 'We’ve set up your workspace around the tools you can use. This quick walk-through shows your Overview, your navigation, and your main work.',
        placement: 'center',
      },
      {
        target: '.module-container, main',
        title: 'Your Overview',
        body: 'This is where work needing your attention appears. Check back here to see what is waiting on you.',
        placement: 'center',
      },
      {
        target: '.aside, [class*="sidebar"], aside',
        title: 'Your navigation',
        body: `The sidebar lists only what you can access: ${modules.map(m => m.label).join(', ') || 'your Overview'}. Items you cannot use are hidden.`,
        placement: 'right',
      },
    ]
    if (modules.length) {
      steps.push({
        target: null,
        title: 'Your main tools',
        body: `You can use ${modules.map(m => `${m.label} (${m.blurb})`).join('; ')}. Each opens its own short guide the first time you visit.`,
        placement: 'center',
      })
    }
    steps.push({
      target: null,
      title: 'What is private and what is shared',
      body: 'You only see information you have been given access to. Your workspace may look different from someone else’s — that is intentional.',
      placement: 'center',
    })
    // A concrete next action based on access.
    const next = nextAction()
    if (next) steps.push({ target: next.target, route: next.route, title: next.title, body: next.body, placement: next.placement || 'center' })
    return {
      id: 'workspace', version: VERSION, title: 'Your XPass HQ Tour',
      description: 'A short guide to the tools and work available to you.', steps,
    }
  }

  function nextAction() {
    if (can('support:query')) return { route: 'support', target: 'main, .module-container', title: 'Your next action', body: 'Check the Support Inbox for conversations assigned to you.', placement: 'center' }
    if (can('requests:query')) return { route: 'requests', target: 'main, .module-container', title: 'Your next action', body: 'Open Requests to see anything waiting on you and the next valid action.', placement: 'center' }
    if (can('projects:query')) return { route: 'projects', target: 'main, .module-container', title: 'Your next action', body: 'Review your assigned tasks in Projects.', placement: 'center' }
    if (can('documents:query')) return { route: 'documents', target: 'main, .module-container', title: 'Your next action', body: 'Upload or open a document in Documents.', placement: 'center' }
    if (can('calendar:query')) return { route: 'calendar', target: 'main, .module-container', title: 'Your next action', body: 'Check upcoming events in your Calendar.', placement: 'center' }
    if (can('email:query')) return { route: 'email', target: 'main, .module-container', title: 'Your next action', body: 'Open Mail to read your inbox or write a message.', placement: 'center' }
    return null
  }

  // A tour built from ONLY the newly-granted areas. The opening step states
  // exactly what changed in plain English; following steps visit the modules
  // the member can now reach.
  function buildAccessTour(addedPerms) {
    const steps = [{
      target: null,
      title: 'Your workspace has been updated',
      body: describeAdded(addedPerms || []),
      placement: 'center',
    }]
    for (const m of myModules.value.slice(0, 4)) {
      const first = m.tour?.[0]
      if (first) steps.push({ route: m.route, target: first.target, title: m.label, body: first.body, placement: first.placement })
    }
    return {
      id: 'access-change', version: VERSION, title: 'What’s new',
      description: 'A quick look at your newly available tools.', steps,
    }
  }

  function buildModuleTour(key) {
    const mod = MODULES.find(m => m.key === key)
    if (!mod || !can(mod.perm)) return null
    return {
      id: `module-${mod.key}`, version: VERSION, title: `${mod.label} guide`,
      description: mod.blurb, route: mod.route, steps: mod.tour,
    }
  }

  // Tours offered in the Guide Centre / settings: the workspace tour + every
  // module the member can actually access.
  const availableTours = computed(() => {
    const list = [{ id: 'workspace', title: 'Your XPass HQ Tour', description: 'A short guide to your workspace.' }]
    for (const m of myModules.value) list.push({ id: `module-${m.key}`, title: `${m.label} guide`, description: m.blurb })
    return list
  })

  // ---- progress helpers --------------------------------------------------

  function isCompleted(tourId, version = VERSION) {
    const p = progress.value[tourId]
    return !!p && p.version >= version && !!p.completedAt
  }
  function isDismissed(tourId, version = VERSION) {
    const p = progress.value[tourId]
    return !!p && p.version >= version && !!p.dismissedAt && !p.completedAt
  }
  function shouldAutoStart(tourId, version = VERSION) {
    if (!preferences.value.showOnFirstVisit) return false
    return !isCompleted(tourId, version) && !isDismissed(tourId, version)
  }

  // ---- persistence -------------------------------------------------------

  async function load() {
    if (loaded.value) return
    try {
      const data = await tutorialsGet()
      progress.value = data?.progress || {}
      guide.value = {
        accessHash: data?.guide?.accessHash || null,
        ackAccessHash: data?.guide?.ackAccessHash || null,
        ackPerms: data?.guide?.ackPerms || [],
        firstTourCompleted: !!data?.guide?.firstTourCompleted,
      }
      preferences.value = {
        showOnFirstVisit: data?.preferences?.showOnFirstVisit !== false,
        showGuideButton: data?.preferences?.showGuideButton !== false,
      }
    } catch {
      // defaults are fine
    } finally {
      loaded.value = true
    }
  }

  // Decide what prompt (if any) to show once the member is at their Overview.
  function evaluate({ onOverview }) {
    if (!onOverview) return
    if (!preferences.value.showOnFirstVisit) return
    // First run: the member has never completed the first-workspace tour and
    // has no acknowledged access yet.
    if (!guide.value.firstTourCompleted && !guide.value.ackAccessHash) {
      intro.value = { type: 'first' }
      return
    }
    // Subsequent runs: compare acknowledged access with current access.
    if (guide.value.ackAccessHash && guide.value.ackAccessHash !== guide.value.accessHash) {
      const ack = new Set(guide.value.ackPerms || [])
      const added = currentPerms().filter(k => !ack.has(k))
      const removed = [...ack].filter(k => !currentPerms().includes(k))
      if (added.length) intro.value = { type: 'access-change', added, removed }
      else if (removed.length) intro.value = { type: 'access-removed' }
    }
  }

  function describeAdded(addedPerms) {
    const phrases = [...new Set((addedPerms || []).map(k => PERM_PHRASES[k]).filter(Boolean))]
    if (!phrases.length) return 'You now have access to additional areas of XPass HQ.'
    if (phrases.length === 1) return `You can now ${phrases[0]}.`
    return `You can now ${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}.`
  }

  async function acknowledgeAccess() {
    try {
      await tutorialsAccessAck({ accessHash: guide.value.accessHash, perms: currentPerms() })
    } catch {}
    guide.value.ackAccessHash = guide.value.accessHash
    guide.value.ackPerms = currentPerms()
  }

  async function completeFirstTour() {
    guide.value.firstTourCompleted = true
    try { await tutorialsFirstComplete() } catch {}
  }

  // Accept the intro prompt: start the relevant tour, then acknowledge.
  async function acceptIntro() {
    const kind = intro.value?.type
    const added = intro.value?.added || []
    intro.value = null
    if (kind === 'first') {
      await startTour('workspace')
    } else if (kind === 'access-change') {
      await startTourDef(buildAccessTour(added))
    }
    await acknowledgeAccess()
    if (kind === 'first') await completeFirstTour()
  }

  // "Show me later" / "Not now" both dismiss and acknowledge so we don't nag.
  async function dismissIntro() {
    const kind = intro.value?.type
    intro.value = null
    await acknowledgeAccess()
    if (kind === 'first') {
      // Mark first tour dismissed but not completed, so it can be replayed.
      progress.value['workspace'] = { version: VERSION, dismissedAt: new Date().toISOString() }
      try { await tutorialsDismiss('workspace', VERSION) } catch {}
      await completeFirstTour()
    }
  }

  async function savePreferences(prefs) {
    const patch = {}
    if (prefs.showOnFirstVisit !== undefined) patch.showOnFirstVisit = prefs.showOnFirstVisit
    if (prefs.showGuideButton !== undefined) patch.showGuideButton = prefs.showGuideButton
    preferences.value = { ...preferences.value, ...patch }
    try { await tutorialsPreferencesSet(patch) } catch {}
  }

  async function startTour(tourId) {
    await load()
    let tour = null
    if (tourId === 'workspace') tour = buildWorkspaceTour()
    else if (String(tourId).startsWith('module-')) tour = buildModuleTour(tourId.replace('module-', ''))
    if (!tour) {
      // Legacy/static fallback no longer needed; ignore unknown ids.
      return
    }
    activeTour.value = tour
    activeStep.value = 0
  }

  async function startTourDef(tour) {
    if (!tour) return
    activeTour.value = tour
    activeStep.value = 0
  }

  async function completeTour() {
    if (!activeTour.value) return
    const tour = activeTour.value
    progress.value[tour.id] = { version: tour.version, completedAt: new Date().toISOString() }
    activeTour.value = null
    activeStep.value = 0
    if (tour.id === 'workspace') await completeFirstTour()
    try { await tutorialsComplete(tour.id, tour.version) } catch {}
  }

  async function dismissTour() {
    if (!activeTour.value) return
    const tour = activeTour.value
    progress.value[tour.id] = { version: tour.version, dismissedAt: new Date().toISOString() }
    activeTour.value = null
    activeStep.value = 0
    try { await tutorialsDismiss(tour.id, tour.version) } catch {}
  }

  async function nextStep() {
    if (!activeTour.value) return
    if (activeStep.value < activeTour.value.steps.length - 1) activeStep.value++
    else await completeTour()
  }

  function prevStep() {
    if (activeStep.value > 0) activeStep.value--
  }

  async function resetTour(tourId) {
    try { await tutorialsReset(tourId) } catch {}
    delete progress.value[tourId]
  }

  async function resetAll() {
    try { await tutorialsReset() } catch {}
    progress.value = {}
    guide.value = { accessHash: null, ackAccessHash: null, ackPerms: [], firstTourCompleted: false }
    loaded.value = false
    await load()
  }

  const currentStep = computed(() => {
    if (!activeTour.value) return null
    return activeTour.value.steps[activeStep.value] || null
  })

  return {
    progress, preferences, guide, activeTour, activeStep, intro, loaded,
    currentStep, availableTours, myModules,
    isCompleted, isDismissed, shouldAutoStart,
    load, evaluate, savePreferences, startTour, startTourDef,
    completeTour, dismissTour, nextStep, prevStep,
    acceptIntro, dismissIntro, acknowledgeAccess, resetTour, resetAll,
    // helpers used by the guide-centre UI
    describeAdded, buildAccessTour,
  }
})