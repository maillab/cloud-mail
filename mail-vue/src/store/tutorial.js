import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tutorialsGet, tutorialsPreferencesSet, tutorialsComplete, tutorialsDismiss, tutorialsReset } from '@/request/notifications.js'

// Tour definitions live in the frontend — they are UI copy, not data. The
// backend only persists progress. Each step targets a CSS selector (the
// element to spotlight) or a route name (navigate first, then spotlight).
//
// A tour has: id, version, title, description, steps[]. A step has:
//   target    — CSS selector for the element to highlight (or null for center)
//   route     — optional route name to navigate to before showing this step
//   title     — coachmark heading
//   body      — coachmark body copy
//   placement — 'top' | 'bottom' | 'left' | 'right' | 'center'

export const TOURS = [
  {
    id: 'welcome',
    version: 1,
    title: 'Welcome to XPass HQ',
    description: 'A quick tour of your new workspace.',
    steps: [
      {
        target: '.module-container, main',
        title: 'Welcome to XPass HQ',
        body: 'This is your company workspace. Everything you need — mail, CRM, finance, documents — lives here. Let’s take a quick look around.',
        placement: 'center',
      },
      {
        target: '.aside, [class*="sidebar"], [class*="aside"]',
        title: 'Your navigation',
        body: 'The sidebar is your home base. Switch between Mail, Support Inbox, CRM, Finance, Documents, and more. Items you don’t have access to are hidden.',
        placement: 'right',
      },
      {
        target: '.module-actions, [class*="module-actions"]',
        title: 'Create anything',
        body: 'Use the Create button to start a new email, contact, deal, task, or document — whatever your role allows.',
        placement: 'bottom',
      },
      {
        target: '[class*="header"], header',
        title: 'Stay informed',
        body: 'The header keeps you connected: notifications on the bell, your profile, and quick access to settings. You can personalise notification preferences in Settings.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'mail-basics',
    version: 1,
    title: 'Mail essentials',
    description: 'Compose, search, and organise your inbox.',
    route: 'mail',
    steps: [
      {
        target: '.mail-folder-list, [class*="folder-list"]',
        title: 'Your folders',
        body: 'Inbox, Sent, Drafts, Starred, and any custom folders live here. Click a folder to filter your mail.',
        placement: 'right',
      },
      {
        target: '.mail-list, [class*="mail-list"]',
        title: 'Message list',
        body: 'Select a message to read it. Use the search bar to find mail by subject, sender, or content.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'shared-inbox',
    version: 1,
    title: 'Shared inboxes',
    description: 'How team inboxes work.',
    route: 'mail-shared-inbox',
    steps: [
      {
        target: '.si-heading, [class*="si-heading"]',
        title: 'Shared inbox',
        body: 'A shared inbox is a company address (like support@) that your whole team can work together. Switch between your shared inboxes using the selector in the header.',
        placement: 'bottom',
      },
      {
        target: '.si-filters, [class*="si-filters"]',
        title: 'Queue filters',
        body: 'Filter by status, priority, or assignee. “Assigned to me” shows only conversations assigned to you.',
        placement: 'bottom',
      },
      {
        target: '.si-items, [class*="si-items"]',
        title: 'Conversations',
        body: 'Click a conversation to open the thread. You can reply, assign, add internal notes, and resolve — all without leaving the shared inbox.',
        placement: 'right',
      },
    ],
  },
  {
    id: 'finance-overview',
    version: 1,
    title: 'Finance at a glance',
    description: 'Your company financial position.',
    route: 'finance',
    steps: [
      {
        target: '.finance-tabs, [class*="finance-tabs"], [class*="tabs"]',
        title: 'Finance panels',
        body: 'Finance is organised into tabs: Overview, Accounts, Transactions, Budgets, Debts, Subscriptions, Payments, Invoices, Reports, and Audit. Pick the one you need.',
        placement: 'bottom',
      },
    ],
  },
]

export const useTutorialStore = defineStore('tutorial', () => {
  const progress = ref({})       // { [tourId]: { version, completedAt, dismissedAt } }
  const preferences = ref({ showOnFirstVisit: true, showGuideButton: true })
  const activeTour = ref(null)   // tour definition currently being shown
  const activeStep = ref(0)
  const loaded = ref(false)

  function isCompleted(tourId, version = 1) {
    const p = progress.value[tourId]
    return !!p && p.version >= version && !!p.completedAt
  }

  function isDismissed(tourId, version = 1) {
    const p = progress.value[tourId]
    return !!p && p.version >= version && !!p.dismissedAt && !p.completedAt
  }

  function shouldAutoStart(tourId, version = 1) {
    if (!preferences.value.showOnFirstVisit) return false
    return !isCompleted(tourId, version) && !isDismissed(tourId, version)
  }

  async function load() {
    if (loaded.value) return
    try {
      const data = await tutorialsGet()
      progress.value = data?.progress || {}
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

  async function savePreferences(prefs) {
    const patch = {}
    if (prefs.showOnFirstVisit !== undefined) patch.showOnFirstVisit = prefs.showOnFirstVisit
    if (prefs.showGuideButton !== undefined) patch.showGuideButton = prefs.showGuideButton
    preferences.value = { ...preferences.value, ...patch }
    try { await tutorialsPreferencesSet(patch) } catch {}
  }

  async function startTour(tourId) {
    const tour = TOURS.find(t => t.id === tourId)
    if (!tour) return
    await load()
    if (tour.route) {
      // navigate to the tour's route before showing step 0
      // (caller handles navigation; we just set the active tour)
    }
    activeTour.value = tour
    activeStep.value = 0
  }

  async function completeTour() {
    if (!activeTour.value) return
    const tour = activeTour.value
    progress.value[tour.id] = { version: tour.version, completedAt: new Date().toISOString() }
    activeTour.value = null
    activeStep.value = 0
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
    if (activeStep.value < activeTour.value.steps.length - 1) {
      activeStep.value++
    } else {
      await completeTour()
    }
  }

  function prevStep() {
    if (activeStep.value > 0) activeStep.value--
  }

  async function resetTour(tourId) {
    try { await tutorialsReset(tourId) } catch {}
    delete progress.value[tourId]
    loaded.value = false
    await load()
  }

  async function resetAll() {
    try { await tutorialsReset() } catch {}
    progress.value = {}
    loaded.value = false
    await load()
  }

  const currentStep = computed(() => {
    if (!activeTour.value) return null
    return activeTour.value.steps[activeStep.value] || null
  })

  const availableTours = computed(() => {
    return TOURS.filter(t => !isCompleted(t.id, t.version))
  })

  return {
    progress, preferences, activeTour, activeStep, loaded,
    currentStep, availableTours,
    isCompleted, isDismissed, shouldAutoStart,
    load, savePreferences, startTour, completeTour, dismissTour,
    nextStep, prevStep, resetTour, resetAll,
  }
})