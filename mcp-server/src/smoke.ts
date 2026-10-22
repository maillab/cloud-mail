// Manual smoke test — not run in CI. Run with `npm run smoke`.
import { loadEnvFile } from './env-file.js';
import { CloudMailClient } from './client.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  loadEnvFile();

  const baseUrl = requireEnv('CLOUD_MAIL_URL').replace(/\/+$/, '');
  const user = requireEnv('CLOUD_MAIL_USER');
  const password = requireEnv('CLOUD_MAIL_PASSWORD');

  const client = new CloudMailClient(baseUrl, user, password);

  console.error('Calling list_accounts...');
  const accounts = (await client.get('/account/list', { size: 30 })) as Array<{ accountId: number }>;
  console.error(JSON.stringify(accounts, null, 2));

  if (Array.isArray(accounts) && accounts.length > 0) {
    const accountId = accounts[0].accountId;
    console.error(`Calling list_emails for accountId=${accountId}...`);
    const emails = await client.get('/email/list', { accountId, size: 2 });
    console.error(JSON.stringify(emails, null, 2));
  } else {
    console.error('No accounts returned; skipping list_emails.');
  }
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
