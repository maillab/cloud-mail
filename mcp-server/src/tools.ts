import { z } from 'zod';
import type { ShapeOutput, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CloudMailClient } from './client.js';

export interface ToolDef<Shape extends ZodRawShapeCompat> {
  name: string;
  description: string;
  schema: Shape;
  handler: (client: CloudMailClient, args: ShapeOutput<Shape>) => Promise<unknown>;
}

const listEmailsSchema = {
  accountId: z.number().describe('Account id, from list_accounts'),
  type: z.enum(['receive', 'send']).default('receive').describe('Email direction'),
  emailId: z.number().optional().describe('Pagination cursor'),
  size: z.number().max(50).default(10).describe('Page size, max 50'),
  full: z.boolean().default(false).describe('Return full email body (true) or brief (false)'),
};

const latestEmailsSchema = {
  emailId: z.number().describe('Cursor; returns emails with id greater than this'),
  accountId: z.number().optional().describe('Account id, from list_accounts'),
};

const searchAllEmailsSchema = {
  type: z.enum(['receive', 'send', 'delete', 'noone']).default('receive').describe('Email category'),
  name: z.string().optional().describe('Sender/recipient name prefix filter'),
  subject: z.string().optional().describe('Subject prefix filter'),
  accountEmail: z.string().optional().describe('Account email prefix filter (to/send)'),
  userEmail: z.string().optional().describe('User email prefix filter'),
  emailId: z.number().optional().describe('Pagination cursor'),
  size: z.number().max(50).default(10).describe('Page size, max 50'),
  full: z.boolean().default(false).describe('Return full email body (true) or brief (false)'),
};

const getAttachmentsSchema = {
  emailId: z.number().describe('Email id'),
};

const sendEmailSchema = {
  accountId: z.number().describe('Sender account id, from list_accounts'),
  to: z.array(z.string()).min(1).describe('Recipient email addresses'),
  subject: z.string().default('').describe('Email subject'),
  text: z.string().optional().describe('Plain text body'),
  content: z.string().optional().describe('HTML body'),
  name: z.string().optional().describe('Sender display name'),
  replyToEmailId: z.number().optional().describe('If set, send as a reply to this email id'),
};

const markReadSchema = {
  emailIds: z.array(z.number()).min(1).describe('Email ids to mark as read'),
};

const listAccountsSchema = {
  size: z.number().max(30).default(30).describe('Page size, max 30'),
  lastSort: z.number().optional().describe('Pagination cursor'),
  accountId: z.number().optional().describe('Pagination cursor tiebreaker'),
};

// Each tool is exported individually (rather than as one array) so that
// `server.tool(...)` in index.ts gets a distinct, fully-inferred Shape per
// call — iterating a heterogeneous array would widen each element's schema
// type to a union and break zod arg inference.

export const listEmailsTool = {
  name: 'list_emails',
  description: 'List emails in a mailbox (account). Get accountId from list_accounts first.',
  schema: listEmailsSchema,
  handler: async (client, args) => {
    return client.get('/email/list', {
      accountId: args.accountId,
      type: args.type === 'send' ? 1 : 0,
      emailId: args.emailId,
      size: args.size,
      full: args.full ? 1 : 0,
    });
  },
} satisfies ToolDef<typeof listEmailsSchema>;

export const latestEmailsTool = {
  name: 'latest_emails',
  description: 'Get received emails newer than a given emailId (polling).',
  schema: latestEmailsSchema,
  handler: async (client, args) => {
    return client.get('/email/latest', {
      emailId: args.emailId,
      accountId: args.accountId,
    });
  },
} satisfies ToolDef<typeof latestEmailsSchema>;

export const searchAllEmailsTool = {
  name: 'search_all_emails',
  description: "Admin-wide search across ALL users' emails with filters.",
  schema: searchAllEmailsSchema,
  handler: async (client, args) => {
    return client.get('/allEmail/list', {
      type: args.type,
      name: args.name,
      subject: args.subject,
      accountEmail: args.accountEmail,
      userEmail: args.userEmail,
      emailId: args.emailId,
      size: args.size,
      full: args.full ? 1 : 0,
    });
  },
} satisfies ToolDef<typeof searchAllEmailsSchema>;

export const getAttachmentsTool = {
  name: 'get_attachments',
  description: 'List downloadable attachments of an email.',
  schema: getAttachmentsSchema,
  handler: async (client, args) => {
    return client.get('/email/attList', { emailId: args.emailId });
  },
} satisfies ToolDef<typeof getAttachmentsSchema>;

export const sendEmailTool = {
  name: 'send_email',
  description: 'Send an email from one of the mailbox accounts.',
  schema: sendEmailSchema,
  handler: async (client, args) => {
    const body: Record<string, unknown> = {
      accountId: args.accountId,
      receiveEmail: args.to,
      subject: args.subject,
      text: args.text ?? '',
      content: args.content ?? args.text ?? '',
      name: args.name,
    };
    if (args.replyToEmailId !== undefined) {
      body.sendType = 'reply';
      body.emailId = args.replyToEmailId;
    }
    const data = (await client.post('/email/send', body)) as unknown[];
    return data[0];
  },
} satisfies ToolDef<typeof sendEmailSchema>;

export const markReadTool = {
  name: 'mark_read',
  description:
    'Mark emails as read. Known backend caveat: the backend builds but does not run the update, so this always returns success but may not persist.',
  schema: markReadSchema,
  handler: async (client, args) => {
    await client.put('/email/read', { emailIds: args.emailIds });
    return { ok: true };
  },
} satisfies ToolDef<typeof markReadSchema>;

export const listAccountsTool = {
  name: 'list_accounts',
  description: 'List the mailbox accounts (addresses) available to the agent.',
  schema: listAccountsSchema,
  handler: async (client, args) => {
    return client.get('/account/list', {
      size: args.size,
      lastSort: args.lastSort,
      accountId: args.accountId,
    });
  },
} satisfies ToolDef<typeof listAccountsSchema>;
