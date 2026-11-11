-- Forwarding targets are scoped to the user (PR #3). Creates user_forward next to the
-- unused account_forward table from 0001; account_forward is intentionally left in place.
CREATE TABLE IF NOT EXISTS user_forward (
	forward_id INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE INDEX IF NOT EXISTS idx_user_forward_user ON user_forward(user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_forward_unique ON user_forward(user_id, target_email COLLATE NOCASE);
