-- Upgrade the existing production schema (v3.3) to v3.5.
ALTER TABLE email ADD COLUMN sender_email TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS account_forward (
				forward_id INTEGER PRIMARY KEY AUTOINCREMENT,
				account_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				target_email TEXT NOT NULL,
				status INTEGER NOT NULL DEFAULT 0,
				verify_code TEXT NOT NULL DEFAULT '',
				verify_expire_time TEXT,
				verify_send_time TEXT,
				verify_fail_count INTEGER NOT NULL DEFAULT 0,
				fail_count INTEGER NOT NULL DEFAULT 0,
				last_error TEXT NOT NULL DEFAULT '',
				create_time TEXT DEFAULT CURRENT_TIMESTAMP
			);

CREATE INDEX IF NOT EXISTS idx_account_forward_account ON account_forward(account_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_forward_unique ON account_forward(account_id, target_email COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS forward_verify_quota (
				quota_key TEXT PRIMARY KEY,
				count INTEGER NOT NULL DEFAULT 0,
				last_time INTEGER NOT NULL DEFAULT 0
			);

ALTER TABLE setting ADD COLUMN user_forward INTEGER NOT NULL DEFAULT 1;

INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES (37, '邮箱转发', 'account:forward', 21, 2, 3);
