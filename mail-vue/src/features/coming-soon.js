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
    tagline: 'WhatsApp, inside XPass HQ.',
    body:
      'Soon, XPass HQ will let the team manage the official XPass WhatsApp Business account directly from the dashboard.',
    intro: [
      'There will be no need to open another WhatsApp login, switch devices, or lose customer context across personal phones. Incoming WhatsApp chats, support questions, and customer follow-ups will appear inside XPass HQ alongside Mail, CRM, Requests, and Support Inbox.',
    ],
    sectionsTitle: 'What it will let the team do',
    sections: [
      {
        title: 'Receive WhatsApp messages in HQ',
        body: 'Customer chats sent to the official XPass WhatsApp Business number will arrive in one shared workspace.',
      },
      {
        title: 'Reply without leaving the dashboard',
        body: 'Authorized team members will read and answer WhatsApp conversations directly inside XPass HQ, without logging into WhatsApp Web or using a separate app.',
      },
      {
        title: 'Handle support in one place',
        body: 'WhatsApp support conversations will sit alongside email support, so the team can follow customer issues without switching tools.',
      },
      {
        title: 'Assign and transfer conversations',
        body: 'A conversation can be assigned to the right person, transferred to another team member, or returned to the shared queue.',
      },
      {
        title: 'Keep the full context',
        body: 'See previous messages, customer details, linked CRM records, related Requests, Projects, and support history in one place.',
      },
      {
        title: 'Use statuses, tags, and internal notes',
        body: 'Mark chats as Open, In Progress, Waiting for Customer, Waiting Internally, or Resolved. Add private notes and tags that customers never see.',
      },
      {
        title: 'Keep access controlled',
        body: 'Only team members who are explicitly given WhatsApp access will be able to view or handle conversations.',
      },
      {
        title: 'Use XPass AI later',
        body: 'XPass AI will eventually help summarize authorized conversation context and draft suggested replies for review. It will never send messages automatically.',
      },
    ],
    note:
      'WhatsApp is not connected in this release. No messages can currently be sent or received from XPass HQ.',
    bullets: [],
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
    intro: [],
    sections: [],
    bullets: [],
  };
}