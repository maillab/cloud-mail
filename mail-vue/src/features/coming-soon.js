// Copy for the reusable Coming Soon experience. Each entry is keyed by the
// feature id used in the route (/coming-soon/:feature) and in the feature
// registry. Keep the promise honest: describe what the feature WILL do, never
// imply it works today, and never expose a button that calls an API.

export const comingSoonContent = {
  'xpass-one': {
    name: 'XPass AI',
    icon: 'fluent:brain-circuit-20-regular',
    tagline: 'The intelligence layer across XPass HQ.',
    body:
      'XPass AI will help Team members understand their work — summarizing records they can already see, surfacing what needs attention, and drafting responses — always respecting each member’s individual access.',
    bullets: [
      'Understand the current page',
      'Summarize authorized work',
      'Help draft replies for human review',
      'Explain support conversations',
      'Surface requests, deadlines, and approvals',
      'Find authorized CRM relationships',
      'Help navigate HQ',
      'Respect member access at every step',
    ],
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: 'fluent:chat-20-regular',
    tagline: 'One official XPass number, handled together.',
    body:
      'WhatsApp will become a shared company inbox: one official number that authorized Team members handle together from HQ, with assignment, internal notes, and links back into Requests and CRM.',
    bullets: [
      'Shared official XPass WhatsApp',
      'Team assignment and ownership',
      'Support conversations in one place',
      'Internal notes alongside messages',
      'Link conversations to Requests and CRM',
    ],
  },
  projects: {
    name: 'Projects',
    icon: 'fluent:clipboard-task-20-regular',
    tagline: 'Plans, work, and delivery in one place.',
    body:
      'Projects will group the work XPass is delivering — milestones, tasks and owners — so the team can see what is on track without a separate tool.',
    bullets: [
      'Milestones and tasks',
      'Owners and due dates',
      'Progress at a glance',
    ],
  },
  calendar: {
    name: 'Calendar',
    icon: 'fluent:calendar-ltr-20-regular',
    tagline: 'Schedules and events for the team.',
    body:
      'Calendar will bring company schedules and events into HQ with clear visibility controls, so the right people see the right events.',
    bullets: [
      'Company and personal events',
      'Visibility controls',
      'Shared team schedules',
    ],
  },
  notes: {
    name: 'Notes',
    icon: 'fluent:document-20-regular',
    tagline: 'Quick notes and reminders.',
    body:
      'Notes will be a lightweight place for personal notes and reminders that stay close to the work they relate to.',
    bullets: [
      'Personal notes',
      'Reminders',
      'Link notes to records',
    ],
  },
  announcements: {
    name: 'Announcements',
    icon: 'fluent:megaphone-loud-20-regular',
    tagline: 'Company-wide updates, acknowledged.',
    body:
      'Announcements will let administrators publish company updates and see who has read them, so important messages do not get lost.',
    bullets: [
      'Publish company updates',
      'Audience targeting',
      'Read acknowledgements',
    ],
  },
};

export function getComingSoon(feature) {
  return comingSoonContent[feature] || {
    name: 'This feature',
    icon: 'fluent:clock-20-regular',
    tagline: 'Coming soon.',
    body: 'This part of XPass HQ is being built and will be available in a future release.',
    bullets: [],
  };
}