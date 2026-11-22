import settingService from '../service/setting-service';
import emailUtils from '../utils/email-utils';
import {emailConst} from "../const/entity-const";

const dbInit = {
	async init(c) {

		const secret = c.req.param('secret');

		if (secret !== c.env.jwt_secret) {
			return c.text('âŒ JWT secret mismatch');
		}

		await this.intDB(c);
		await this.v1_1DB(c);
		await this.v1_2DB(c);
		await this.v1_3DB(c);
		await this.v1_3_1DB(c);
		await this.v1_4DB(c);
		await this.v1_5DB(c);
		await this.v1_6DB(c);
		await this.v1_7DB(c);
		await this.v2DB(c);
		await this.v2_3DB(c);
		await this.v2_4DB(c);
		await this.v2_5DB(c);
		await this.v2_6DB(c);
		await this.v2_7DB(c);
		await this.v2_8DB(c);
		await this.v2_9DB(c);
		await this.v3_0DB(c);
		await this.v3_1DB(c);
		await this.v3_2DB(c);
		await this.v3_3DB(c);
		await this.v3_4DB(c);
		await this.v3_5DB(c);
		await this.v3_6DB(c);
		await this.v3_7DB(c);
		await this.v3_8DB(c);
		await this.v3_9DB(c);
		await this.v3_10DB(c);
		await this.v3_11DB(c);
		await this.v3_12DB(c);
		await this.v3_13DB(c);
		await this.v3_14DB(c);
		await this.v3_15DB(c);
		await this.v3_16DB(c);
		await this.v3_17DB(c);
		await this.v3_18DB(c);
		await this.v3_19DB(c);
		await this.v3_20DB(c);
		await this.v3_21DB(c);
		await this.v3_22DB(c);
		await this.v3_23DB(c);
		await this.v3_24DB(c);
		await this.v3_25DB(c);
		await this.v3_26DB(c);
	await this.v3_27DB(c);
	await this.v3_28DB(c);
	await this.v3_29DB(c);
	await this.v3_30DB(c);
	await this.v3_31DB(c);
		await this.v3_32DB(c);
		await this.v3_33DB(c);
		await this.v3_34DB(c);
		await this.v3_35DB(c);
		await this.v3_36DB(c);
		await this.v3_37DB(c);
		await this.v3_38DB(c);
		await this.v3_39DB(c);
		await this.v3_40DB(c);
		await this.v3_41DB(c);
		await settingService.refresh(c);
		return c.text('success');
	},

	async v3_8DB(c) {
		for (const [column, definition] of [
			['signature', "TEXT NOT NULL DEFAULT ''"],
			['signature_enabled', 'INTEGER NOT NULL DEFAULT 1'],
			['signature_reply_enabled', 'INTEGER NOT NULL DEFAULT 1']
		]) {
			try {
				await c.env.db.prepare(`ALTER TABLE account ADD COLUMN ${column} ${definition};`).run();
			} catch (error) {
				if (!error.message?.toLowerCase().includes('duplicate column')) {
					throw error;
				}
			}
		}
		try {
			await c.env.db.prepare(`ALTER TABLE user ADD COLUMN signature_settings TEXT NOT NULL DEFAULT '{}';`).run();
		} catch (error) {
			if (!error.message?.toLowerCase().includes('duplicate column')) {
				throw error;
			}
		}
	},

	async v3_9DB(c) {
		// CRM tables â€” additive, user_id tenancy (maps to user.user_id), soft delete via is_del
		await c.env.db.batch([
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_contacts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				email TEXT,
				phone TEXT,
				company_id INTEGER,
				address TEXT,
				tags TEXT DEFAULT '[]',
				source TEXT DEFAULT 'manual',
				notes TEXT DEFAULT '',
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				is_del INTEGER DEFAULT 0 NOT NULL
			);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_contacts_user ON crm_contacts(user_id, is_del);`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_companies (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				domain TEXT,
				industry TEXT,
				address TEXT,
				phone TEXT,
				website TEXT,
				notes TEXT DEFAULT '',
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				is_del INTEGER DEFAULT 0 NOT NULL
			);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_companies_user ON crm_companies(user_id, is_del);`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_pipelines (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				slug TEXT NOT NULL DEFAULT '',
				description TEXT DEFAULT '',
				position INTEGER DEFAULT 1000 NOT NULL,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				is_del INTEGER DEFAULT 0 NOT NULL
			);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_pipelines_user ON crm_pipelines(user_id, is_del);`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_stages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				pipeline_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				slug TEXT NOT NULL DEFAULT '',
				position INTEGER DEFAULT 1000 NOT NULL,
				color TEXT,
				is_won INTEGER DEFAULT 0 NOT NULL,
				is_lost INTEGER DEFAULT 0 NOT NULL,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				is_del INTEGER DEFAULT 0 NOT NULL
			);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline ON crm_stages(pipeline_id, is_del);`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_deals (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				pipeline_id INTEGER,
				stage_id INTEGER,
				contact_id INTEGER,
				company_id INTEGER,
				title TEXT NOT NULL DEFAULT '',
				value_cents INTEGER DEFAULT 0,
				currency TEXT DEFAULT 'KES',
				status TEXT DEFAULT 'open',
				expected_close_date TEXT,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				is_del INTEGER DEFAULT 0 NOT NULL
			);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_deals_user ON crm_deals(user_id, is_del);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline_stage ON crm_deals(pipeline_id, stage_id, is_del);`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_tasks (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				deal_id INTEGER,
				contact_id INTEGER,
				title TEXT NOT NULL DEFAULT '',
				description TEXT DEFAULT '',
				status TEXT DEFAULT 'pending',
				priority TEXT DEFAULT 'medium',
				due_at TEXT,
				assigned_to INTEGER,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				is_del INTEGER DEFAULT 0 NOT NULL
			);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_tasks_user ON crm_tasks(user_id, is_del);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal ON crm_tasks(deal_id, is_del);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact ON crm_tasks(contact_id, is_del);`),
		]);

		// CRM permission seed data (mirrors v1_1DB perm structure)
		const {permTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'crm:%'`).first();
		if (permTotal === 0) {
			await c.env.db.prepare(`
			INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
			('å®¢æˆ·ç®¡ç†', NULL, 0, 1, 10),
			('å®¢æˆ·æŸ¥çœ‹', 'contacts:query', 0, 2, 1),
			('å®¢æˆ·æ·»åŠ ', 'contacts:add', 0, 2, 2),
			('å®¢æˆ·ç¼–è¾‘', 'contacts:edit', 0, 2, 3),
			('å®¢æˆ·åˆ é™¤', 'contacts:delete', 0, 2, 4),
			('å…¬å¸ç®¡ç†', NULL, 0, 1, 11),
			('å…¬å¸æŸ¥çœ‹', 'companies:query', 0, 2, 1),
			('å…¬å¸æ·»åŠ ', 'companies:add', 0, 2, 2),
			('å…¬å¸ç¼–è¾‘', 'companies:edit', 0, 2, 3),
			('å…¬å¸åˆ é™¤', 'companies:delete', 0, 2, 4),
			('é”€å”®æ¼æ–—', NULL, 0, 1, 12),
			('æ¼æ–—æŸ¥çœ‹', 'pipelines:query', 0, 2, 1),
			('æ¼æ–—æ·»åŠ ', 'pipelines:add', 0, 2, 2),
			('æ¼æ–—ç¼–è¾‘', 'pipelines:edit', 0, 2, 3),
			('æ¼æ–—åˆ é™¤', 'pipelines:delete', 0, 2, 4),
			('ä¸šåŠ¡æœºä¼š', NULL, 0, 1, 13),
			('æœºä¼šæŸ¥çœ‹', 'deals:query', 0, 2, 1),
			('æœºä¼šæ·»åŠ ', 'deals:add', 0, 2, 2),
			('æœºä¼šç¼–è¾‘', 'deals:edit', 0, 2, 3),
			('æœºä¼šåˆ é™¤', 'deals:delete', 0, 2, 4),
			('ä»»åŠ¡ç®¡ç†', NULL, 0, 1, 14),
			('ä»»åŠ¡æŸ¥çœ‹', 'tasks:query', 0, 2, 1),
			('ä»»åŠ¡æ·»åŠ ', 'tasks:add', 0, 2, 2),
			('ä»»åŠ¡ç¼–è¾‘', 'tasks:edit', 0, 2, 3),
			('ä»»åŠ¡åˆ é™¤', 'tasks:delete', 0, 2, 4)
		`).run();

			// Link CRM perms to default role (role_id = 1, the 'User' role seeded in v1_1DB)
			const crmPermIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'crm:%'`).all();
			if (crmPermIds.results && crmPermIds.results.length > 0) {
				const values = crmPermIds.results.map(p => `(${1}, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}
	},

	async v3_10DB(c) {
		// crm_leads: leads that can be qualified into contacts/deals
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_leads (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			email TEXT,
			phone TEXT,
			company TEXT,
			source TEXT DEFAULT 'manual',
			status TEXT DEFAULT 'new',
			value_cents INTEGER DEFAULT 0,
			currency TEXT DEFAULT 'KES',
			notes TEXT DEFAULT '',
			assigned_to INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_leads_user ON crm_leads(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status, is_del);`).run();

		// crm_activities: activity history (calls, emails, meetings, notes, create/update/delete)
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_activities (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			entity_type TEXT NOT NULL DEFAULT '',
			entity_id INTEGER NOT NULL,
			activity_type TEXT NOT NULL DEFAULT '',
			subject TEXT DEFAULT '',
			description TEXT DEFAULT '',
			occurred_at TEXT,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_activities_user ON crm_activities(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_activities_entity ON crm_activities(entity_type, entity_id, is_del)`).run();

		// Assignment columns on existing CRM tables
		for (const [table, column] of [
			['crm_contacts', 'assigned_to'],
			['crm_companies', 'assigned_to'],
			['crm_deals', 'assigned_to']
		]) {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER;`).run();
			} catch (error) {
				if (!error.message?.toLowerCase().includes('duplicate column')) {
					throw error;
				}
			}
		}

		// Leads permission seed
		const {permTotal: leadsPermTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'leads:%'`).first();
		if (leadsPermTotal === 0) {
			await c.env.db.prepare(`
			INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
			('çº¿ç´¢ç®¡ç†', NULL, 0, 1, 15),
			('çº¿ç´¢æŸ¥çœ‹', 'leads:query', 0, 2, 1),
			('çº¿ç´¢æ·»åŠ ', 'leads:add', 0, 2, 2),
			('çº¿ç´¢ç¼–è¾‘', 'leads:edit', 0, 2, 3),
			('çº¿ç´¢åˆ é™¤', 'leads:delete', 0, 2, 4),
			('æ´»åŠ¨æŸ¥çœ‹', 'activities:query', 0, 2, 1)
		`).run();

			const leadsPermIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'leads:%' OR perm_key = 'activities:query'`).all();
			if (leadsPermIds.results && leadsPermIds.results.length > 0) {
				const values = leadsPermIds.results.map(p => `(${1}, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}
	},

	async v3_11DB(c) {
		// crm_organizations: organizations with parent/subsidiary, type, commercial terms
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_organizations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			parent_id INTEGER,
			name TEXT NOT NULL DEFAULT '',
			legal_name TEXT DEFAULT '',
			brand_name TEXT DEFAULT '',
			organization_type TEXT DEFAULT 'partner',
			website TEXT DEFAULT '',
			social_links TEXT DEFAULT '[]',
			address TEXT DEFAULT '',
			relationship_status TEXT DEFAULT 'active',
			commercial_terms TEXT DEFAULT '',
			assigned_to INTEGER,
			created_by INTEGER,
			updated_by INTEGER,
			version INTEGER DEFAULT 1 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_organizations_user ON crm_organizations(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_organizations_parent ON crm_organizations(parent_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_organizations_type ON crm_organizations(organization_type, is_del);`).run();

		// crm_contact_organizations: person <-> organization associations with roles
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_contact_organizations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			contact_id INTEGER NOT NULL,
			organization_id INTEGER NOT NULL,
			role TEXT DEFAULT '',
			is_primary INTEGER DEFAULT 0 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_contact_orgs_user ON crm_contact_organizations(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_contact_orgs_contact ON crm_contact_organizations(contact_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_contact_orgs_org ON crm_contact_organizations(organization_id, is_del);`).run();
		await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contact_orgs_unique ON crm_contact_organizations(contact_id, organization_id, is_del);`);

		// Opportunity extensions on crm_deals: deal_type, probability, next_step, loss_reason, win_reason
		for (const [table, column, definition] of [
			['crm_deals', 'deal_type', 'TEXT DEFAULT \'event_onboarding\''],
			['crm_deals', 'probability', 'INTEGER DEFAULT 0'],
			['crm_deals', 'next_step', 'TEXT DEFAULT \'\''],
			['crm_deals', 'loss_reason', 'TEXT DEFAULT \'\''],
			['crm_deals', 'win_reason', 'TEXT DEFAULT \'\'']
		]) {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
			} catch (error) {
				if (!error.message?.toLowerCase().includes('duplicate column')) {
					throw error;
				}
			}
		}

		// crm_events: external-event references (not XPass ticketing platform)
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			external_event_id TEXT DEFAULT '',
			name TEXT NOT NULL DEFAULT '',
			event_date TEXT,
			location TEXT DEFAULT '',
			organizer TEXT DEFAULT '',
			lifecycle TEXT DEFAULT 'planned',
			venue_partners TEXT DEFAULT '[]',
			sponsors TEXT DEFAULT '[]',
			relationship_notes TEXT DEFAULT '',
			related_opportunity_id INTEGER,
			created_by INTEGER,
			updated_by INTEGER,
			version INTEGER DEFAULT 1 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_events_user ON crm_events(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_events_external ON crm_events(external_event_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_events_date ON crm_events(event_date, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_events_opportunity ON crm_events(related_opportunity_id, is_del);`).run();

		// Organizations permission seed
		const {permTotal: orgPermTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'organizations:%'`).first();
		if (orgPermTotal === 0) {
			await c.env.db.prepare(`
			INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
			('ç»„ç»‡ç®¡ç†', NULL, 0, 1, 16),
			('ç»„ç»‡æŸ¥çœ‹', 'organizations:query', 0, 2, 1),
			('ç»„ç»‡æ·»åŠ ', 'organizations:add', 0, 2, 2),
			('ç»„ç»‡ç¼–è¾‘', 'organizations:edit', 0, 2, 3),
			('ç»„ç»‡åˆ é™¤', 'organizations:delete', 0, 2, 4),
			('æœºä¼šç®¡ç†', NULL, 0, 1, 17),
			('æœºä¼šæŸ¥çœ‹', 'opportunities:query', 0, 2, 1),
			('æœºä¼šæ·»åŠ ', 'opportunities:add', 0, 2, 2),
			('æœºä¼šç¼–è¾‘', 'opportunities:edit', 0, 2, 3),
			('æœºä¼šåˆ é™¤', 'opportunities:delete', 0, 2, 4),
			('äº‹ä»¶ç®¡ç†', NULL, 0, 1, 18),
			('äº‹ä»¶æŸ¥çœ‹', 'events:query', 0, 2, 1),
			('äº‹ä»¶æ·»åŠ ', 'events:add', 0, 2, 2),
			('äº‹ä»¶ç¼–è¾‘', 'events:edit', 0, 2, 3),
			('äº‹ä»¶åˆ é™¤', 'events:delete', 0, 2, 4)
		`).run();

			const orgPermIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'organizations:%' OR perm_key LIKE 'opportunities:%' OR perm_key LIKE 'events:%'`).all();
			if (orgPermIds.results && orgPermIds.results.length > 0) {
				const values = orgPermIds.results.map(p => `(${1}, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}
	},

	async v3_7DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE user ADD COLUMN signature TEXT NOT NULL DEFAULT '';`).run();
		} catch (error) {
			if (!error.message?.toLowerCase().includes('duplicate column')) {
				throw error;
			}
		}
	},

	async v3_6DB(c) {
		for (const [column, definition] of [
			['signature_image_key', 'TEXT'],
			['signature_text', "TEXT NOT NULL DEFAULT ''"]
		]) {
			try {
				await c.env.db.prepare(`ALTER TABLE account ADD COLUMN ${column} ${definition};`).run();
			} catch (error) {
				if (!error.message?.toLowerCase().includes('duplicate column')) {
					throw error;
				}
			}
		}
	},

	async v3_5DB(c) {
		for (const [column, definition] of [
			['mailbox_folder', "TEXT NOT NULL DEFAULT ''"],
			['category', "TEXT NOT NULL DEFAULT 'primary'"],
			['category_override', 'INTEGER NOT NULL DEFAULT 0'],
			['snoozed_until', 'TEXT']
		]) {
			try {
				await c.env.db.prepare(`ALTER TABLE email ADD COLUMN ${column} ${definition};`).run();
			} catch (error) {
				if (!error.message?.toLowerCase().includes('duplicate column')) {
					throw error;
				}
			}
		}

		await c.env.db.batch([
			c.env.db.prepare(`UPDATE email SET mailbox_folder = CASE WHEN is_del != 0 THEN 'trash' WHEN type = ${emailConst.type.SEND} THEN 'sent' ELSE 'inbox' END WHERE mailbox_folder = '';`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS mail_folder (
				folder_id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				name TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				UNIQUE(user_id, name)
			);`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS email_folder (
				email_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				folder_id INTEGER NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				PRIMARY KEY(email_id, folder_id)
			);`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS email_template (
				template_id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				name TEXT NOT NULL,
				subject TEXT NOT NULL DEFAULT '',
				content TEXT NOT NULL DEFAULT '',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				UNIQUE(user_id, name)
			);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_folder_user ON email_folder(user_id, folder_id, email_id);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_mailbox_folder ON email(user_id, mailbox_folder, email_id);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_category ON email(user_id, category, email_id);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_snoozed_until ON email(user_id, snoozed_until);`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_template_user ON email_template(user_id, template_id);`)
		]);
	},

	async v3_4DB(c) {
		for (const sql of [
			`ALTER TABLE user ADD COLUMN signature_image_key TEXT;`,
			`ALTER TABLE user ADD COLUMN signature_text TEXT NOT NULL DEFAULT '';`
		]) {
			try {
				await c.env.db.prepare(sql).run();
			} catch (error) {
				if (!error.message?.toLowerCase().includes('duplicate column')) {
					throw error;
				}
			}
		}

		try {
			await c.env.db.prepare(`ALTER TABLE email ADD COLUMN sender_email TEXT NOT NULL DEFAULT '';`).run();
		} catch (error) {
			if (!error.message?.toLowerCase().includes('duplicate column')) {
				throw error;
			}
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
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_url TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_status INTEGER NOT NULL DEFAULT 1;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_retry INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_secret TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
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
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
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
			console.warn(`è·³è¿‡ç´¢å¼•ï¼š${e.message}`);
		}
	},

	async v3_1DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN sync_delete INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
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
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_subject TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_content TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_from TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}

	},

	async v2_9DB(c) {
		try {
			await c.env.db.prepare(`UPDATE setting SET auto_refresh = 5 WHERE auto_refresh = 1;`).run();
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}
	},

	async v2_8DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE account ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`)
			]);
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}
	},

	async v2_7DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting RENAME COLUMN auto_refresh_time TO auto_refresh;`)
			]);
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}
	},

	async v2_6DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE account ADD COLUMN all_receive INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}
	},

	async v2_5DB(c) {

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN email_prefix_filter text NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE email ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`UPDATE email SET unread = 1;`)
			]);
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
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
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN min_email_prefix INTEGER NOT NULL DEFAULT 1;`).run();
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
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
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_text TEXT NOT NULL DEFAULT 'show';`).run();
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}

	},

	async v2DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN bucket TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN region TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN endpoint TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN s3_access_key TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN s3_secret_key TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`DELETE FROM perm WHERE perm_key = 'setting:clean'`)
			]);
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}
	},

	async v1_7DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN login_domain INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
		}
	},

	async v1_6DB(c) {

		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE setting ADD COLUMN reg_verify_count INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN add_verify_count INTEGER NOT NULL DEFAULT 1;`,
			`CREATE TABLE IF NOT EXISTS verify_record (
				vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
				ip TEXT NOT NULL DEFAULT '',
				count INTEGER NOT NULL DEFAULT 1,
				type INTEGER NOT NULL DEFAULT 0,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
			`ALTER TABLE setting ADD COLUMN notice_title TEXT NOT NULL DEFAULT 'XPass';`,
			`ALTER TABLE setting ADD COLUMN notice_content TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN notice_type TEXT NOT NULL DEFAULT 'none';`,
			`ALTER TABLE setting ADD COLUMN notice_duration INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN notice_offset INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN notice_position TEXT NOT NULL DEFAULT 'top-right';`,
			`ALTER TABLE setting ADD COLUMN notice_width INTEGER NOT NULL DEFAULT 340;`,
			`ALTER TABLE setting ADD COLUMN notice INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN no_recipient INTEGER NOT NULL DEFAULT 1;`,
			`UPDATE role SET avail_domain = '' WHERE role.avail_domain LIKE '@%';`,
			`CREATE INDEX IF NOT EXISTS idx_email_user_id_account_id ON email(user_id, account_id);`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`è·³è¿‡å­—æ®µï¼š${e.message}`);
			}
		});

		await Promise.all(promises);
		try {
			await c.env.db.batch([
				c.env.db.prepare(`DROP INDEX IF EXISTS idx_account_email`),
				c.env.db.prepare(`DROP INDEX IF EXISTS idx_user_email`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_nocase ON account (email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_nocase ON user (email COLLATE NOCASE)`)
			]);
		} catch (e) {
			console.warn(e.message)
		}

	},

	async v1_5DB(c) {
		await c.env.db.prepare(`UPDATE perm SET perm_key = 'all-email:query' WHERE perm_key = 'sys-email:query'`).run();
		await c.env.db.prepare(`UPDATE perm SET perm_key = 'all-email:delete' WHERE perm_key = 'sys-email:delete'`).run();
		try {
			await c.env.db.prepare(`ALTER TABLE role ADD COLUMN avail_domain TEXT NOT NULL DEFAULT ''`).run();
		} catch (e) {
			console.warn(`è·³è¿‡å­—æ®µæ·»åŠ ï¼š${e.message}`);
		}
	},

	async v1_4DB(c) {
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS reg_key (
				rege_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
				code TEXT NOT NULL COLLATE NOCASE DEFAULT '',
				count INTEGER NOT NULL DEFAULT 0,
				role_id INTEGER NOT NULL DEFAULT 0,
				user_id INTEGER NOT NULL DEFAULT 0,
				expire_time DATETIME,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

		// æ·»åŠ ä¸åŒºåˆ†å¤§å°å†™çš„å”¯ä¸€ç´¢å¼•
		try {
			await c.env.db.prepare(`
				CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_code ON reg_key(code COLLATE NOCASE)
			`).run();
		} catch (e) {
			console.warn(`è·³è¿‡åˆ›å»ºç´¢å¼•ï¼š${e.message}`);
		}


		try {
			await c.env.db.prepare(`
        INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
        (33,'æ³¨å†Œå¯†é’¥', NULL, 0, 1, 5.1),
        (34,'å¯†é’¥æŸ¥çœ‹', 'reg-key:query', 33, 2, 0),
        (35,'å¯†é’¥æ·»åŠ ', 'reg-key:add', 33, 2, 1),
        (36,'å¯†é’¥åˆ é™¤', 'reg-key:delete', 33, 2, 2)`).run();
		} catch (e) {
			console.warn(`è·³è¿‡æ•°æ®ï¼š${e.message}`);
		}

		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE setting ADD COLUMN reg_key INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE role ADD COLUMN ban_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE role ADD COLUMN ban_email_type INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE user ADD COLUMN reg_key_id INTEGER NOT NULL DEFAULT 0;`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`è·³è¿‡å­—æ®µæ·»åŠ ï¼š${e.message}`);
			}
		});

		await Promise.all(promises);

	},

	async v1_3_1DB(c) {
		await c.env.db.prepare(`UPDATE email SET name = SUBSTR(send_email, 1, INSTR(send_email, '@') - 1) WHERE (name IS NULL OR name = '') AND type = ${emailConst.type.RECEIVE}`).run();
	},

	async v1_3DB(c) {

		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE setting ADD COLUMN tg_bot_token TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN tg_chat_id TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN tg_bot_status INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN forward_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN forward_status INTEGER TIME NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN rule_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN rule_type INTEGER NOT NULL DEFAULT 0;`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`è·³è¿‡å­—æ®µæ·»åŠ ï¼š${e.message}`);
			}
		});

		await Promise.all(promises);

		const nameColumn = await c.env.db.prepare(`SELECT * FROM pragma_table_info('email') WHERE name = 'to_email' limit 1`).first();

		if (nameColumn) {
			return
		}

		const queryList = []

		queryList.push(c.env.db.prepare(`ALTER TABLE email ADD COLUMN to_email TEXT NOT NULL DEFAULT ''`));
		queryList.push(c.env.db.prepare(`ALTER TABLE email ADD COLUMN to_name TEXT NOT NULL DEFAULT ''`));
		queryList.push(c.env.db.prepare(`UPDATE email SET to_email = json_extract(recipient, '$[0].address'), to_name = json_extract(recipient, '$[0].name')`));

		await c.env.db.batch(queryList);

	},

	async v1_2DB(c){

		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE email ADD COLUMN recipient TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN cc TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN bcc TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN message_id TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE email ADD COLUMN in_reply_to TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE email ADD COLUMN relation TEXT NOT NULL DEFAULT '';`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`è·³è¿‡å­—æ®µæ·»åŠ ï¼š${e.message}`);
			}
		});

		await Promise.all(promises);

		await this.receiveEmailToRecipient(c);
		await this.initAccountName(c);

		try {
			await c.env.db.prepare(`
        INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
        (31,'åˆ†æžé¡µ', NULL, 0, 1, 2.1),
        (32,'æ•°æ®æŸ¥çœ‹', 'analysis:query', 31, 2, 1)`).run();
		} catch (e) {
			console.warn(`è·³è¿‡æ•°æ®ï¼š${e.message}`);
		}

	},

	async v1_1DB(c) {
		// æ·»åŠ å­—æ®µ
		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE email ADD COLUMN type INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE email ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE email ADD COLUMN resend_email_id TEXT;`,
			`ALTER TABLE email ADD COLUMN message TEXT;`,

			`ALTER TABLE setting ADD COLUMN resend_tokens TEXT NOT NULL DEFAULT '{}';`,
			`ALTER TABLE setting ADD COLUMN send INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN r2_domain TEXT;`,
			`ALTER TABLE setting ADD COLUMN site_key TEXT;`,
			`ALTER TABLE setting ADD COLUMN secret_key TEXT;`,
			`ALTER TABLE setting ADD COLUMN background TEXT;`,
			`ALTER TABLE setting ADD COLUMN login_opacity INTEGER NOT NULL DEFAULT 0.90;`,

			`ALTER TABLE user ADD COLUMN create_ip TEXT;`,
			`ALTER TABLE user ADD COLUMN active_ip TEXT;`,
			`ALTER TABLE user ADD COLUMN os TEXT;`,
			`ALTER TABLE user ADD COLUMN browser TEXT;`,
			`ALTER TABLE user ADD COLUMN device TEXT;`,
			`ALTER TABLE user ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE user ADD COLUMN send_count INTEGER NOT NULL DEFAULT 0;`,

			`ALTER TABLE attachments ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE attachments ADD COLUMN type INTEGER NOT NULL DEFAULT 0;`
		];

		const promises = ADD_COLUMN_SQL_LIST.map(async (sql) => {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`è·³è¿‡å­—æ®µæ·»åŠ ï¼š${e.message}`);
			}
		});

		await Promise.all(promises);

		// åˆ›å»º perm è¡¨å¹¶åˆå§‹åŒ–
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS perm (
        perm_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        perm_key TEXT,
        pid INTEGER NOT NULL DEFAULT 0,
        type INTEGER NOT NULL DEFAULT 2,
        sort INTEGER
      )
    `).run();

		const {permTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm`).first();

		if (permTotal === 0) {
			await c.env.db.prepare(`
        INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
        (1, 'é‚®ä»¶', NULL, 0, 0, 0),
        (2, 'é‚®ä»¶åˆ é™¤', 'email:delete', 1, 2, 1),
        (3, 'é‚®ä»¶å‘é€', 'email:send', 1, 2, 0),
        (4, 'ä¸ªäººè®¾ç½®', '', 0, 1, 2),
        (5, 'ç”¨æˆ·æ³¨é”€', 'my:delete', 4, 2, 0),
        (6, 'ç”¨æˆ·ä¿¡æ¯', NULL, 0, 1, 3),
        (7, 'ç”¨æˆ·æŸ¥çœ‹', 'user:query', 6, 2, 0),
        (8, 'å¯†ç ä¿®æ”¹', 'user:set-pwd', 6, 2, 2),
        (9, 'çŠ¶æ€ä¿®æ”¹', 'user:set-status', 6, 2, 3),
        (10, 'æƒé™ä¿®æ”¹', 'user:set-type', 6, 2, 4),
        (11, 'ç”¨æˆ·åˆ é™¤', 'user:delete', 6, 2, 7),
        (12, 'ç”¨æˆ·æ”¶è—', 'user:star', 6, 2, 5),
        (13, 'æƒé™æŽ§åˆ¶', '', 0, 1, 5),
        (14, 'èº«ä»½æŸ¥çœ‹', 'role:query', 13, 2, 0),
        (15, 'èº«ä»½ä¿®æ”¹', 'role:set', 13, 2, 1),
        (16, 'èº«ä»½åˆ é™¤', 'role:delete', 13, 2, 2),
        (17, 'ç³»ç»Ÿè®¾ç½®', '', 0, 1, 6),
        (18, 'è®¾ç½®æŸ¥çœ‹', 'setting:query', 17, 2, 0),
        (19, 'è®¾ç½®ä¿®æ”¹', 'setting:set', 17, 2, 1),
        (21, 'é‚®ç®±ä¾§æ ', '', 0, 0, 1),
        (22, 'é‚®ç®±æŸ¥çœ‹', 'account:query', 21, 2, 0),
        (23, 'é‚®ç®±æ·»åŠ ', 'account:add', 21, 2, 1),
        (24, 'é‚®ç®±åˆ é™¤', 'account:delete', 21, 2, 2),
        (25, 'ç”¨æˆ·æ·»åŠ ', 'user:add', 6, 2, 1),
        (26, 'å‘ä»¶é‡ç½®', 'user:reset-send', 6, 2, 6),
        (27, 'é‚®ä»¶åˆ—è¡¨', '', 0, 1, 4),
        (28, 'é‚®ä»¶æŸ¥çœ‹', 'all-email:query', 27, 2, 0),
        (29, 'é‚®ä»¶åˆ é™¤', 'all-email:delete', 27, 2, 0),
				(30, 'èº«ä»½æ·»åŠ ', 'role:add', 13, 2, -1)
      `).run();
		}

		await c.env.db.prepare(`UPDATE perm SET perm_key = 'setting:clean' WHERE perm_key = 'seting:clear'`).run();
		await c.env.db.prepare(`DELETE FROM perm WHERE perm_key = 'user:star'`).run();
		// åˆ›å»º role è¡¨å¹¶æ’å…¥é»˜è®¤èº«ä»½
		await c.env.db.prepare(`
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
        account_count INTEGER
      )
    `).run();

		const { roleCount } = await c.env.db.prepare(`SELECT COUNT(*) as roleCount FROM role`).first();
		if (roleCount === 0) {
			await c.env.db.prepare(`
        INSERT INTO role (
          role_id, name, key, create_time, sort, description, user_id, is_default, send_count, send_type, account_count
        ) VALUES (
          1, 'User', NULL, '0000-00-00 00:00:00', 0, 'Standard user access', 0, 1, NULL, 'ban', 10
        )
      `).run();
		}
		await c.env.db.prepare(`UPDATE role SET name = 'User', description = 'Standard user access' WHERE name = 'æ™®é€šç”¨æˆ·'`).run();

		// åˆ›å»º role_perm è¡¨å¹¶åˆå§‹åŒ–æ•°æ®
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS role_perm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER,
        perm_id INTEGER
      )
    `).run();

		const {rolePermCount} = await c.env.db.prepare(`SELECT COUNT(*) as rolePermCount FROM role_perm`).first();
		if (rolePermCount === 0) {
			await c.env.db.prepare(`
        INSERT INTO role_perm (id, role_id, perm_id) VALUES
          (100, 1, 2),
          (101, 1, 21),
          (102, 1, 22),
          (103, 1, 23),
          (104, 1, 24),
          (105, 1, 4),
          (106, 1, 5),
          (107, 1, 1),
          (108, 1, 3)
      `).run();
		}
	},

	async intDB(c) {
		// åˆå§‹åŒ–æ•°æ®åº“è¡¨ç»“æž„
		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS email (
			email_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
			send_email TEXT,
			name TEXT,
			account_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			subject TEXT,
			content TEXT,
			text TEXT,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS star (
			star_id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			email_id INTEGER NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
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
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS user (
			user_id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			type INTEGER DEFAULT 1 NOT NULL,
			password TEXT NOT NULL,
			salt TEXT NOT NULL,
			status INTEGER DEFAULT 0 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
			active_time DATETIME,
			signature_image_key TEXT,
			signature_text TEXT NOT NULL DEFAULT '',
			signature TEXT NOT NULL DEFAULT '',
			signature_settings TEXT NOT NULL DEFAULT '{}',
			is_del INTEGER DEFAULT 0 NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS account (
			account_id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			status INTEGER DEFAULT 0 NOT NULL,
			latest_email_time DATETIME,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
			user_id INTEGER NOT NULL,
			signature_image_key TEXT,
			signature_text TEXT NOT NULL DEFAULT '',
			signature TEXT NOT NULL DEFAULT '',
			signature_enabled INTEGER NOT NULL DEFAULT 1,
			signature_reply_enabled INTEGER NOT NULL DEFAULT 1,
			is_del INTEGER DEFAULT 0 NOT NULL
		  )
		`).run();

		await c.env.db.prepare(`
		  CREATE TABLE IF NOT EXISTS setting (
			register INTEGER NOT NULL,
			receive INTEGER NOT NULL,
			add_email INTEGER NOT NULL,
			many_email INTEGER NOT NULL,
			title TEXT NOT NULL,
			auto_refresh INTEGER NOT NULL,
			register_verify INTEGER NOT NULL,
			add_email_verify INTEGER NOT NULL
		  )
		`).run();

		try {
			await c.env.db.prepare(`
			  INSERT INTO setting (
				register, receive, add_email, many_email, title, auto_refresh, register_verify, add_email_verify
			  )
			  SELECT 0, 0, 0, 0, 'XPass', 0, 1, 1
			  WHERE NOT EXISTS (SELECT 1 FROM setting)
			`).run();
		} catch (e) {
			console.warn(e)
		}

	},

	async receiveEmailToRecipient(c) {

		const receiveEmailColumn = await c.env.db.prepare(`SELECT * FROM pragma_table_info('email') WHERE name = 'receive_email' limit 1`).first();

		if (!receiveEmailColumn) {
			return
		}

		const queryList = []
		const {results} = await c.env.db.prepare('SELECT receive_email,email_id FROM email').all();
		results.forEach(emailRow => {
			const recipient = {}
			recipient.address = emailRow.receive_email
			recipient.name = ''
			const recipientStr = JSON.stringify([recipient]);
			const sql = c.env.db.prepare('UPDATE email SET recipient = ? WHERE email_id = ?').bind(recipientStr,emailRow.email_id);
			queryList.push(sql)
		})

		queryList.push(c.env.db.prepare("ALTER TABLE email DROP COLUMN receive_email"));

		await c.env.db.batch(queryList);
	},


	async initAccountName(c) {

		const nameColumn = await c.env.db.prepare(`SELECT * FROM pragma_table_info('account') WHERE name = 'name' limit 1`).first();

		if (nameColumn) {
			return
		}

		const queryList = []

		queryList.push(c.env.db.prepare(`ALTER TABLE account ADD COLUMN name TEXT NOT NULL DEFAULT ''`));

		const {results} = await c.env.db.prepare(`SELECT account_id, email FROM account`).all();

		results.forEach(accountRow => {
			const name = emailUtils.getName(accountRow.email);
			const sql = c.env.db.prepare('UPDATE account SET name = ? WHERE account_id = ?').bind(name,accountRow.account_id);
			queryList.push(sql)
		})

		await c.env.db.batch(queryList);
	},

	async v3_12DB(c) {
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS crm_audit_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			email TEXT NOT NULL DEFAULT '',
			method TEXT NOT NULL DEFAULT '',
			path TEXT NOT NULL DEFAULT '',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_audit_log_user ON crm_audit_log(user_id, create_time);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_audit_log_path ON crm_audit_log(path, create_time);`).run();
	},

	async v3_13DB(c) {
		// notifications: shared in-app notification feed
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS notifications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			actor_user_id INTEGER,
			type TEXT NOT NULL DEFAULT 'info',
			title TEXT NOT NULL DEFAULT '',
			body TEXT DEFAULT '',
			link TEXT DEFAULT '',
			is_read INTEGER DEFAULT 0 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user_id, create_time);`).run();

		// support_requests: standalone task/request core (distinct from CRM-linked crm_tasks)
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS support_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			assignee_id INTEGER,
			title TEXT NOT NULL DEFAULT '',
			description TEXT DEFAULT '',
			status TEXT DEFAULT 'open',
			priority TEXT DEFAULT 'normal',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_support_requests_user ON support_requests(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_support_requests_assignee ON support_requests(assignee_id, is_del);`).run();

		// Notification permission seed
		const {permTotal: notifPermTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'notifications:%'`).first();
		if (notifPermTotal === 0) {
			await c.env.db.prepare(`
			INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
			('é€šçŸ¥ç®¡ç†', NULL, 0, 1, 16),
			('é€šçŸ¥æŸ¥çœ‹', 'notifications:query', 0, 2, 1),
			('é€šçŸ¥æ·»åŠ ', 'notifications:add', 0, 2, 2),
			('é€šçŸ¥åˆ é™¤', 'notifications:delete', 0, 2, 3)
		`).run();

			const notifPermIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'notifications:%'`).all();
			if (notifPermIds.results && notifPermIds.results.length > 0) {
				const values = notifPermIds.results.map(p => `(${1}, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}

		// Support request permission seed
		const {permTotal: supportPermTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'support:%'`).first();
		if (supportPermTotal === 0) {
			await c.env.db.prepare(`
			INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
			('æ”¯æŒè¯·æ±‚ç®¡ç†', NULL, 0, 1, 17),
			('æ”¯æŒæŸ¥çœ‹', 'support:query', 0, 2, 1),
			('æ”¯æŒæ·»åŠ ', 'support:add', 0, 2, 2),
			('æ”¯æŒç¼–è¾‘', 'support:edit', 0, 2, 3),
			('æ”¯æŒåˆ é™¤', 'support:delete', 0, 2, 4)
		`).run();

			const supportPermIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'support:%'`).all();
			if (supportPermIds.results && supportPermIds.results.length > 0) {
				const values = supportPermIds.results.map(p => `(${1}, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}
	},

	async v3_14DB(c) {
		// projects: plans, work, and delivery
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS projects (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			description TEXT DEFAULT '',
			status TEXT DEFAULT 'active',
			priority TEXT DEFAULT 'normal',
			due_date TEXT,
			owner_id INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, is_del);`).run();

		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS project_members (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			role TEXT DEFAULT 'member',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id, is_del);`).run();

		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS project_tasks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			description TEXT DEFAULT '',
			status TEXT DEFAULT 'todo',
			priority TEXT DEFAULT 'normal',
			due_date TEXT,
			assignee_id INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_project_tasks_user ON project_tasks(user_id, is_del);`).run();

		// calendar: schedules and events
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS calendar_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			description TEXT DEFAULT '',
			start_time TEXT,
			end_time TEXT,
			all_day INTEGER DEFAULT 0 NOT NULL,
			location TEXT DEFAULT '',
			status TEXT DEFAULT 'scheduled',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_calendar_events_time ON calendar_events(start_time, end_time, is_del);`).run();

		// notes: quick notes and documents
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS notes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			folder_id INTEGER,
			title TEXT NOT NULL DEFAULT '',
			content TEXT DEFAULT '',
			is_pinned INTEGER DEFAULT 0 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id, is_del);`).run();

		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS note_folders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			parent_id INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_note_folders_user ON note_folders(user_id, is_del);`).run();

		// people: people and organization directory
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS people (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			email TEXT,
			phone TEXT,
			role TEXT DEFAULT '',
			department TEXT DEFAULT '',
			manager_id INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_people_user ON people(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_people_manager ON people(manager_id, is_del);`).run();

		// Permission seeds for Gate 3 modules
		const modulePerms = [
			{group: 'projects', keys: ['projects:query', 'projects:add', 'projects:edit', 'projects:delete']},
			{group: 'calendar', keys: ['calendar:query', 'calendar:add', 'calendar:edit', 'calendar:delete']},
			{group: 'notes', keys: ['notes:query', 'notes:add', 'notes:edit', 'notes:delete']},
			{group: 'people', keys: ['people:query', 'people:add', 'people:edit', 'people:delete']}
		];

		for (const {group, keys} of modulePerms) {
			const {permTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE '${group}:%'`).first();
			if (permTotal === 0) {
				const cnNames = {'projects': 'é¡¹ç›®ç®¡ç†', 'calendar': 'æ—¥åŽ†ç®¡ç†', 'notes': 'ç¬”è®°ç®¡ç†', 'people': 'äººå‘˜ç®¡ç†'};
				const values = [];
				const permIds = [];
				values.push(`('${cnNames[group]}', NULL, 0, 1, 18)`);
				const suffixes = ['query', 'add', 'edit', 'delete'];
				suffixes.forEach((s, i) => {
					values.push(`('${cnNames[group]}${s}', '${group}:${s}', 0, 2, ${i + 1})`);
				});
				await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ${values.join(',')}`).run();

				const idRes = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE '${group}:%'`).all();
				if (idRes.results && idRes.results.length > 0) {
					const roleValues = idRes.results.map(p => `(${1}, ${p.perm_id})`).join(',');
					await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${roleValues}`).run();
				}
			}
		}
	},

	async v3_15DB(c) {
		// document_folders: shared company knowledge folders
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS document_folders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			parent_id INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_document_folders_user ON document_folders(user_id, is_del);`).run();

		// documents: files stored in R2/KV/S3 with folder association
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS documents (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			folder_id INTEGER,
			name TEXT NOT NULL DEFAULT '',
			storage_key TEXT NOT NULL DEFAULT '',
			content_type TEXT DEFAULT '',
			size_bytes INTEGER DEFAULT 0,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, is_del);`).run();

		// Documents permission seed
		const {permTotal: docPermTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'documents:%'`).first();
		if (docPermTotal === 0) {
			await c.env.db.prepare(`
			INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
			('æ–‡æ¡£ç®¡ç†', NULL, 0, 1, 19),
			('æ–‡æ¡£æŸ¥çœ‹', 'documents:query', 0, 2, 1),
			('æ–‡æ¡£ä¸Šä¼ ', 'documents:add', 0, 2, 2),
			('æ–‡æ¡£ç¼–è¾‘', 'documents:edit', 0, 2, 3),
			('æ–‡æ¡£åˆ é™¤', 'documents:delete', 0, 2, 4)
		`).run();

			const docPermIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'documents:%'`).all();
			if (docPermIds.results && docPermIds.results.length > 0) {
				const values = docPermIds.results.map(p => `(${1}, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}
	},

	async v3_16DB(c) {
		// finance_accounts: cash/bank accounts, KES only
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS finance_accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			account_type TEXT DEFAULT 'cash',
			currency TEXT DEFAULT 'KES',
			balance_cents INTEGER DEFAULT 0,
			status TEXT DEFAULT 'active',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_accounts_user ON finance_accounts(user_id, is_del);`).run();

		// finance_transactions: integer minor units (_cents), 0% organizer / 5% attendee service fee
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS finance_transactions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			account_id INTEGER,
			type TEXT DEFAULT 'income',
			amount_cents INTEGER NOT NULL DEFAULT 0,
			currency TEXT DEFAULT 'KES',
			fee_cents INTEGER DEFAULT 0,
			description TEXT DEFAULT '',
			status TEXT DEFAULT 'pending',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_transactions_user ON finance_transactions(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_transactions_status ON finance_transactions(status, is_del);`).run();

		// finance_invoices: billing with approval workflow
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS finance_invoices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			invoice_number TEXT DEFAULT '',
			client_name TEXT DEFAULT '',
			amount_cents INTEGER NOT NULL DEFAULT 0,
			currency TEXT DEFAULT 'KES',
			status TEXT DEFAULT 'draft',
			approved_by INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_invoices_user ON finance_invoices(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_invoices_status ON finance_invoices(status, is_del);`).run();

		// Finance permission seed â€” three-way split (view / edit / approve)
		const {permTotal: finPermTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'finance:%'`).first();
		if (finPermTotal === 0) {
			await c.env.db.prepare(`
			INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
			('è´¢åŠ¡ç®¡ç†', NULL, 0, 1, 20),
			('è´¢åŠ¡æŸ¥çœ‹', 'finance:view', 0, 2, 1),
			('è´¢åŠ¡ç¼–è¾‘', 'finance:edit', 0, 2, 2),
			('è´¢åŠ¡å®¡æ‰¹', 'finance:approve', 0, 2, 3)
		`).run();

			const finPermIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'finance:%'`).all();
			if (finPermIds.results && finPermIds.results.length > 0) {
				const values = finPermIds.results.map(p => `(${1}, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}
	},

	async v3_17DB(c) {
		// whatsapp_conversations: one official XPass WhatsApp business number
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_conversations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			contact_name TEXT DEFAULT '',
			contact_phone TEXT DEFAULT '',
			last_message TEXT DEFAULT '',
			last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			unread_count INTEGER DEFAULT 0,
			status TEXT DEFAULT 'open',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_user ON whatsapp_conversations(user_id, is_del);`).run();

		// whatsapp_messages: human-send enforcement â€” AI suggests, human must approve
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			conversation_id INTEGER NOT NULL,
			direction TEXT DEFAULT 'inbound',
			body TEXT DEFAULT '',
			ai_suggested INTEGER DEFAULT 0,
			human_approved INTEGER DEFAULT 0,
			sent_at DATETIME,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv ON whatsapp_messages(conversation_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user ON whatsapp_messages(user_id, is_del);`).run();

		// WhatsApp permission seed
		const {permTotal: waPermTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'whatsapp:%'`).first();
		if (waPermTotal === 0) {
			await c.env.db.prepare(`
			INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
			('WhatsApp', NULL, 0, 1, 21),
			('WhatsAppæŸ¥çœ‹', 'whatsapp:query', 0, 2, 1),
			('WhatsAppå‘é€', 'whatsapp:send', 0, 2, 2)
		`).run();

			const waPermIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'whatsapp:%'`).all();
			if (waPermIds.results && waPermIds.results.length > 0) {
				const values = waPermIds.results.map(p => `(${1}, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}
	},

	async v3_18DB(c) {
		// automation_rules: trigger -> action model
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS automation_rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			trigger_type TEXT DEFAULT 'manual',
			trigger_config TEXT DEFAULT '{}',
			action_type TEXT DEFAULT 'notify',
			action_config TEXT DEFAULT '{}',
			enabled INTEGER DEFAULT 1 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id, is_del);`).run();

		// integration_registry: third-party integrations with credential metadata (secrets never hardcoded)
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS integration_registry (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			provider TEXT NOT NULL DEFAULT '',
			name TEXT NOT NULL DEFAULT '',
			status TEXT DEFAULT 'disabled',
			credential_meta TEXT DEFAULT '{}',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			is_del INTEGER DEFAULT 0 NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_integration_registry_user ON integration_registry(user_id, is_del);`).run();

		// ai_suggestions: AI suggestion log (never auto-executes)
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS ai_suggestions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			context_type TEXT DEFAULT 'generic',
			context_id INTEGER,
			suggestion TEXT DEFAULT '',
			accepted INTEGER DEFAULT 0,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_suggestions_user ON ai_suggestions(user_id, create_time);`).run();

		// Permission seeds for Gate 8 modules
		const modulePerms = [
			{group: 'automations', name: 'è‡ªåŠ¨åŒ–ç®¡ç†', sort: 22, keys: ['automations:query', 'automations:add', 'automations:edit', 'automations:delete']},
			{group: 'integrations', name: 'é›†æˆç®¡ç†', sort: 23, keys: ['integrations:query', 'integrations:add', 'integrations:edit']},
			{group: 'ai', name: 'AI åŠ©æ‰‹', sort: 24, keys: ['ai:use']}
		];

		for (const {group, name, sort, keys} of modulePerms) {
			const {permTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE '${group}:%'`).first();
			if (permTotal === 0) {
				const suffixes = keys.map(k => k.split(':')[1]);
				const values = [`('${name}', NULL, 0, 1, ${sort})`];
				suffixes.forEach((s, i) => values.push(`('${name}${s}', '${group}:${s}', 0, 2, ${i + 1})`));
				await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ${values.join(',')}`).run();

				const idRes = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE '${group}:%'`).all();
				if (idRes.results && idRes.results.length > 0) {
					const roleValues = idRes.results.map(p => `(${1}, ${p.perm_id})`).join(',');
					await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${roleValues}`).run();
				}
			}
		}
	},
async v3_19DB(c) {
		// dashboard_preferences: per-user personal workspace layout (versioned, server-persisted)
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS dashboard_preferences (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			dashboard_version INTEGER NOT NULL DEFAULT 1,
			layout TEXT NOT NULL DEFAULT '[]',
			density TEXT NOT NULL DEFAULT 'comfortable',
			onboarded INTEGER NOT NULL DEFAULT 0,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			updated_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			UNIQUE(user_id)
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_dashboard_preferences_user ON dashboard_preferences(user_id);`).run();
	},
	async v3_20DB(c) {
		// Gate 5 event<->calendar sync: bidirectional link columns.
		const evCols = await c.env.db.prepare(`SELECT name FROM pragma_table_info('crm_events')`).all();
		if (!(evCols.results || []).some(r => r.name === 'calendar_event_id')) {
			await c.env.db.prepare(`ALTER TABLE crm_events ADD COLUMN calendar_event_id INTEGER DEFAULT 0`).run();
		}
		const calCols = await c.env.db.prepare(`SELECT name FROM pragma_table_info('calendar_events')`).all();
		if (!(calCols.results || []).some(r => r.name === 'crm_event_id')) {
			await c.env.db.prepare(`ALTER TABLE calendar_events ADD COLUMN crm_event_id INTEGER DEFAULT 0`).run();
		}
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_events_calendar ON crm_events(calendar_event_id);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_calendar_events_crm ON calendar_events(crm_event_id);`).run();
	},
	async v3_21DB(c) {
		// Finance party model: organizer (0% commission) vs attendee (5% service fee).
		const cols = await c.env.db.prepare(`SELECT name FROM pragma_table_info('finance_transactions')`).all();
		if (!(cols.results || []).some(r => r.name === 'party')) {
			await c.env.db.prepare(`ALTER TABLE finance_transactions ADD COLUMN party TEXT DEFAULT 'attendee'`).run();
		}
	},
	async v3_22DB(c) {
		// Unified approvals + internal requests + personal note reminders.
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS approvals (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			category TEXT NOT NULL DEFAULT 'general',
			title TEXT NOT NULL DEFAULT '',
			description TEXT DEFAULT '',
			approver_id INTEGER,
			approver_group TEXT DEFAULT '',
			source_module TEXT DEFAULT '',
			source_type TEXT DEFAULT '',
			source_id INTEGER,
			priority TEXT DEFAULT 'normal',
			due_at TEXT,
			status TEXT DEFAULT 'pending',
			submit_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			decision_time DATETIME,
			decided_by INTEGER,
			decision_comment TEXT DEFAULT '',
			is_del INTEGER DEFAULT 0 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_approvals_user ON approvals(user_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_approvals_assignee ON approvals(approver_id, status, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_approvals_source ON approvals(source_module, source_type, source_id);`).run();

		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS approval_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			approval_id INTEGER NOT NULL,
			actor_id INTEGER,
			action TEXT NOT NULL DEFAULT '',
			from_status TEXT DEFAULT '',
			to_status TEXT DEFAULT '',
			comment TEXT DEFAULT '',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_approval_history_approval ON approval_history(approval_id);`).run();

		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS internal_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sender_id INTEGER NOT NULL,
			recipient_id INTEGER,
			category TEXT NOT NULL DEFAULT 'general',
			title TEXT NOT NULL DEFAULT '',
			description TEXT DEFAULT '',
			priority TEXT DEFAULT 'normal',
			due_date TEXT,
			related_type TEXT DEFAULT '',
			related_id INTEGER,
			status TEXT DEFAULT 'pending',
			is_del INTEGER DEFAULT 0 NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_internal_requests_sender ON internal_requests(sender_id, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_internal_requests_recipient ON internal_requests(recipient_id, status, is_del);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_internal_requests_status ON internal_requests(status, is_del);`).run();

		// 'kind' distinguishes action requests from approval requests.
		const reqCols = await c.env.db.prepare(`SELECT name FROM pragma_table_info('internal_requests')`).all();
		if (!(reqCols.results || []).some(r => r.name === 'kind')) {
			await c.env.db.prepare(`ALTER TABLE internal_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'action'`).run();
		}

		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS internal_request_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			request_id INTEGER NOT NULL,
			actor_id INTEGER,
			action TEXT NOT NULL DEFAULT '',
			from_status TEXT DEFAULT '',
			to_status TEXT DEFAULT '',
			comment TEXT DEFAULT '',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_internal_request_events_request ON internal_request_events(request_id);`).run();

		// Personal note enrichment.
		const noteCols = await c.env.db.prepare(`SELECT name FROM pragma_table_info('notes')`).all();
		const noteNames = (noteCols.results || []).map(r => r.name);
		if (!noteNames.includes('priority')) await c.env.db.prepare(`ALTER TABLE notes ADD COLUMN priority TEXT DEFAULT 'normal'`).run();
		if (!noteNames.includes('reminder_at')) await c.env.db.prepare(`ALTER TABLE notes ADD COLUMN reminder_at TEXT`).run();
		if (!noteNames.includes('reminder_sent')) await c.env.db.prepare(`ALTER TABLE notes ADD COLUMN reminder_sent INTEGER DEFAULT 0`).run();
		if (!noteNames.includes('labels')) await c.env.db.prepare(`ALTER TABLE notes ADD COLUMN labels TEXT DEFAULT '[]'`).run();
		if (!noteNames.includes('related_type')) await c.env.db.prepare(`ALTER TABLE notes ADD COLUMN related_type TEXT DEFAULT ''`).run();
		if (!noteNames.includes('related_id')) await c.env.db.prepare(`ALTER TABLE notes ADD COLUMN related_id INTEGER`).run();

		// Notification idempotency key.
		const notifCols = await c.env.db.prepare(`SELECT name FROM pragma_table_info('notifications')`).all();
		if (!(notifCols.results || []).some(r => r.name === 'event_key')) {
			await c.env.db.prepare(`ALTER TABLE notifications ADD COLUMN event_key TEXT DEFAULT ''`).run();
		}
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_notifications_event_key ON notifications(event_key);`).run();

		// Approvals permission seed (role 1 = administrator gets all).
		const {permTotal: apTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'approvals:%'`).first();
		if (apTotal === 0) {
			await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
				('å®¡æ‰¹ç®¡ç†', NULL, 0, 1, 30),
				('å®¡æ‰¹æŸ¥çœ‹', 'approvals:query', 0, 2, 1),
				('å®¡æ‰¹æäº¤', 'approvals:add', 0, 2, 2),
				('å®¡æ‰¹å¤„ç†', 'approvals:approve', 0, 2, 3),
				('å®¡æ‰¹ç¼–è¾‘', 'approvals:edit', 0, 2, 4),
				('å®¡æ‰¹åˆ é™¤', 'approvals:delete', 0, 2, 5)
			`).run();
			const apIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'approvals:%'`).all();
			if (apIds.results && apIds.results.length > 0) {
				const values = apIds.results.map(p => `(1, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}

		// Internal requests permission seed.
		const {permTotal: rqTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm WHERE perm_key LIKE 'requests:%'`).first();
		if (rqTotal === 0) {
			await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES
				('å†…éƒ¨è¯·æ±‚ç®¡ç†', NULL, 0, 1, 31),
				('å†…éƒ¨è¯·æ±‚æŸ¥çœ‹', 'requests:query', 0, 2, 1),
				('å†…éƒ¨è¯·æ±‚åˆ›å»º', 'requests:add', 0, 2, 2),
				('å†…éƒ¨è¯·æ±‚å¤„ç†', 'requests:act', 0, 2, 3),
				('å†…éƒ¨è¯·æ±‚åˆ é™¤', 'requests:delete', 0, 2, 4)
			`).run();
			const rqIds = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key LIKE 'requests:%'`).all();
			if (rqIds.results && rqIds.results.length > 0) {
				const values = rqIds.results.map(p => `(1, ${p.perm_id})`).join(',');
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES ${values}`).run();
			}
		}
	},

	async v3_23DB(c) {
		// Role-based access: seed real company roles and grant them explicit perms.
		// Existing role 1 ("User") is left untouched.
		const common = [
			'notifications:query', 'notifications:add',
			'notes:query', 'notes:add', 'notes:edit', 'notes:delete',
			'calendar:query', 'calendar:add', 'calendar:edit', 'calendar:delete',
			'people:query',
			'requests:query', 'requests:add', 'requests:act',
			'approvals:query', 'approvals:add'
		];
		const roles = [
			{name: 'Administrator', description: 'Full administrative access', perms: null},
			{name: 'Finance Manager', description: 'Finance operations, approvals and confidential records', perms: [...common, 'finance:view', 'finance:edit', 'finance:approve', 'approvals:approve', 'approvals:edit', 'documents:query', 'documents:add', 'documents:edit', 'activities:query', 'analysis:query']},
			{name: 'Finance Viewer', description: 'Read-only access to authorized finance records', perms: [...common, 'finance:view', 'analysis:query']},
			{name: 'Support Agent', description: 'Support conversations, CRM contacts and assigned work', perms: [...common, 'support:query', 'support:add', 'support:edit', 'support:delete', 'whatsapp:query', 'whatsapp:send', 'contacts:query', 'contacts:edit', 'companies:query', 'deals:query', 'activities:query', 'activities:add', 'activities:edit', 'people:add', 'people:edit']},
			{name: 'Growth', description: 'Leads, opportunities and pipeline management', perms: [...common, 'leads:query', 'leads:add', 'leads:edit', 'leads:delete', 'deals:query', 'deals:add', 'deals:edit', 'deals:delete', 'contacts:query', 'contacts:add', 'contacts:edit', 'companies:query', 'companies:add', 'companies:edit', 'organizations:query', 'organizations:add', 'organizations:edit', 'pipelines:query', 'opportunities:query', 'activities:query', 'activities:add', 'activities:edit', 'tasks:query', 'tasks:add', 'tasks:edit', 'people:add', 'people:edit', 'analysis:query']},
			{name: 'Engineering', description: 'Projects, tasks and assigned engineering work', perms: [...common, 'projects:query', 'projects:add', 'projects:edit', 'tasks:query', 'tasks:add', 'tasks:edit', 'documents:query', 'people:add', 'people:edit']}
		];

		let sort = 10;
		for (const r of roles) {
			const existing = await c.env.db.prepare(`SELECT role_id FROM role WHERE name = ?`).bind(r.name).first();
			let roleId;
			if (existing) {
				roleId = existing.role_id;
			} else {
				const {meta} = await c.env.db.prepare(`INSERT INTO role (name, description, is_default, sort) VALUES (?, ?, 0, ?)`).bind(r.name, r.description, sort).run();
				roleId = meta.last_row_id;
			}
			sort += 10;

			let permKeys = r.perms;
			if (permKeys === null) {
				const all = await c.env.db.prepare(`SELECT DISTINCT perm_key FROM perm WHERE perm_key IS NOT NULL AND perm_key <> ''`).all();
				permKeys = all.results.map(x => x.perm_key);
			}

			await c.env.db.prepare(`DELETE FROM role_perm WHERE role_id = ?`).bind(roleId).run();
			for (const key of permKeys) {
				const row = await c.env.db.prepare(`SELECT MIN(perm_id) as pid FROM perm WHERE perm_key = ?`).bind(key).first();
				if (row?.pid) {
					await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)`).bind(roleId, row.pid).run();
				}
			}
		}

		// Per-user overrides applied on top of role perms (grant/deny).
		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS user_perm_override (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			perm_key TEXT NOT NULL,
			effect TEXT NOT NULL DEFAULT 'allow',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, perm_key)
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_perm_override_user ON user_perm_override(user_id)`).run();
	},

	async v3_24DB(c) {
		// Gate 3 â€” two calendars.
		// Calendar A (personal/team): extend calendar_events with visibility,
		// participants, timezone, reminders and related records.
		const calCols = await c.env.db.prepare(`SELECT name FROM pragma_table_info('calendar_events')`).all();
		const calNames = (calCols.results || []).map(r => r.name);
		const addCal = async (col, def) => {
			if (!calNames.includes(col)) {
				await c.env.db.prepare(`ALTER TABLE calendar_events ADD COLUMN ${col} ${def}`).run();
			}
		};
		await addCal('timezone', `TEXT DEFAULT 'UTC'`);
		await addCal('visibility', `TEXT DEFAULT 'private'`);
		await addCal('organizer_id', `INTEGER`);
		await addCal('related_type', `TEXT DEFAULT ''`);
		await addCal('related_id', `INTEGER`);
		await addCal('reminder_at', `TEXT`);
		await addCal('reminder_sent', `INTEGER DEFAULT 0`);
		await addCal('source', `TEXT DEFAULT 'personal'`);

		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS calendar_event_participants (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			response TEXT DEFAULT 'invited',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(event_id, user_id)
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_cal_participants_event ON calendar_event_participants(event_id)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_cal_participants_user ON calendar_event_participants(user_id, response)`).run();

		await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS calendar_event_activity (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id INTEGER NOT NULL,
			user_id INTEGER,
			action TEXT DEFAULT '',
			detail TEXT DEFAULT '',
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP
		)`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_cal_activity_event ON calendar_event_activity(event_id)`).run();

		// Calendar B (industry / event operations): enrich crm_events.
		const evCols = await c.env.db.prepare(`SELECT name FROM pragma_table_info('crm_events')`).all();
		const evNames = (evCols.results || []).map(r => r.name);
		const addEv = async (col, def) => {
			if (!evNames.includes(col)) {
				await c.env.db.prepare(`ALTER TABLE crm_events ADD COLUMN ${col} ${def}`).run();
			}
		};
		await addEv('category', `TEXT DEFAULT ''`);
		await addEv('venue', `TEXT DEFAULT ''`);
		await addEv('start_time', `TEXT`);
		await addEv('end_time', `TEXT`);
		await addEv('description', `TEXT DEFAULT ''`);
		await addEv('source', `TEXT DEFAULT 'manual'`);
		await addEv('source_url', `TEXT DEFAULT ''`);
		await addEv('status', `TEXT DEFAULT 'planned'`);
		await addEv('assigned_to', `INTEGER`);
		await addEv('verification_status', `TEXT DEFAULT 'unverified'`);
		await addEv('last_checked_at', `TEXT`);
		await addEv('confidence', `TEXT DEFAULT ''`);
		await addEv('ai_suggested', `INTEGER DEFAULT 0`);
	},

	async v3_25DB(c) {
		// CRM canonical accounts: crm_organizations is the single account
		// concept. Backfill any company that has no matching organization so
		// no legacy record is lost. Idempotent and non-destructive.
		await c.env.db.prepare(`
			INSERT INTO crm_organizations (
				user_id, parent_id, name, legal_name, brand_name, organization_type,
				website, social_links, address, relationship_status, commercial_terms,
				assigned_to, created_by, updated_by, version, create_time, update_time, is_del
			)
			SELECT
				co.user_id, NULL, co.name, '', '', 'other',
				COALESCE(co.website, ''), '', COALESCE(co.address, ''),
				'new', '', co.assigned_to, co.user_id, co.user_id, 1,
				COALESCE(co.create_time, CURRENT_TIMESTAMP),
				COALESCE(co.update_time, CURRENT_TIMESTAMP), 0
			FROM crm_companies co
			WHERE COALESCE(co.is_del, 0) = 0
				AND NOT EXISTS (
					SELECT 1 FROM crm_organizations o
					WHERE COALESCE(o.is_del, 0) = 0
						AND o.user_id = co.user_id
						AND lower(COALESCE(o.name, '')) = lower(COALESCE(co.name, ''))
				)
		`).run();
	},
	async v3_30DB(c) {
		// Assignment foundation for CRM. assignee_id is the person currently
		// responsible for the work; user_id stays "created by". Nullable and
		// additive so every existing record keeps working.
		const addColumn = async (table, column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};

		await addColumn('crm_contacts', 'assignee_id', 'INTEGER');
		await addColumn('crm_leads', 'assignee_id', 'INTEGER');

		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_contacts_assignee ON crm_contacts(assignee_id);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_leads_assignee ON crm_leads(assignee_id);`).run();

		// Backfill: a record with no assignee is treated as assigned to its
		// creator, so "Assigned to me" keeps working for historical rows without
		// rewriting any data.
		await c.env.db.prepare(`UPDATE crm_contacts SET assignee_id = user_id WHERE assignee_id IS NULL;`).run();
		await c.env.db.prepare(`UPDATE crm_leads SET assignee_id = user_id WHERE assignee_id IS NULL;`).run();

		// Assignment is a management action, deliberately separate from edit:
		// lead:view must not imply lead:assign. Module parents have no perm_key of
		// their own, so resolve the parent through an existing child permission.
		const addPerm = async (siblingKey, permKey, name, sort) => {
			const sibling = await c.env.db.prepare(`SELECT pid FROM perm WHERE perm_key = ? LIMIT 1`).bind(siblingKey).first();
			if (!sibling) return;
			const existing = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ? LIMIT 1`).bind(permKey).first();
			if (existing) return;
			await c.env.db.prepare(
				`INSERT INTO perm (pid, name, perm_key, type, sort) VALUES (?, ?, ?, 2, ?)`
			).bind(sibling.pid, name, permKey, sort).run();
		};

		await addPerm('contacts:query', 'contacts:assign', 'åˆ†é…è”ç³»äºº', 3);
		await addPerm('leads:query', 'leads:assign', 'åˆ†é…çº¿ç´¢', 3);

		// The seed has accumulated duplicate permission rows. Collapse them to the
		// lowest perm_id and move any role grants across first so nothing is lost.
		const dupes = await c.env.db.prepare(`
			SELECT perm_key, MIN(perm_id) AS keep_id, GROUP_CONCAT(perm_id) AS all_ids, COUNT(*) AS n
			FROM perm
			WHERE perm_key IS NOT NULL AND perm_key <> ''
			GROUP BY perm_key
			HAVING COUNT(*) > 1
		`).all();

		for (const row of dupes.results || []) {
			const ids = String(row.all_ids).split(',').map(Number).filter(id => id !== row.keep_id);
			if (!ids.length) continue;
			const placeholders = ids.map(() => '?').join(',');
			await c.env.db.prepare(
				`UPDATE OR IGNORE role_perm SET perm_id = ? WHERE perm_id IN (${placeholders})`
			).bind(row.keep_id, ...ids).run();
			await c.env.db.prepare(`DELETE FROM role_perm WHERE perm_id IN (${placeholders})`).bind(...ids).run();
			await c.env.db.prepare(`DELETE FROM perm WHERE perm_id IN (${placeholders})`).bind(...ids).run();
		}

		// role_perm can hold the same (role, permission) pair more than once after
		// the remap above; keep one row per pair.
		await c.env.db.prepare(`
			DELETE FROM role_perm WHERE rowid NOT IN (
				SELECT MIN(rowid) FROM role_perm GROUP BY role_id, perm_id
			)
		`).run();
	},

	async v3_32DB(c) {
		// Requests become the single internal workflow. 'type' describes what kind
		// of work this is; 'kind' stays as the coarse action/approval flag that the
		// existing transition rules use.
		const addColumn = async (table, column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};

		await addColumn('internal_requests', 'type', "TEXT NOT NULL DEFAULT 'action'");
		await addColumn('internal_requests', 'team_id', 'INTEGER');
		await addColumn('internal_requests', 'attachments', "TEXT NOT NULL DEFAULT '[]'");

		// Existing rows are action or approval requests; keep that meaning.
		await c.env.db.prepare(
			`UPDATE internal_requests SET type = CASE WHEN kind = 'approval' THEN 'approval' ELSE 'action' END WHERE type IS NULL OR type = ''`
		).run();

		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_internal_requests_type ON internal_requests(type, status, is_del);`).run();
	},

	async v3_33DB(c) {
		// Shared company mailboxes.
		//
		// One HQ identity per team member, many mailboxes. A mailbox is still an
		// account row (the mail engine already stores every message against an
		// account_id), so nothing is duplicated here: this migration only adds the
		// operational metadata a shared address needs, plus the membership
		// relation that answers "which mailboxes may this member open?".
		const addColumn = async (table, column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};

		await addColumn('account', 'mailbox_type', "TEXT NOT NULL DEFAULT 'personal'");
		await addColumn('account', 'display_name', "TEXT NOT NULL DEFAULT ''");
		await addColumn('account', 'mailbox_status', "TEXT NOT NULL DEFAULT 'active'");
		await addColumn('account', 'inbound_state', "TEXT NOT NULL DEFAULT 'unknown'");
		await addColumn('account', 'outbound_state', "TEXT NOT NULL DEFAULT 'unknown'");
		await addColumn('account', 'health_checked_at', 'TEXT');

		// Signature delivery asset: the downscaled copy that is actually embedded
		// in outgoing mail, alongside the uploaded master.
		await addColumn('account', 'signature_delivery_key', 'TEXT');
		await addColumn('user', 'signature_delivery_key', 'TEXT');

		// Existing rows keep their address as the display name so the switcher has
		// something to show on day one.
		await c.env.db.prepare(
			`UPDATE account SET display_name = email WHERE COALESCE(display_name, '') = ''`
		).run();

		// A personal mailbox is the address that belongs to one named team member;
		// a shared mailbox is an operational company address several members work.
		// The address decides the type, because the login email IS the personal
		// mailbox address by definition.
		await c.env.db.prepare(`
			UPDATE account SET mailbox_type = CASE
				WHEN EXISTS (SELECT 1 FROM user u WHERE u.email = account.email AND COALESCE(u.is_del, 0) = 0) THEN 'personal'
				ELSE 'shared'
			END
		`).run();

		// Every personal mailbox is owned by exactly one member; shared mailboxes
		// get their membership rows through the admin UI, not by guessing.
		// (Run after mailbox_member is created, below.)

		// Membership is relational on purpose: a comma-separated owner list cannot
		// be indexed, filtered or revoked reliably.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS mailbox_member (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				mailbox_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				permissions TEXT NOT NULL DEFAULT 'view',
				status TEXT NOT NULL DEFAULT 'active',
				created_by INTEGER,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_member_unique ON mailbox_member(mailbox_id, user_id);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mailbox_member_user ON mailbox_member(user_id, status);`).run();

		// Membership changes are audited here, separately from the message-level
		// audit log, because mailbox membership is access to confidential mail.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS mailbox_member_audit (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				mailbox_id INTEGER NOT NULL,
				actor_id INTEGER,
				target_id INTEGER,
				action TEXT NOT NULL,
				detail TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		// Every personal mailbox is owned by exactly one member. Shared mailboxes
		// deliberately get no automatic members: access is granted by an
		// administrator, so nobody silently inherits a shared queue.
		await c.env.db.prepare(`
			INSERT OR IGNORE INTO mailbox_member (mailbox_id, user_id, permissions, status, created_by)
			SELECT a.account_id, u.user_id, 'view,reply,send,assign,reassign,internal_note,manage_tags,resolve,bulk_actions', 'active', u.user_id
			FROM account a
			JOIN user u ON u.email = a.email
			WHERE a.mailbox_type = 'personal' AND COALESCE(a.is_del, 0) = 0 AND COALESCE(u.is_del, 0) = 0
		`).run();

		// Workflow metadata for a shared conversation. It deliberately lives beside
		// the mail data instead of inside it: the message table stays "email".
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS mailbox_conversation (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				mailbox_id INTEGER NOT NULL,
				email_id INTEGER NOT NULL,
				status TEXT NOT NULL DEFAULT 'unassigned',
				priority TEXT NOT NULL DEFAULT 'normal',
				assigned_to INTEGER,
				last_handled_by INTEGER,
				related_type TEXT NOT NULL DEFAULT '',
				related_id INTEGER,
				resolved_at TEXT,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_conversation_email ON mailbox_conversation(email_id);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mailbox_conversation_mailbox ON mailbox_conversation(mailbox_id, status, id DESC);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mailbox_conversation_assignee ON mailbox_conversation(assigned_to, status);`).run();

		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS mailbox_conversation_event (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				conversation_id INTEGER NOT NULL,
				actor_id INTEGER,
				action TEXT NOT NULL,
				from_value TEXT NOT NULL DEFAULT '',
				to_value TEXT NOT NULL DEFAULT '',
				note TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mailbox_conversation_event ON mailbox_conversation_event(conversation_id, id ASC);`).run();

		// Tags are configurable company-wide; a conversation links to them.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS mailbox_tag (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				color TEXT NOT NULL DEFAULT 'slate',
				created_by INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_tag_name ON mailbox_tag(name COLLATE NOCASE);`).run();

		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS mailbox_conversation_tag (
				conversation_id INTEGER NOT NULL,
				tag_id INTEGER NOT NULL,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (conversation_id, tag_id)
			)
		`).run();

		// Per-member mailbox state: which mailbox was open last, and whether the
		// member wants the shared queue view. Small and additive.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS mailbox_preference (
				user_id INTEGER PRIMARY KEY,
				last_mailbox_id INTEGER,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		// Mailbox administration is a permission, not a role-name check.
		const permParent = await c.env.db.prepare(`SELECT pid AS perm_id FROM perm WHERE perm_key = 'email:send' LIMIT 1`).first();
		const addPerm = async (permKey, name, sort) => {
			if (!permParent) return;
			const existing = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ? LIMIT 1`).bind(permKey).first();
			if (existing) return;
			const maxSort = await c.env.db.prepare(`SELECT COALESCE(MAX(sort), 0) AS s FROM perm WHERE pid = ?`).bind(permParent.perm_id).first();
			await c.env.db.prepare(
				`INSERT INTO perm (pid, name, perm_key, type, sort) VALUES (?, ?, ?, 2, ?)`
			).bind(permParent.perm_id, name, permKey, (maxSort?.s || 0) + 1).run();
		};

		await addPerm('mailbox:query', 'å…±äº«é‚®ç®±æŸ¥çœ‹', 10);
		await addPerm('mailbox:manage', 'å…±äº«é‚®ç®±ç®¡ç†', 11);
	},

	async v3_34DB(c) {
		// One conversation per thread, not per message.
		//
		// A support thread is: customer writes, we reply, customer writes again.
		// The workflow (who owns it, what stage it is in, its tags) belongs to
		// that thread, so a second inbound message must land on the conversation
		// that is already open instead of opening a new one and losing the
		// assignee, the tags and the history.
		//
		// This is additive: mailbox_conversation keeps email_id as the message
		// that opened the thread, and the join table below records every message
		// that belongs to it.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS mailbox_conversation_message (
				conversation_id INTEGER NOT NULL,
				email_id INTEGER NOT NULL,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (conversation_id, email_id)
			)
		`).run();
		await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_conversation_message_email ON mailbox_conversation_message(email_id);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mailbox_conversation_message_conv ON mailbox_conversation_message(conversation_id);`).run();

		// Backfill: every conversation owns at least the message that opened it.
		await c.env.db.prepare(`
			INSERT OR IGNORE INTO mailbox_conversation_message (conversation_id, email_id)
			SELECT id, email_id FROM mailbox_conversation
		`).run();

		// Finance: debts and obligations are tracked as a balance that payments
		// reduce, never by overwriting the original amount.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_debt (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				creditor TEXT NOT NULL DEFAULT '',
				original_amount REAL NOT NULL DEFAULT 0,
				outstanding_amount REAL NOT NULL DEFAULT 0,
				currency TEXT NOT NULL DEFAULT 'KES',
				due_date TEXT,
				status TEXT NOT NULL DEFAULT 'open',
				priority TEXT NOT NULL DEFAULT 'normal',
				category TEXT NOT NULL DEFAULT '',
				notes TEXT NOT NULL DEFAULT '',
				related_type TEXT NOT NULL DEFAULT '',
				related_id INTEGER,
				created_by INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_debt_status ON finance_debt(status, due_date);`).run();

		// Payments are records in their own right: changing a total without
		// keeping the payment is not an audit trail.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_payment (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				debt_id INTEGER,
				related_type TEXT NOT NULL DEFAULT '',
				related_id INTEGER,
				amount REAL NOT NULL DEFAULT 0,
				currency TEXT NOT NULL DEFAULT 'KES',
				paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				method TEXT NOT NULL DEFAULT '',
				reference TEXT NOT NULL DEFAULT '',
				paid_by INTEGER,
				recipient TEXT NOT NULL DEFAULT '',
				evidence_key TEXT NOT NULL DEFAULT '',
				notes TEXT NOT NULL DEFAULT '',
				created_by INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_payment_debt ON finance_payment(debt_id, paid_at DESC);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_payment_related ON finance_payment(related_type, related_id);`).run();

		// Budgets carry allocated and spent separately so a variance can go
		// negative instead of being clamped at zero.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_budget (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				period TEXT NOT NULL DEFAULT '',
				total_amount REAL NOT NULL DEFAULT 0,
				allocated_amount REAL NOT NULL DEFAULT 0,
				currency TEXT NOT NULL DEFAULT 'KES',
				owner_id INTEGER,
				category TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'active',
				notes TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_budget_status ON finance_budget(status);`).run();

		// Subscriptions are recurring company costs. Reminder offsets are stored
		// per subscription so each one can choose its own schedule.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_subscription (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				service TEXT NOT NULL,
				category TEXT NOT NULL DEFAULT '',
				amount REAL NOT NULL DEFAULT 0,
				currency TEXT NOT NULL DEFAULT 'KES',
				billing_cycle TEXT NOT NULL DEFAULT 'monthly',
				next_billing_date TEXT,
				payment_method TEXT NOT NULL DEFAULT '',
				payment_reference TEXT NOT NULL DEFAULT '',
				owner_id INTEGER,
				status TEXT NOT NULL DEFAULT 'active',
				auto_renew INTEGER NOT NULL DEFAULT 1,
				reminder_offsets TEXT NOT NULL DEFAULT '7,3,1',
				notes TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_subscription_date ON finance_subscription(status, next_billing_date);`).run();

		// One audit trail for every financial edit, shared by debts, payments,
		// budgets, subscriptions and invoices.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_audit (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				entity_type TEXT NOT NULL,
				entity_id INTEGER,
				action TEXT NOT NULL,
				before_value TEXT NOT NULL DEFAULT '',
				after_value TEXT NOT NULL DEFAULT '',
				actor_id INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_audit_entity ON finance_audit(entity_type, entity_id, id DESC);`).run();

		// CRM: leads are rich relationship profiles, so an organisation lead can
		// hold several people without duplicating the organisation record.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS crm_lead_contact (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				lead_id INTEGER NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				role_title TEXT NOT NULL DEFAULT '',
				email TEXT NOT NULL DEFAULT '',
				phone TEXT NOT NULL DEFAULT '',
				is_primary INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_lead_contact_lead ON crm_lead_contact(lead_id);`).run();

		// Social profiles are multiple rows, not a single "social" string.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS crm_lead_social (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				lead_id INTEGER NOT NULL,
				network TEXT NOT NULL DEFAULT '',
				url TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_lead_social_lead ON crm_lead_social(lead_id);`).run();

		// Follow-ups are the CRM outreach action. They feed the Overview.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS crm_followup (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				lead_id INTEGER,
				contact_id INTEGER,
				due_date TEXT NOT NULL,
				due_time TEXT NOT NULL DEFAULT '',
				assigned_to INTEGER,
				next_action TEXT NOT NULL DEFAULT '',
				note TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'open',
				remind INTEGER NOT NULL DEFAULT 1,
				completed_at TEXT,
				created_by INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_followup_due ON crm_followup(status, due_date);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_followup_lead ON crm_followup(lead_id);`).run();

		// Configurable event categories, so the category list is data rather than
		// a hardcoded array in the interface.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS crm_category (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				kind TEXT NOT NULL DEFAULT 'event',
				sort INTEGER NOT NULL DEFAULT 0,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_category_name ON crm_category(kind, name COLLATE NOCASE);`).run();

		for (const [index, name] of [
			'Nightlife & Parties', 'Fashion', 'Education', 'Clubs & Venues',
			'Arts & Crafts', 'Community', 'Charity',
		].entries()) {
			await c.env.db.prepare(
				`INSERT OR IGNORE INTO crm_category (name, kind, sort) VALUES (?, 'event', ?)`
			).bind(name, index).run();
		}

		// Lead lifecycle replaces the generic pipeline: the status of one lead
		// is the whole story, so no separate pipeline entity is needed.
		for (const [index, name] of [
			'New', 'Contacted', 'In communication', 'Follow-up needed',
			'Interested', 'Onboarding', 'Closed - Won', 'Closed - Lost', 'Other',
		].entries()) {
			await c.env.db.prepare(
				`INSERT OR IGNORE INTO crm_category (name, kind, sort) VALUES (?, 'lead_status', ?)`
			).bind(name, index).run();
		}

		// Import batches are recorded so a migration can be traced and retried.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS crm_import (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				filename TEXT NOT NULL DEFAULT '',
				total_rows INTEGER NOT NULL DEFAULT 0,
				created_rows INTEGER NOT NULL DEFAULT 0,
				skipped_rows INTEGER NOT NULL DEFAULT 0,
				status TEXT NOT NULL DEFAULT 'preview',
				actor_id INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
	},

	async v3_35DB(c) {
		// Finance as a company operating system.
		//
		// The earlier finance tables were per-user and event-fee shaped: they
		// could record that a row existed, but not answer "how much cash does
		// the company hold, where, and what is it committed to?". This migration
		// keeps every existing column and row (accounts and transactions already
		// hold real data) and adds the company-level model beside it.
		//
		// Money is integer minor units (cents) everywhere. No floating point
		// arithmetic is used for a balance, a fee or a total.
		const addColumn = async (table, column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};

		// ---- accounts -----------------------------------------------------
		await addColumn('finance_accounts', 'opening_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_accounts', 'owner_id', 'INTEGER');
		await addColumn('finance_accounts', 'description', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_accounts', 'source', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_accounts', 'restrictions', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_accounts', 'opened_on', 'TEXT');
		await addColumn('finance_accounts', 'sort', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_accounts', 'confidential', 'INTEGER NOT NULL DEFAULT 0');

		// ---- canonical money movement ------------------------------------
		await addColumn('finance_transactions', 'txn_date', 'TEXT');
		await addColumn('finance_transactions', 'txn_time', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'direction', "TEXT NOT NULL DEFAULT 'in'");
		await addColumn('finance_transactions', 'category', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'subcategory', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'counterparty', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'reason', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'method', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'reference', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'tax_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_transactions', 'recorded_by', 'INTEGER');
		await addColumn('finance_transactions', 'approved_by', 'INTEGER');
		await addColumn('finance_transactions', 'voided_at', 'TEXT');
		await addColumn('finance_transactions', 'voided_by', 'INTEGER');
		await addColumn('finance_transactions', 'void_reason', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'budget_id', 'INTEGER');
		await addColumn('finance_transactions', 'commitment_id', 'INTEGER');
		await addColumn('finance_transactions', 'debt_id', 'INTEGER');
		await addColumn('finance_transactions', 'subscription_id', 'INTEGER');
		await addColumn('finance_transactions', 'invoice_id', 'INTEGER');
		await addColumn('finance_transactions', 'funding_id', 'INTEGER');
		await addColumn('finance_transactions', 'reimbursement_id', 'INTEGER');
		await addColumn('finance_transactions', 'advance_id', 'INTEGER');
		await addColumn('finance_transactions', 'project_id', 'INTEGER');
		await addColumn('finance_transactions', 'event_id', 'INTEGER');
		await addColumn('finance_transactions', 'request_id', 'INTEGER');
		await addColumn('finance_transactions', 'document_key', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'transfer_group', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'transfer_role', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'tags', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'notes', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_transactions', 'record_source', "TEXT NOT NULL DEFAULT ''");

		// ---- budgets ------------------------------------------------------
		await addColumn('finance_budget', 'allocated_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_budget', 'start_date', 'TEXT');
		await addColumn('finance_budget', 'end_date', 'TEXT');
		await addColumn('finance_budget', 'team_id', 'INTEGER');
		await addColumn('finance_budget', 'account_id', 'INTEGER');
		await addColumn('finance_budget', 'warning_threshold', 'INTEGER NOT NULL DEFAULT 80');
		await addColumn('finance_budget', 'description', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_budget', 'project_id', 'INTEGER');
		await addColumn('finance_budget', 'event_id', 'INTEGER');
		await addColumn('finance_budget', 'is_del', 'INTEGER NOT NULL DEFAULT 0');

		// A commitment is approved or planned spend that has not left an account
		// yet. Ignoring it makes a budget look healthier than it is.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_commitment (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				budget_id INTEGER,
				description TEXT NOT NULL DEFAULT '',
				amount_cents INTEGER NOT NULL DEFAULT 0,
				currency TEXT NOT NULL DEFAULT 'KES',
				status TEXT NOT NULL DEFAULT 'planned',
				counterparty TEXT NOT NULL DEFAULT '',
				due_date TEXT,
				account_id INTEGER,
				created_by INTEGER,
				txn_id INTEGER,
				notes TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_commitment_budget ON finance_commitment(budget_id, status);`).run();

		// ---- debts --------------------------------------------------------
		await addColumn('finance_debt', 'amount_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_debt', 'paid_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_debt', 'outstanding_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_debt', 'account_id', 'INTEGER');

		await addColumn('finance_debt', 'document_key', "TEXT NOT NULL DEFAULT ''");

		// Soft delete, so a cancelled or removed obligation keeps its payment
		// history instead of disappearing from the ledger.
		await addColumn('finance_debt', 'is_del', 'INTEGER NOT NULL DEFAULT 0');
		// Charges added to an obligation after it was created. Never overwrite
		// the original amount: the history is the point.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_debt_adjustment (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				debt_id INTEGER NOT NULL,
				amount_cents INTEGER NOT NULL DEFAULT 0,
				reason TEXT NOT NULL DEFAULT '',
				actor_id INTEGER,
				txn_id INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_debt_adjustment_debt ON finance_debt_adjustment(debt_id, id ASC);`).run();

		// ---- payments -----------------------------------------------------
		await addColumn('finance_payment', 'amount_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_payment', 'fee_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_payment', 'account_id', 'INTEGER');
		await addColumn('finance_payment', 'txn_id', 'INTEGER');
		await addColumn('finance_payment', 'approved_by', 'INTEGER');

		// ---- subscriptions ------------------------------------------------
		await addColumn('finance_subscription', 'amount_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_subscription', 'vendor', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_subscription', 'description', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_subscription', 'start_date', 'TEXT');
		await addColumn('finance_subscription', 'website', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_subscription', 'team_id', 'INTEGER');
		await addColumn('finance_subscription', 'contract_key', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_subscription', 'last_paid_at', 'TEXT');
		await addColumn('finance_subscription', 'cancelled_at', 'TEXT');

		// ---- invoices -----------------------------------------------------
		await addColumn('finance_invoices', 'customer_email', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_invoices', 'issue_date', 'TEXT');
		await addColumn('finance_invoices', 'due_date', 'TEXT');
		await addColumn('finance_invoices', 'subtotal_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_invoices', 'tax_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_invoices', 'total_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_invoices', 'paid_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_invoices', 'balance_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_invoices', 'account_id', 'INTEGER');
		await addColumn('finance_invoices', 'document_key', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_invoices', 'sent_at', 'TEXT');
		await addColumn('finance_invoices', 'viewed_at', 'TEXT');
		await addColumn('finance_invoices', 'notes', "TEXT NOT NULL DEFAULT ''");

		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_invoice_item (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				invoice_id INTEGER NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				quantity REAL NOT NULL DEFAULT 1,
				rate_cents INTEGER NOT NULL DEFAULT 0,
				amount_cents INTEGER NOT NULL DEFAULT 0,
				sort INTEGER NOT NULL DEFAULT 0
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_invoice_item_invoice ON finance_invoice_item(invoice_id, sort);`).run();

		// ---- funding ------------------------------------------------------
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_funding (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL DEFAULT '',
				source TEXT NOT NULL DEFAULT '',
				funding_type TEXT NOT NULL DEFAULT 'other',
				committed_cents INTEGER NOT NULL DEFAULT 0,
				received_cents INTEGER NOT NULL DEFAULT 0,
				currency TEXT NOT NULL DEFAULT 'KES',
				received_date TEXT,
				account_id INTEGER,
				conditions TEXT NOT NULL DEFAULT '',
				document_key TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'received',
				debt_id INTEGER,
				notes TEXT NOT NULL DEFAULT '',
				created_by INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_funding_status ON finance_funding(status);`).run();

		// ---- reimbursements and advances ----------------------------------
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_reimbursement (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				member_id INTEGER,
				amount_cents INTEGER NOT NULL DEFAULT 0,
				currency TEXT NOT NULL DEFAULT 'KES',
				reason TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'submitted',
				account_id INTEGER,
				txn_id INTEGER,
				reviewer_id INTEGER,
				reviewed_at TEXT,
				notes TEXT NOT NULL DEFAULT '',
				document_key TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_reimbursement_status ON finance_reimbursement(status);`).run();

		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_advance (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				member_id INTEGER,
				amount_cents INTEGER NOT NULL DEFAULT 0,
				spent_cents INTEGER NOT NULL DEFAULT 0,
				returned_cents INTEGER NOT NULL DEFAULT 0,
				currency TEXT NOT NULL DEFAULT 'KES',
				purpose TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'issued',
				account_id INTEGER,
				issued_on TEXT,
				notes TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		// ---- account access ----------------------------------------------
		// Money is confidential by default: an account is visible only to the
		// company-wide finance scope or to members explicitly granted access.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_account_member (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				account_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				access TEXT NOT NULL DEFAULT 'view',
				created_by INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				UNIQUE (account_id, user_id)
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_account_member_user ON finance_account_member(user_id);`).run();

		// ---- audit --------------------------------------------------------
		await addColumn('finance_audit', 'amount_cents', 'INTEGER NOT NULL DEFAULT 0');
		await addColumn('finance_audit', 'account_id', 'INTEGER');
		await addColumn('finance_audit', 'reason', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_audit', 'source', "TEXT NOT NULL DEFAULT ''");
		await addColumn('finance_audit', 'record_label', "TEXT NOT NULL DEFAULT ''");
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_audit_time ON finance_audit(id DESC);`).run();

		// ---- permissions --------------------------------------------------
		// The existing finance:view / finance:edit / finance:approve keys stay.
		// The rest describe the workflows rather than the buttons: a budget
		// owner is granted budget rights without company-wide finance.
		const addPerm = async (parentKey, permKey, name) => {
			const parent = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ? LIMIT 1`).bind(parentKey).first();
			const parentId = parent?.perm_id ?? 0;
			const existing = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ? LIMIT 1`).bind(permKey).first();
			if (existing) return;
			const maxSort = await c.env.db.prepare(`SELECT COALESCE(MAX(sort), 0) AS s FROM perm WHERE pid = ?`).bind(parentId).first();
			await c.env.db.prepare(
				`INSERT INTO perm (pid, name, perm_key, type, sort) VALUES (?, ?, ?, 2, ?)`
			).bind(parentId, name, permKey, (maxSort?.s || 0) + 1).run();
		};

		// Company-wide finance is its own key so a budget owner never needs it.
		await addPerm('finance:view', 'finance:view_all', 'Finance: company-wide access');
		await addPerm('finance:view', 'finance:create', 'Finance: record transactions');
		await addPerm('finance:view', 'finance:void', 'Finance: void a transaction');
		await addPerm('finance:view', 'finance:export', 'Finance: export');

		await addPerm('finance:view', 'finance.accounts:view', 'Finance: view accounts');
		await addPerm('finance:view', 'finance.accounts:manage', 'Finance: manage accounts');

		await addPerm('finance:view', 'finance.transactions:view', 'Finance: view transactions');
		await addPerm('finance:view', 'finance.transactions:create', 'Finance: record transactions');

		await addPerm('finance:view', 'finance.budgets:view', 'Finance: view budgets');
		await addPerm('finance:view', 'finance.budgets:create', 'Finance: create budgets');
		await addPerm('finance:view', 'finance.budgets:manage', 'Finance: manage budgets');
		await addPerm('finance:view', 'finance.budgets:assign', 'Finance: assign budgets');

		await addPerm('finance:view', 'finance.debts:view', 'Finance: view debts');
		await addPerm('finance:view', 'finance.debts:create', 'Finance: record debts');
		await addPerm('finance:view', 'finance.debts:pay', 'Finance: record debt payments');

		await addPerm('finance:view', 'finance.subscriptions:view', 'Finance: view subscriptions');
		await addPerm('finance:view', 'finance.subscriptions:manage', 'Finance: manage subscriptions');
		await addPerm('finance:view', 'finance.subscriptions:pay', 'Finance: record subscription payments');

		await addPerm('finance:view', 'finance.invoices:view', 'Finance: view invoices');
		await addPerm('finance:view', 'finance.invoices:create', 'Finance: create invoices');
		await addPerm('finance:view', 'finance.invoices:send', 'Finance: send invoices');
		await addPerm('finance:view', 'finance.invoices:manage', 'Finance: manage invoices');

		await addPerm('finance:view', 'finance.audit:view', 'Finance: view audit log');

		// Reusable finance categories: data, not a hardcoded list in the UI.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_category (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				kind TEXT NOT NULL DEFAULT 'expense',
				name TEXT NOT NULL,
				sort INTEGER NOT NULL DEFAULT 0,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_category_unique ON finance_category(kind, name COLLATE NOCASE);`).run();

		const expenseCategories = [
			'Development', 'Hosting', 'Infrastructure', 'Marketing', 'Launch',
			'Design', 'Legal', 'Compliance', 'Payroll', 'Contractors',
			'Travel', 'Event Operations', 'Software', 'Subscriptions',
			'Bank/Payment Fees', 'Office', 'Equipment', 'Other',
		];
		for (const [index, name] of expenseCategories.entries()) {
			await c.env.db.prepare(
				`INSERT OR IGNORE INTO finance_category (kind, name, sort) VALUES ('expense', ?, ?)`
			).bind(name, index).run();
		}
		for (const [index, name] of ['Service revenue', 'Event revenue', 'Custom service', 'Partnership income', 'Funding', 'Other'].entries()) {
			await c.env.db.prepare(
				`INSERT OR IGNORE INTO finance_category (kind, name, sort) VALUES ('income', ?, ?)`
			).bind(name, index).run();
		}
	},

	// v3_36 repairs the seeded Finance roles and adds the two things the finance
	// workflows need that v3_35 could not know about: a confidential flag that is
	// actually enforced, and a link from a commitment back to the request that
	// authorised it.
	//
	// The seeded Finance Manager role was built against the pre-rebuild keys
	// (finance:view, :edit, :approve). The service checks the workflow keys, so
	// that role could see the Finance nav but not open an account. The grants
	// below are additive: nothing is revoked, and roles are still editable in
	// the Role Builder.
	async v3_36DB(c) {
		const addColumn = async (table, column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};
		await addColumn('finance_commitment', 'request_id', 'INTEGER');
		await c.env.db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_finance_commitment_request ON finance_commitment(request_id);`
		).run();

		const addPerm = async (permKey, name) => {
			const existing = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ? LIMIT 1`).bind(permKey).first();
			if (existing) return existing.perm_id;
			const parent = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = 'finance:view' LIMIT 1`).first();
			const parentId = parent?.perm_id ?? 0;
			const maxSort = await c.env.db.prepare(`SELECT COALESCE(MAX(sort), 0) AS s FROM perm WHERE pid = ?`).bind(parentId).first();
			const { meta } = await c.env.db.prepare(
				`INSERT INTO perm (pid, name, perm_key, type, sort) VALUES (?, ?, ?, 2, ?)`
			).bind(parentId, name, permKey, (maxSort?.s || 0) + 1).run();
			return meta.last_row_id;
		};

		// Confidential records need their own key. Company-wide finance access
		// alone must not be a universal bypass into payroll or legal.
		await addPerm('finance.view_confidential', 'Finance: view confidential records');

		const grant = async (roleName, keys) => {
			const role = await c.env.db.prepare(`SELECT role_id FROM role WHERE name = ? LIMIT 1`).bind(roleName).first();
			if (!role) return 0;
			let granted = 0;
			for (const key of keys) {
				const perm = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ? LIMIT 1`).bind(key).first();
				if (!perm) continue;
				const existing = await c.env.db.prepare(
					`SELECT 1 AS ok FROM role_perm WHERE role_id = ? AND perm_id = ? LIMIT 1`
				).bind(role.role_id, perm.perm_id).first();
				if (existing) continue;
				await c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)`)
					.bind(role.role_id, perm.perm_id).run();
				granted++;
			}
			return granted;
		};

		// Finance Manager runs the function: company scope, accounts, every
		// workflow key, and the confidential records the role description promises.
		await grant('Finance Manager', [
			'finance:view', 'finance:view_all', 'finance.view_confidential',
			'finance.accounts:view', 'finance.accounts:manage',
			'finance.transactions:view', 'finance.transactions:create', 'finance:void', 'finance:export',
			'finance.budgets:view', 'finance.budgets:create', 'finance.budgets:manage', 'finance.budgets:assign',
			'finance.debts:view', 'finance.debts:create', 'finance.debts:pay',
			'finance.subscriptions:view', 'finance.subscriptions:manage', 'finance.subscriptions:pay',
			'finance.invoices:view', 'finance.invoices:create', 'finance.invoices:send', 'finance.invoices:manage',
			'finance.audit:view', 'finance:approve',
		]);

		// Finance Viewer is read-only and scoped: no company-wide key, so the
		// scope rules (ownership and explicit grants) decide what it sees.
		await grant('Finance Viewer', [
			'finance:view',
			'finance.accounts:view',
			'finance.transactions:view',
			'finance.budgets:view',
			'finance.debts:view',
			'finance.subscriptions:view',
			'finance.invoices:view',
			'finance.audit:view',
		]);
	},

	// One canonical cross-module relationship table. Finance records already
	// reference each other through their own foreign keys (a transaction knows
	// its budget, its debt, its invoice), and those stay: they drive the ledger
	// arithmetic. This table holds the links that cross module boundaries, or
	// that have no business meaning inside the ledger â€” an invoice raised for a
	// project, a subscription bought for a team, a payment that settled a request.
	//
	// Both ends are (type, id) pairs rather than foreign keys because the types
	// live in different modules with different primary key columns. Deleting a
	// record therefore leaves its relations behind, and the read side filters
	// orphans out instead of joining blindly.
	async v3_37DB(c) {
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_relation (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				source_type TEXT NOT NULL,
				source_id INTEGER NOT NULL,
				target_type TEXT NOT NULL,
				target_id INTEGER NOT NULL,
				relation TEXT NOT NULL DEFAULT 'related',
				note TEXT NOT NULL DEFAULT '',
				created_by INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		await c.env.db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_finance_relation_source ON finance_relation(source_type, source_id, id ASC);`
		).run();
		await c.env.db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_finance_relation_target ON finance_relation(target_type, target_id, id ASC);`
		).run();
		await c.env.db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_finance_relation_pair ON finance_relation(source_type, source_id, target_type, target_id, relation);`
		).run();
	},

	// An invoice is not automatically money owed to us. A supplier's bill is an
	// invoice too, and counting it as a receivable would overstate what the
	// company is owed. Direction is the difference: 'issued' is a receivable,
	// 'vendor' is a payable that exists as a document until it is paid.
	async v3_38DB(c) {
		const addColumn = async (table, column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};
		await addColumn('finance_invoices', 'direction', `TEXT NOT NULL DEFAULT 'issued'`);
		await c.env.db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_finance_invoices_direction ON finance_invoices(direction, status, is_del);`
		).run();
	},

	async v3_31DB(c) {
		// Access-change history. Role edits rewrite role_perm wholesale, so the
		// history of who changed what has to live in its own append-only table.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS role_audit (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				role_id INTEGER,
				role_name TEXT,
				actor_id INTEGER,
				action TEXT NOT NULL,
				summary TEXT NOT NULL,
				detail TEXT,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_role_audit_role ON role_audit(role_id, id DESC);`).run();
	},

	async v3_39DB(c) {
		// XPass HQ control plane. Additive and idempotent: every statement may be
		// re-run against an existing company database without data loss.
		//
		// This migration establishes the security spine (mandatory authenticator,
		// sessions, login history, recovery codes), the people/team directory
		// extensions, company announcements, onboarding invitations, the curated
		// connections catalogue and per-member tutorial progress.
		const addUserColumn = async (column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE user ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};

		// --- Authentication state -------------------------------------------
		// The authenticator secret is never stored in plaintext. It is encrypted
		// with a key derived from the deployment's jwt_secret, so a database
		// dump alone does not yield usable TOTP seeds.
		await addUserColumn('mfa_enabled', 'INTEGER NOT NULL DEFAULT 0');
		await addUserColumn('mfa_secret_enc', 'TEXT');
		await addUserColumn('mfa_enrolled_at', 'DATETIME');
		await addUserColumn('mfa_recovery_generated_at', 'DATETIME');
		// 'none' | 'login' | 'admin' | 'expired'. Drives whether the member must
		// change their password before anything else works.
		await addUserColumn('password_change_required', `TEXT NOT NULL DEFAULT 'none'`);
		await addUserColumn('password_changed_at', 'DATETIME');
		// Set when an administrator issues a temporary credential; cleared on the
		// member's first successful password change. Used to expire unused invites.
		await addUserColumn('onboarding_started_at', 'DATETIME');
		await addUserColumn('onboarding_completed_at', 'DATETIME');
		// Suspended/archived/pending are represented in status already; this flag
		// records *why* an account cannot sign in, for the team list.
		await addUserColumn('suspended_reason', `TEXT NOT NULL DEFAULT ''`);

		// --- Sessions -------------------------------------------------------
		// A session is one issued token. The token id lives in the JWT and in KV;
		// this table is the durable record so sessions survive a KV flush and can
		// be listed, audited and revoked by device.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS user_session (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				token_id TEXT NOT NULL,
				device TEXT NOT NULL DEFAULT '',
				os TEXT NOT NULL DEFAULT '',
				browser TEXT NOT NULL DEFAULT '',
				ip TEXT NOT NULL DEFAULT '',
				user_agent TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				last_seen_at TEXT,
				revoked_at TEXT,
				revoked_reason TEXT NOT NULL DEFAULT ''
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_session_user ON user_session(user_id, revoked_at);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_session_token ON user_session(token_id);`).run();

		// --- Login and security history -------------------------------------
		// Append-only. Records successes, failures, MFA outcomes, recovery-code
		// use, resets and revocations. No secrets are ever written here.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS user_login_event (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				email TEXT NOT NULL DEFAULT '',
				kind TEXT NOT NULL,
				outcome TEXT NOT NULL,
				detail TEXT NOT NULL DEFAULT '',
				ip TEXT NOT NULL DEFAULT '',
				user_agent TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_login_event_user ON user_login_event(user_id, id DESC);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_login_event_email ON user_login_event(email, id DESC);`).run();

		// --- Recovery codes -------------------------------------------------
		// Stored as hashes only. Plaintext is shown to the member exactly once.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS user_recovery_code (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				code_hash TEXT NOT NULL,
				used_at TEXT,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_recovery_code_user ON user_recovery_code(user_id, used_at);`).run();

		// --- Company announcements ------------------------------------------
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS announcement (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				title TEXT NOT NULL,
				body TEXT NOT NULL DEFAULT '',
-- 'normal' | 'important' | 'critical'
				priority TEXT NOT NULL DEFAULT 'normal',
-- 'draft' | 'scheduled' | 'published' | 'archived'
				status TEXT NOT NULL DEFAULT 'draft',
				publish_at TEXT,
				expire_at TEXT,
				requires_ack INTEGER NOT NULL DEFAULT 0,
				pinned INTEGER NOT NULL DEFAULT 0,
				created_by INTEGER,
				updated_by INTEGER,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT,
				published_at TEXT,
				archived_at TEXT
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_announcement_status ON announcement(status, publish_at);`).run();

		// Audience rows: 'all', or one row per team / role / member.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS announcement_audience (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				announcement_id INTEGER NOT NULL,
-- 'all' | 'team' | 'role' | 'member'
				kind TEXT NOT NULL,
				target_id INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(announcement_id, kind, target_id)
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_announcement_audience ON announcement_audience(announcement_id);`).run();

		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS announcement_ack (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				announcement_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(announcement_id, user_id)
			)
		`).run();

		// Append-only history of announcement administration.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS announcement_audit (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				announcement_id INTEGER,
				actor_id INTEGER,
				action TEXT NOT NULL,
				summary TEXT NOT NULL DEFAULT '',
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS announcement_read (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				announcement_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(announcement_id, user_id)
			)
		`).run();

		// --- Onboarding invitations -----------------------------------------
		// Bound to an existing account. Never an open signup path and never a
		// role grant: the administrator has already decided the role and access.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS invitation (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				token_hash TEXT NOT NULL,
-- 'pending' | 'accepted' | 'expired' | 'revoked'
				status TEXT NOT NULL DEFAULT 'pending',
				expires_at TEXT NOT NULL,
				created_by INTEGER,
				accepted_at TEXT,
				revoked_at TEXT,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(token_hash)
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_invitation_user ON invitation(user_id, status);`).run();

		// --- Connections ----------------------------------------------------
		// Public metadata only. Credentials live in the secret store, referenced
		// by key; the browser is told `configured: true`, never the value.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS connection (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
-- 'whatsapp' | 'ai_provider' | 'email_forwarding'
				provider TEXT NOT NULL,
				display_name TEXT NOT NULL DEFAULT '',
-- 'not_configured' | 'configured' | 'connected' | 'error'
				status TEXT NOT NULL DEFAULT 'not_configured',
				identity TEXT NOT NULL DEFAULT '',
				last_checked_at TEXT,
				last_error TEXT NOT NULL DEFAULT '',
				secret_ref TEXT NOT NULL DEFAULT '',
				configured_by INTEGER,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT,
				UNIQUE(provider)
			)
		`).run();

		// --- Notification preferences ---------------------------------------
		// One row per member. Missing row means "everything on" (the default).
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS notification_pref (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
-- JSON map of channel -> { type -> boolean }
				channels TEXT NOT NULL DEFAULT '{}',
				update_time TEXT,
				UNIQUE(user_id)
			)
		`).run();

		// --- Tutorial progress ----------------------------------------------
		// Tour definitions live in the frontend registry; only progress is stored.
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS tutorial_progress (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				tour_id TEXT NOT NULL,
				tour_version INTEGER NOT NULL DEFAULT 1,
				completed_at TEXT,
				dismissed_at TEXT,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(user_id, tour_id, tour_version)
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_tutorial_progress_user ON tutorial_progress(user_id);`).run();

		// --- Member-level onboarding metadata -------------------------------
		// Accounts that exist but have never completed first-login security.
		// Backfill: every existing account is treated as needing security setup
		// on next sign-in, but existing MFA-less accounts are NOT locked out --
		// they are routed through the same onboarding flow once, which is the
		// safe migration path described in the plan.
		await c.env.db.prepare(`
			UPDATE user
			SET onboarding_started_at = create_time
			WHERE onboarding_started_at IS NULL
		`).run();

		// --- Permissions for the new control plane --------------------------
		// Added to the catalogue (not just enforced in the middleware) so the
		// Role Builder shows them and the configured administrator receives them
		// through the same explicit grant path as every other key.
		const groupFor = async (name, sort) => {
			const existing = await c.env.db.prepare(
				`SELECT perm_id FROM perm WHERE name = ? AND pid = 0 LIMIT 1`
			).bind(name).first();
			if (existing) return existing.perm_id;
			const result = await c.env.db.prepare(
				`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES (?, NULL, 0, 1, ?)`
			).bind(name, sort).run();
			return result.meta.last_row_id;
		};

		const addPerm = async (name, key, groupId, sort) => {
			const existing = await c.env.db.prepare(
				`SELECT perm_id FROM perm WHERE perm_key = ? LIMIT 1`
			).bind(key).first();
			if (existing) return existing.perm_id;
			const result = await c.env.db.prepare(
				`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES (?, ?, ?, 2, ?)`
			).bind(name, key, groupId, sort).run();
			return result.meta.last_row_id;
		};

		const securityGroup = await groupFor('Member security', 88);
		await addPerm('Reset member authenticator', 'user:reset-mfa', securityGroup, 1);
		await addPerm('Reset member password', 'user:reset-password', securityGroup, 2);

		const teamGroup = await groupFor('XPass Team', 89);
		await addPerm('View team', 'team:query', teamGroup, 1);

		const announcementGroup = await groupFor('Announcements', 90);
		await addPerm('View announcements', 'announcement:query', announcementGroup, 1);
		await addPerm('Manage announcements', 'announcement:manage', announcementGroup, 2);

		const connectionGroup = await groupFor('Connections', 91);
		await addPerm('View connections', 'connections:query', connectionGroup, 1);
		await addPerm('Manage connections', 'connections:manage', connectionGroup, 2);

		// The configured administrator holds every permission explicitly, so new
		// keys must be granted to that account or it would lose the new screens.
		const adminEmail = c.env.admin;
		if (adminEmail) {
			const admin = await c.env.db.prepare(`SELECT user_id FROM user WHERE email = ? LIMIT 1`)
				.bind(adminEmail).first();
			if (admin) {
				for (const key of [
					'user:reset-mfa', 'user:reset-password', 'team:query',
					'announcement:query', 'announcement:manage',
					'connections:query', 'connections:manage'
				]) {
					const permRow = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ? LIMIT 1`)
						.bind(key).first();
					if (!permRow) continue;
					await c.env.db.prepare(
						`INSERT OR IGNORE INTO user_perm_override (user_id, perm_key, effect) VALUES (?, ?, 'allow')`
					).bind(admin.user_id, key).run();
				}
			}
		}
	},

	// v3_40: finance configuration framework. Categories already lived in
	// finance_category keyed by kind (expense/income); account types, payment
	// methods and tags are the same shape, so they reuse the table rather than
	// three more. Idempotent seeds give sensible defaults an admin can edit or
	// extend in Finance > Configuration.
	async v3_40DB(c) {
		const seeds = {
			account_type: ['Bank', 'Cash', 'Mobile money', 'Savings'],
			payment_method: ['Bank transfer', 'M-Pesa', 'Cash', 'Card', 'Cheque', 'Standing order'],
			tag: ['Recurring', 'One-off', 'Reimbursable', 'Capital', 'Tax-deductible'],
		};
		for (const [kind, names] of Object.entries(seeds)) {
			for (const [index, name] of names.entries()) {
				await c.env.db.prepare(
					`INSERT OR IGNORE INTO finance_category (kind, name, sort) VALUES (?, ?, ?)`
				).bind(kind, name, index).run();
			}
		}

		// The configuration screen's write guard. Additive: create under the
		// finance:view group and grant it to the configured administrator so the
		// person who runs finance can always edit the dropdown lists.
		const parent = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = 'finance:view' LIMIT 1`).first();
		const parentId = parent?.perm_id ?? 0;
		const existing = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = 'finance:configure' LIMIT 1`).first();
		if (!existing) {
			const maxSort = await c.env.db.prepare(`SELECT COALESCE(MAX(sort), 0) AS s FROM perm WHERE pid = ?`).bind(parentId).first();
			await c.env.db.prepare(
				`INSERT INTO perm (pid, name, perm_key, type, sort) VALUES (?, ?, ?, 2, ?)`
			).bind(parentId, 'Finance: configure dropdown lists', 'finance:configure', (maxSort?.s || 0) + 1).run();
		}
		const adminEmail = c.env.admin;
		if (adminEmail) {
			const admin = await c.env.db.prepare(`SELECT user_id FROM user WHERE email = ? LIMIT 1`).bind(adminEmail).first();
			if (admin) {
				await c.env.db.prepare(
					`INSERT OR IGNORE INTO user_perm_override (user_id, perm_key, effect) VALUES (?, 'finance:configure', 'allow')`
				).bind(admin.user_id).run();
			}
		}
	},

	// v3_41: secure invoice share links. A share token is stored hashed (like
	// invitation tokens) so a database leak cannot reconstruct a live link. Each
	// link is scoped to one invoice, optionally expires, and can be revoked
	// without touching the invoice itself.
	async v3_41DB(c) {
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS finance_invoice_share (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				invoice_id INTEGER NOT NULL,
				token_hash TEXT NOT NULL,
				created_by INTEGER,
				expires_at TEXT,
				revoked_at TEXT,
				access_count INTEGER NOT NULL DEFAULT 0,
				last_access_at TEXT,
				create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_invoice_share_invoice ON finance_invoice_share(invoice_id);`).run();
		await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_invoice_share_token ON finance_invoice_share(token_hash);`).run();
	},

	async v3_29DB(c) {
		// Record scope policy: how much of a module an employee may see.
		// own | assigned | team | company. Stored per role, with an optional
		// per-user override. Default is 'own' (deny by default); the configured
		// administrator role is set to 'company' so it can still administer data.
		const addColumn = async (table, column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};

		await addColumn('role', 'data_scope', `TEXT NOT NULL DEFAULT 'own'`);
		await addColumn('user', 'data_scope', `TEXT`);

		const valid = ['own', 'assigned', 'team', 'company'];
		const rows = await c.env.db.prepare(`SELECT role_id, data_scope FROM role`).all();
		for (const row of rows.results || []) {
			if (!valid.includes(row.data_scope)) {
				await c.env.db.prepare(`UPDATE role SET data_scope = 'own' WHERE role_id = ?`).bind(row.role_id).run();
			}
		}

		// The administrator role manages company records; every other role keeps
		// the deny-by-default 'own' scope until an administrator widens it.
		await c.env.db.prepare(`UPDATE role SET data_scope = 'company' WHERE role_id = 1`).run();
		await c.env.db.prepare(`UPDATE user SET data_scope = NULL WHERE data_scope IS NOT NULL AND data_scope NOT IN ('own','assigned','team','company')`).run();
	},

	async v3_28DB(c) {
		// Mail read access becomes an explicit permission instead of "any
		// authenticated employee". Without this a Contacts-only or Documents-only
		// employee could still call /email/list and read mail.
		// The mail parent has no perm_key of its own, so resolve it through an
		// existing mail permission instead.
		const emailParent = await c.env.db.prepare(`SELECT pid AS perm_id FROM perm WHERE perm_key = 'email:send' LIMIT 1`).first();
		const existing = await c.env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = 'email:query' LIMIT 1`).first();

		if (!existing && emailParent) {
			const maxSort = await c.env.db.prepare(`SELECT COALESCE(MAX(sort), 0) AS s FROM perm WHERE pid = ?`).bind(emailParent.perm_id).first();
			await c.env.db.prepare(
				`INSERT INTO perm (pid, name, perm_key, type, sort) VALUES (?, 'é‚®ä»¶æŸ¥çœ‹', 'email:query', 2, ?)`
			).bind(emailParent.perm_id, (maxSort?.s || 0) + 1).run();
		}

		// Existing mail users keep their access: any role that already holds an
		// email permission is granted the read permission. Roles with no mail
		// access at all are deliberately left without it (deny by default).
		await c.env.db.prepare(`
			INSERT OR IGNORE INTO role_perm (role_id, perm_id)
			SELECT DISTINCT rp.role_id, q.perm_id
			FROM role_perm rp
			JOIN perm p ON p.perm_id = rp.perm_id
			JOIN perm q ON q.perm_key = 'email:query'
			WHERE p.perm_key LIKE 'email:%'
			  AND p.perm_key <> 'email:query'
		`).run();
	},

	async v3_27DB(c) {
		// Presence: employees see who is around without a chat system. The
		// client sends a heartbeat at most once a minute and the directory
		// treats a recent heartbeat as "online". Additive and re-runnable.
		try {
			await c.env.db.prepare(`ALTER TABLE user ADD COLUMN last_seen_at DATETIME;`).run();
		} catch (e) {
			// column already exists
		}
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_last_seen ON user(last_seen_at);`).run();
	},

	async v3_26DB(c) {
		// Canonical internal identity: local employees need a first-class
		// identity (display name, unique handle, avatar, job title, team)
		// instead of relying on the OAuth profile. Additive only: every
		// statement is safe to re-run and nothing is dropped.
		const addUserColumn = async (column, definition) => {
			try {
				await c.env.db.prepare(`ALTER TABLE user ADD COLUMN ${column} ${definition};`).run();
			} catch (e) {
				// column already exists
			}
		};

		await addUserColumn('display_name', `TEXT`);
		await addUserColumn('username', `TEXT`);
		await addUserColumn('avatar_key', `TEXT`);
		await addUserColumn('job_title', `TEXT NOT NULL DEFAULT ''`);
		await addUserColumn('phone', `TEXT`);
		await addUserColumn('team_id', `INTEGER`);
		await addUserColumn('update_time', `DATETIME`);

		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS team (
				team_id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				slug TEXT,
				description TEXT NOT NULL DEFAULT '',
				is_active INTEGER NOT NULL DEFAULT 1,
				sort INTEGER NOT NULL DEFAULT 0,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_team_active ON team(is_active, sort);`).run();

		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS user_team (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				team_id INTEGER NOT NULL,
				is_primary INTEGER NOT NULL DEFAULT 0,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_team_user ON user_team(user_id);`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_team_team ON user_team(team_id);`).run();

		// Seed a starting set of teams. Names are editable/archivable by
		// administrators; nothing in the product logic depends on these ids.
		const { teamCount } = await c.env.db.prepare(`SELECT COUNT(*) as teamCount FROM team`).first();
		if (!teamCount) {
			await c.env.db.prepare(`
				INSERT INTO team (name, slug, description, is_active, sort) VALUES
					('Leadership', 'leadership', 'Directors and company leadership', 1, 10),
					('Growth', 'growth', 'Marketing, partnerships, and outreach', 1, 20),
					('Engineering', 'engineering', 'Product and technical delivery', 1, 30),
					('Finance', 'finance', 'Money in, money out, and reporting', 1, 40),
					('Support', 'support', 'Customer and company support', 1, 50),
					('Operations', 'operations', 'Events, venues, and day-to-day operations', 1, 60)
			`).run();
		}

		// Display name: prefer the stored account name, fall back to the
		// email local part. Never overwrites an existing display name.
		await c.env.db.prepare(`
			UPDATE user
			SET display_name = COALESCE(
				NULLIF(trim(COALESCE(display_name, '')), ''),
				NULLIF(trim((SELECT a.name FROM account a WHERE a.email = user.email AND COALESCE(a.is_del, 0) = 0 LIMIT 1)), ''),
				substr(email, 1, instr(email, '@') - 1)
			)
			WHERE COALESCE(trim(display_name), '') = ''
		`).run();

		// Username: deterministic local part, sanitized to letters and digits.
		await c.env.db.prepare(`
			UPDATE user
			SET username = lower(
				replace(replace(replace(replace(
					substr(email, 1, instr(email, '@') - 1),
				'.', ''), '_', ''), '-', ''), '+', '')
			)
			WHERE COALESCE(trim(username), '') = ''
		`).run();
		await c.env.db.prepare(`
			UPDATE user
			SET username = 'user' || user_id
			WHERE COALESCE(trim(username), '') = ''
		`).run();

		// Resolve collisions deterministically (base-<user_id>), then repeat so
		// a suffix cannot itself collide with an existing handle.
		for (let pass = 0; pass < 3; pass++) {
			await c.env.db.prepare(`
				UPDATE user
				SET username = username || '-' || user_id
				WHERE rowid IN (
					SELECT rowid FROM (
						SELECT rowid, COUNT(*) OVER (PARTITION BY username) AS duplicate
						FROM user
						WHERE COALESCE(is_del, 0) = 0
					) WHERE duplicate > 1
				)
			`).run();
		}

		try {
			await c.env.db.prepare(`
				CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username
				ON user (username COLLATE NOCASE)
				WHERE username IS NOT NULL AND COALESCE(is_del, 0) = 0
			`).run();
		} catch (e) {
			console.warn(`username unique index skipped: ${e.message}`);
		}

		await c.env.db.prepare(`
			UPDATE user SET update_time = COALESCE(update_time, create_time, CURRENT_TIMESTAMP)
			WHERE update_time IS NULL
		`).run();

		// Mirror the primary team into the membership table so team membership
		// and the fast-path team_id never disagree.
		await c.env.db.prepare(`
			INSERT INTO user_team (user_id, team_id, is_primary)
			SELECT user_id, team_id, 1 FROM user
			WHERE team_id IS NOT NULL
				AND NOT EXISTS (
					SELECT 1 FROM user_team ut WHERE ut.user_id = user.user_id AND ut.team_id = user.team_id
				)
		`).run();
	},
};

export { dbInit };
