// Central feature-status registry.
//
// Every primary module is exactly one of:
//   active      -> the route works and the feature is usable
//   comingSoon  -> the route opens a clean Coming Soon experience
//   hidden      -> not shown in navigation at all
//
// Navigation and routing consult this single source. Do NOT scatter feature
// flags across random components. When a feature becomes reliable, flip its
// status here to 'active' and remove its Coming Soon redirect.
//
// Keys match module ids in @/modules/registry.js.

export const FEATURE_STATUS = {
  // Core release modules
  overview: 'active',
  mail: 'active',
  crm: 'active',
  finance: 'active',
  documents: 'active',
  requests: 'active',
  team: 'active',
  settings: 'active',
  security: 'active',
  'admin-people': 'active',
  'admin-roles': 'active',
  'admin-connections': 'active',
  'admin-reports': 'active',
  'admin-mail': 'active',
  'admin-company': 'active',

  // Only WhatsApp is coming soon — it shows an explainer page.
  // Everything else is fully active and working.
  whatsapp: 'comingSoon',
  projects: 'active',
  calendar: 'active',
  notes: 'active',
  'xpass-one': 'active',
  announcements: 'active',
};

export function featureStatus(id) {
  return FEATURE_STATUS[id] || 'active';
}

export function isComingSoon(id) {
  return featureStatus(id) === 'comingSoon';
}

export function isHidden(id) {
  return featureStatus(id) === 'hidden';
}