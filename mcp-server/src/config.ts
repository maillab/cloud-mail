import { loadEnvFile } from './env-file.js';

export interface Config {
  cloudMailUrl: string;
  cloudMailUser: string;
  cloudMailPassword: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadConfig(): Config {
  loadEnvFile();
  const cloudMailUrl = requireEnv('CLOUD_MAIL_URL').replace(/\/+$/, '');
  const cloudMailUser = requireEnv('CLOUD_MAIL_USER');
  const cloudMailPassword = requireEnv('CLOUD_MAIL_PASSWORD');
  return { cloudMailUrl, cloudMailUser, cloudMailPassword };
}

export const config: Config = loadConfig();
