import { describe, expect, it, vi } from 'vitest';
import type { CloudMailClient } from '../src/client.js';
import {
  getAttachmentsTool,
  latestEmailsTool,
  listAccountsTool,
  listEmailsTool,
  markReadTool,
  searchAllEmailsTool,
  sendEmailTool,
} from '../src/tools.js';

function makeFakeClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  } as unknown as CloudMailClient & {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
}

describe('listEmailsTool', () => {
  it('maps type "send" to 1 and full:true to 1, passing accountId/emailId/size through', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue({ list: [], total: 0 });

    await listEmailsTool.handler(client, {
      accountId: 5,
      type: 'send',
      emailId: 100,
      size: 20,
      full: true,
    } as never);

    expect(client.get).toHaveBeenCalledWith('/email/list', {
      accountId: 5,
      type: 1,
      emailId: 100,
      size: 20,
      full: 1,
    });
  });

  it('defaults type to 0 (receive) and full to 0 when not "send"/true', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue({ list: [], total: 0 });

    await listEmailsTool.handler(client, {
      accountId: 5,
      type: 'receive',
      emailId: undefined,
      size: 10,
      full: false,
    } as never);

    expect(client.get).toHaveBeenCalledWith('/email/list', {
      accountId: 5,
      type: 0,
      emailId: undefined,
      size: 10,
      full: 0,
    });
  });
});

describe('searchAllEmailsTool', () => {
  it('passes type through as the raw string, maps full to 1/0, and passes filter params', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue({ list: [], total: 0 });

    await searchAllEmailsTool.handler(client, {
      type: 'delete',
      name: 'alice',
      subject: 'hello',
      accountEmail: 'a@b.com',
      userEmail: 'u@b.com',
      emailId: 42,
      size: 15,
      full: true,
    } as never);

    expect(client.get).toHaveBeenCalledWith('/allEmail/list', {
      type: 'delete',
      name: 'alice',
      subject: 'hello',
      accountEmail: 'a@b.com',
      userEmail: 'u@b.com',
      emailId: 42,
      size: 15,
      full: 1,
    });
  });

  it('maps full:false to 0', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue({ list: [], total: 0 });

    await searchAllEmailsTool.handler(client, {
      type: 'receive',
      size: 10,
      full: false,
    } as never);

    expect(client.get).toHaveBeenCalledWith(
      '/allEmail/list',
      expect.objectContaining({ type: 'receive', full: 0 })
    );
  });
});

describe('sendEmailTool', () => {
  it('uses `to` as receiveEmail, content falls back to text, sets reply fields when replyToEmailId is set, and returns data[0]', async () => {
    const client = makeFakeClient();
    const savedRow = { id: 1 };
    client.post.mockResolvedValue([savedRow]);

    const result = await sendEmailTool.handler(client, {
      accountId: 3,
      to: ['a@b.com', 'c@d.com'],
      subject: 'Hi',
      text: 'plain text',
      name: 'Sender',
      replyToEmailId: 99,
    } as never);

    expect(client.post).toHaveBeenCalledWith('/email/send', {
      accountId: 3,
      receiveEmail: ['a@b.com', 'c@d.com'],
      subject: 'Hi',
      text: 'plain text',
      content: 'plain text',
      name: 'Sender',
      sendType: 'reply',
      emailId: 99,
    });
    expect(result).toBe(savedRow);
  });

  it('defaults text and content to "" when neither is given, and omits reply fields when replyToEmailId is unset', async () => {
    const client = makeFakeClient();
    const savedRow = { id: 2 };
    client.post.mockResolvedValue([savedRow]);

    const result = await sendEmailTool.handler(client, {
      accountId: 3,
      to: ['a@b.com'],
      subject: 'Hi',
    } as never);

    expect(client.post).toHaveBeenCalledWith('/email/send', {
      accountId: 3,
      receiveEmail: ['a@b.com'],
      subject: 'Hi',
      text: '',
      content: '',
      name: undefined,
    });
    expect(result).toBe(savedRow);
  });

  it('prefers content over text when both are given', async () => {
    const client = makeFakeClient();
    const savedRow = { id: 3 };
    client.post.mockResolvedValue([savedRow]);

    await sendEmailTool.handler(client, {
      accountId: 3,
      to: ['a@b.com'],
      subject: 'Hi',
      text: 'plain',
      content: '<b>html</b>',
    } as never);

    expect(client.post).toHaveBeenCalledWith(
      '/email/send',
      expect.objectContaining({ text: 'plain', content: '<b>html</b>' })
    );
  });
});

describe('markReadTool', () => {
  it('PUTs /email/read with {emailIds} and returns {ok:true}', async () => {
    const client = makeFakeClient();
    client.put.mockResolvedValue(null);

    const result = await markReadTool.handler(client, { emailIds: [1, 2, 3] } as never);

    expect(client.put).toHaveBeenCalledWith('/email/read', { emailIds: [1, 2, 3] });
    expect(result).toEqual({ ok: true });
  });
});

describe('latestEmailsTool', () => {
  it('GETs /email/latest with emailId and accountId', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue([]);

    await latestEmailsTool.handler(client, { emailId: 50, accountId: 7 } as never);

    expect(client.get).toHaveBeenCalledWith('/email/latest', { emailId: 50, accountId: 7 });
  });
});

describe('getAttachmentsTool', () => {
  it('GETs /email/attList with emailId', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue([]);

    await getAttachmentsTool.handler(client, { emailId: 10 } as never);

    expect(client.get).toHaveBeenCalledWith('/email/attList', { emailId: 10 });
  });
});

describe('listAccountsTool', () => {
  it('GETs /account/list with size, lastSort, accountId', async () => {
    const client = makeFakeClient();
    client.get.mockResolvedValue([]);

    await listAccountsTool.handler(client, { size: 30, lastSort: 100, accountId: 5 } as never);

    expect(client.get).toHaveBeenCalledWith('/account/list', {
      size: 30,
      lastSort: 100,
      accountId: 5,
    });
  });
});
