import settingService from '../service/setting-service';
import userService from '../service/user-service';

const dbInit = {
	async init(c) {

		const secret = c.req.param('secret');

		if (secret !== c.env.jwt_secret) {
			return c.text('❌ JWT secret mismatch');
		}

		await this.intDB(c);
		await this.v2_3DB(c);
		await this.v2_4DB(c);
		await this.v2_5DB(c);
		await this.v2_6DB(c);
		await this.v2_7DB(c);
		await this.v2_8DB(c);
		await this.v3_0DB(c);
		await this.v3_1DB(c);
		await this.v3_2DB(c);
		await this.v3_3DB(c);
		await this.v3_4DB(c);
		await this.v3_5DB(c);
		await this.v3_6DB(c);
		await userService.initAdmin(c);
		await settingService.refresh(c);
		return c.text('success');
	},

	async v3_6DB(c) {
		try {
			// 保留当前的 1（关闭）和 2（开启），只转换旧版的关闭值和刷新间隔。
			await c.env.db.prepare(`
				UPDATE setting SET auto_refresh = CASE WHEN auto_refresh = 0 THEN 1 ELSE 2 END
				WHERE auto_refresh NOT IN (1, 2)
			`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN login_verify INTEGER NOT NULL DEFAULT 1`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN login_verify_count INTEGER NOT NULL DEFAULT 1`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN custom_worker_status INTEGER NOT NULL DEFAULT 1`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v3_5DB(c) {
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_user_create_time ON email(user_id, create_time)`).run();
	},

	async v3_4DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE email ADD COLUMN sender_email TEXT NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v3_3DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN auto_clean_days INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN auto_clean_exclude TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_create_time ON email(create_time)`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_url TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_status INTEGER NOT NULL DEFAULT 1;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_retry INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_secret TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v3_2DB(c) {
		try {
			await c.env.db.batch([
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN linuxdo_client_id TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN linuxdo_client_secret TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN github_client_id TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN github_client_secret TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN google_client_id TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN google_client_secret TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN linuxdo_switch INTEGER NOT NULL DEFAULT 1;`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN github_switch INTEGER NOT NULL DEFAULT 1;`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN google_switch INTEGER NOT NULL DEFAULT 1;`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_list_user ON email(user_id, type, is_del, email_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_list_account ON email(user_id, account_id, type, is_del, email_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_star_user_email ON star(user_id, email_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_star_email_user ON star(email_id, user_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_name_nocase ON email(name COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_subject_nocase ON email(subject COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_email_nocase ON user(email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_to_email_nocase ON email(to_email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_send_email_nocase ON email(send_email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_noone_id ON email(email_id) WHERE status = 7`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_type_id ON email(type, email_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_account_user_del_sort ON account(user_id, is_del, sort, account_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_saving_account ON email(account_id) WHERE status = 6`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_type_name ON email(type, name)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_type_create_time ON email(type, create_time)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_create_time ON user(create_time)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_type ON user(type)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_attachments_email_type ON attachments(email_id, type)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_role_perm_role ON role_perm(role_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_oauth_user_id ON oauth(oauth_user_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth(user_id)`)
			]);
		} catch (e) {
			console.warn(`跳过索引：${e.message}`);
		}
	},

	async v3_1DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN sync_delete INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},


	async v3_0DB(c) {
		try {
			await c.env.db.batch([
				await c.env.db.prepare(`ALTER TABLE email ADD COLUMN code TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ai_code INTEGER NOT NULL DEFAULT 1;`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ai_code_filter TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_subject TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_content TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_from TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

	},

	async v2_8DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE account ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v2_7DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting RENAME COLUMN auto_refresh_time TO auto_refresh;`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v2_6DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE account ADD COLUMN all_receive INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v2_5DB(c) {

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN email_prefix_filter text NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE email ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`UPDATE email SET unread = 1;`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

	},

	async v2_4DB(c) {
		try {
			await c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS oauth (
					oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,
					oauth_user_id TEXT,
					username TEXT,
					name TEXT,
					avatar TEXT,
					active INTEGER,
					trust_level INTEGER,
					silenced INTEGER,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					platform INTEGER NOT NULL DEFAULT 0,
					user_id INTEGER NOT NULL DEFAULT 0
				)
			`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN min_email_prefix INTEGER NOT NULL DEFAULT 1;`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

	},

	async v2_3DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN force_path_style	INTEGER NOT NULL DEFAULT 1;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN custom_domain TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_to TEXT NOT NULL DEFAULT 'show';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_from TEXT NOT NULL DEFAULT 'only-name';`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_text TEXT NOT NULL DEFAULT 'show';`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

	},

	// 2.0 及之前：最终表结构一次 batch 建好，不再逐步 ALTER
	async intDB(c) {
		const noticeContent = 'This project is for learning and communication only. Illegal use is prohibited.<br>Please comply with local laws. The author assumes no legal liability.' +
			'<br><br>' +
			'本项目仅供学习交流，禁止用于违法业务。<br>请遵守当地法规，作者不承担任何法律责任。';

		try {
			await c.env.db.batch([
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS email (
						email_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
						send_email TEXT,
						name TEXT,
						account_id INTEGER NOT NULL,
						user_id INTEGER NOT NULL,
						subject TEXT,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
						is_del INTEGER DEFAULT 0 NOT NULL,
						type INTEGER NOT NULL DEFAULT 0,
						status INTEGER NOT NULL DEFAULT 0,
						resend_email_id TEXT,
						message TEXT,
						recipient TEXT NOT NULL DEFAULT '[]',
						cc TEXT NOT NULL DEFAULT '[]',
						bcc TEXT NOT NULL DEFAULT '[]',
						message_id TEXT NOT NULL DEFAULT '',
						in_reply_to TEXT NOT NULL DEFAULT '',
						relation TEXT NOT NULL DEFAULT '',
						to_email TEXT NOT NULL DEFAULT '',
						to_name TEXT NOT NULL DEFAULT '',
						content TEXT,
						text TEXT
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS star (
						star_id INTEGER PRIMARY KEY AUTOINCREMENT,
						user_id INTEGER NOT NULL,
						email_id INTEGER NOT NULL,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS attachments (
						att_id INTEGER PRIMARY KEY AUTOINCREMENT,
						user_id INTEGER NOT NULL,
						email_id INTEGER NOT NULL,
						account_id INTEGER NOT NULL,
						key TEXT NOT NULL,
						filename TEXT,
						mime_type TEXT,
						size INTEGER,
						disposition TEXT,
						related TEXT,
						content_id TEXT,
						encoding TEXT,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
						status INTEGER NOT NULL DEFAULT 0,
						type INTEGER NOT NULL DEFAULT 0
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS user (
						user_id INTEGER PRIMARY KEY AUTOINCREMENT,
						email TEXT NOT NULL,
						type INTEGER DEFAULT 1 NOT NULL,
						password TEXT NOT NULL,
						salt TEXT NOT NULL,
						status INTEGER DEFAULT 0 NOT NULL,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
						active_time DATETIME,
						is_del INTEGER DEFAULT 0 NOT NULL,
						create_ip TEXT,
						active_ip TEXT,
						os TEXT,
						browser TEXT,
						device TEXT,
						sort INTEGER NOT NULL DEFAULT 0,
						send_count INTEGER NOT NULL DEFAULT 0,
						reg_key_id INTEGER NOT NULL DEFAULT 0
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS account (
						account_id INTEGER PRIMARY KEY AUTOINCREMENT,
						email TEXT NOT NULL,
						name TEXT NOT NULL DEFAULT '',
						status INTEGER DEFAULT 0 NOT NULL,
						latest_email_time DATETIME,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
						user_id INTEGER NOT NULL,
						is_del INTEGER DEFAULT 0 NOT NULL
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS setting (
						register INTEGER NOT NULL DEFAULT 0,
						receive INTEGER NOT NULL DEFAULT 0,
						add_email INTEGER NOT NULL DEFAULT 0,
						many_email INTEGER NOT NULL DEFAULT 0,
						title TEXT NOT NULL DEFAULT '',
						auto_refresh INTEGER NOT NULL DEFAULT 2,
						register_verify INTEGER NOT NULL DEFAULT 1,
						add_email_verify INTEGER NOT NULL DEFAULT 1,
						resend_tokens TEXT NOT NULL DEFAULT '{}',
						send INTEGER NOT NULL DEFAULT 0,
						r2_domain TEXT,
						site_key TEXT,
						secret_key TEXT,
						background TEXT,
						login_opacity INTEGER NOT NULL DEFAULT 0.90,
						tg_bot_token TEXT NOT NULL DEFAULT '',
						tg_chat_id TEXT NOT NULL DEFAULT '',
						tg_bot_status INTEGER NOT NULL DEFAULT 1,
						forward_email TEXT NOT NULL DEFAULT '',
						forward_status INTEGER NOT NULL DEFAULT 1,
						rule_email TEXT NOT NULL DEFAULT '',
						rule_type INTEGER NOT NULL DEFAULT 0,
						reg_key INTEGER NOT NULL DEFAULT 1,
						reg_verify_count INTEGER NOT NULL DEFAULT 1,
						add_verify_count INTEGER NOT NULL DEFAULT 1,
						notice_title TEXT NOT NULL DEFAULT 'Cloud Mail',
						notice_content TEXT NOT NULL DEFAULT '',
						notice_type TEXT NOT NULL DEFAULT 'none',
						notice_duration INTEGER NOT NULL DEFAULT 0,
						notice_offset INTEGER NOT NULL DEFAULT 0,
						notice_position TEXT NOT NULL DEFAULT 'top-right',
						notice_width INTEGER NOT NULL DEFAULT 340,
						notice INTEGER NOT NULL DEFAULT 0,
						no_recipient INTEGER NOT NULL DEFAULT 1,
						login_domain INTEGER NOT NULL DEFAULT 0,
						bucket TEXT NOT NULL DEFAULT '',
						region TEXT NOT NULL DEFAULT '',
						endpoint TEXT NOT NULL DEFAULT '',
						s3_access_key TEXT NOT NULL DEFAULT '',
						s3_secret_key TEXT NOT NULL DEFAULT ''
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS perm (
						perm_id INTEGER PRIMARY KEY AUTOINCREMENT,
						name TEXT NOT NULL,
						perm_key TEXT,
						pid INTEGER NOT NULL DEFAULT 0,
						type INTEGER NOT NULL DEFAULT 2,
						sort INTEGER
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS role (
						role_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
						name TEXT NOT NULL,
						key TEXT,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
						sort INTEGER DEFAULT 0,
						description TEXT,
						user_id INTEGER,
						is_default INTEGER DEFAULT 0,
						send_count INTEGER,
						send_type TEXT NOT NULL DEFAULT 'count',
						account_count INTEGER,
						avail_domain TEXT NOT NULL DEFAULT '',
						ban_email TEXT NOT NULL DEFAULT '',
						ban_email_type INTEGER NOT NULL DEFAULT 0
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS role_perm (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						role_id INTEGER,
						perm_id INTEGER
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS reg_key (
						rege_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
						code TEXT NOT NULL COLLATE NOCASE DEFAULT '',
						count INTEGER NOT NULL DEFAULT 0,
						role_id INTEGER NOT NULL DEFAULT 0,
						user_id INTEGER NOT NULL DEFAULT 0,
						expire_time DATETIME,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS verify_record (
						vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
						ip TEXT NOT NULL DEFAULT '',
						count INTEGER NOT NULL DEFAULT 1,
						type INTEGER NOT NULL DEFAULT 0,
						update_time DATETIME DEFAULT CURRENT_TIMESTAMP
					)
				`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_user_id_account_id ON email(user_id, account_id)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_nocase ON account (email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_nocase ON user (email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_code ON reg_key(code COLLATE NOCASE)`),
				c.env.db.prepare(`
					INSERT INTO setting (
						register, receive, add_email, many_email, title, auto_refresh, register_verify, add_email_verify,
						resend_tokens, send, login_opacity,
						tg_bot_token, tg_chat_id, tg_bot_status, forward_email, forward_status, rule_email, rule_type,
						reg_key, reg_verify_count, add_verify_count,
						notice_title, notice_content, notice_type, notice_duration, notice_offset, notice_position, notice_width, notice, no_recipient,
						login_domain, bucket, region, endpoint, s3_access_key, s3_secret_key
					)
					SELECT 0, 0, 0, 0, 'Cloud Mail', 2, 1, 1,
						'{}', 0, 0.90,
						'', '', 1, '', 1, '', 0,
						1, 1, 1,
						'Cloud Mail', ?, 'none', 0, 0, 'top-right', 340, 0, 1,
						0, '', '', '', '', ''
					WHERE NOT EXISTS (SELECT 1 FROM setting)
				`).bind(noticeContent),
				c.env.db.prepare(`
					INSERT OR IGNORE INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
					(1, '邮件', NULL, 0, 0, 0),
					(2, '邮件删除', 'email:delete', 1, 2, 1),
					(3, '邮件发送', 'email:send', 1, 2, 0),
					(4, '个人设置', '', 0, 1, 2),
					(5, '用户注销', 'my:delete', 4, 2, 0),
					(6, '用户信息', NULL, 0, 1, 3),
					(7, '用户查看', 'user:query', 6, 2, 0),
					(8, '密码修改', 'user:set-pwd', 6, 2, 2),
					(9, '状态修改', 'user:set-status', 6, 2, 3),
					(10, '权限修改', 'user:set-type', 6, 2, 4),
					(11, '用户删除', 'user:delete', 6, 2, 7),
					(13, '权限控制', '', 0, 1, 5),
					(14, '身份查看', 'role:query', 13, 2, 0),
					(15, '身份修改', 'role:set', 13, 2, 1),
					(16, '身份删除', 'role:delete', 13, 2, 2),
					(17, '系统设置', '', 0, 1, 6),
					(18, '设置查看', 'setting:query', 17, 2, 0),
					(19, '设置修改', 'setting:set', 17, 2, 1),
					(21, '邮箱侧栏', '', 0, 0, 1),
					(22, '邮箱查看', 'account:query', 21, 2, 0),
					(23, '邮箱添加', 'account:add', 21, 2, 1),
					(24, '邮箱删除', 'account:delete', 21, 2, 2),
					(25, '用户添加', 'user:add', 6, 2, 1),
					(26, '发件重置', 'user:reset-send', 6, 2, 6),
					(27, '邮件列表', '', 0, 1, 4),
					(28, '邮件查看', 'all-email:query', 27, 2, 0),
					(29, '邮件删除', 'all-email:delete', 27, 2, 0),
					(30, '身份添加', 'role:add', 13, 2, -1),
					(31, '分析页', NULL, 0, 1, 2.1),
					(32, '数据查看', 'analysis:query', 31, 2, 1),
					(33, '注册密钥', NULL, 0, 1, 5.1),
					(34, '密钥查看', 'reg-key:query', 33, 2, 0),
					(35, '密钥添加', 'reg-key:add', 33, 2, 1),
					(36, '密钥删除', 'reg-key:delete', 33, 2, 2)
				`),
				// 先写入默认权限，再创建首个角色。两条语句共用同一个批次。
				c.env.db.prepare(`
					WITH default_permissions(id, perm_id) AS (
						VALUES (100, 2), (101, 21), (102, 22), (103, 23), (104, 24),
						       (105, 4), (106, 5), (107, 1), (108, 3)
					)
					INSERT INTO role_perm (id, role_id, perm_id)
					SELECT id, 1, perm_id FROM default_permissions
					WHERE NOT EXISTS (SELECT 1 FROM role)
					  AND NOT EXISTS (SELECT 1 FROM role_perm)
				`),
				c.env.db.prepare(`
					INSERT INTO role (
						role_id, name, key, create_time, sort, description, user_id, is_default, send_count, send_type, account_count, avail_domain, ban_email, ban_email_type
					)
					SELECT 1, '普通用户', NULL, '0000-00-00 00:00:00', 0, '只有普通使用权限', 0, 1, NULL, 'ban', 10, '', '', 0
					WHERE NOT EXISTS (SELECT 1 FROM role)
				`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},
};
export { dbInit };
