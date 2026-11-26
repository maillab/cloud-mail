import notificationService from './notification-service';

// Hourly scan for notes reminders and overdue work items. Every delivery uses a
// stable event_key so repeated scans never duplicate a notification.
const reminderService = {
	async scanDue({env}) {
		const ctx = {env};
		await this.scanNoteReminders(ctx);
		await this.scanCalendarReminders(ctx);
		await this.scanTaskOverdue(ctx);
		await this.scanApprovalOverdue(ctx);
		await this.scanRequestOverdue(ctx);
		await this.scanFinanceReminders(ctx);
	},

	async scanCalendarReminders(c) {
		const {results} = await c.env.db.prepare(
			`SELECT id, user_id, title, start_time, reminder_at FROM calendar_events
			 WHERE is_del = 0 AND reminder_sent = 0 AND reminder_at IS NOT NULL
			 AND datetime(reminder_at) <= datetime('now')`
		).all();
		for (const ev of results || []) {
			const recipients = new Set([ev.user_id]);
			const parts = await c.env.db.prepare(
				`SELECT user_id FROM calendar_event_participants WHERE event_id = ? AND response <> 'declined'`
			).bind(ev.id).all();
			for (const p of parts.results || []) recipients.add(p.user_id);
			for (const uid of recipients) {
				await notificationService.notify(c, {
					userId: uid,
					type: 'reminder',
					title: `Reminder: ${ev.title || 'Calendar entry'}`,
					body: ev.start_time ? `Starts ${ev.start_time}` : 'Scheduled calendar entry',
					link: `/calendar?event=${ev.id}`,
					eventKey: `calendar:reminder:${ev.id}:${uid}`
				});
			}
			await c.env.db.prepare(`UPDATE calendar_events SET reminder_sent = 1 WHERE id = ?`).bind(ev.id).run();
		}
	},

	async scanNoteReminders(c) {
		const {results} = await c.env.db.prepare(
			`SELECT id, user_id, title, reminder_at FROM notes
			 WHERE is_del = 0 AND reminder_sent = 0 AND reminder_at IS NOT NULL
			 AND datetime(reminder_at) <= datetime('now')`
		).all();
		for (const note of results || []) {
			await notificationService.notify(c, {
				userId: note.user_id,
				type: 'reminder',
				title: `Reminder: ${note.title || 'Untitled note'}`,
				body: `Scheduled for ${note.reminder_at}`,
				link: `/notes/${note.id}`,
				eventKey: `note:reminder:${note.id}`
			});
			await c.env.db.prepare(`UPDATE notes SET reminder_sent = 1 WHERE id = ?`).bind(note.id).run();
		}
	},

	async scanTaskOverdue(c) {
		const crm = await c.env.db.prepare(
			`SELECT id, title, assigned_to, due_at FROM crm_tasks
			 WHERE is_del = 0 AND assigned_to IS NOT NULL
			 AND status NOT IN ('completed','cancelled','done')
			 AND due_at IS NOT NULL AND datetime(due_at) < datetime('now')`
		).all();
		for (const task of crm.results || []) {
			await notificationService.notify(c, {
				userId: task.assigned_to,
				type: 'task',
				title: `Task overdue: ${task.title || ''}`,
				body: `Was due ${task.due_at}`,
				link: `/crm/tasks/${task.id}`,
				eventKey: `task:overdue:${task.id}`
			});
		}

		const projects = await c.env.db.prepare(
			`SELECT id, title, assignee_id, due_date FROM project_tasks
			 WHERE is_del = 0 AND assignee_id IS NOT NULL
			 AND status NOT IN ('done','completed','cancelled')
			 AND due_date IS NOT NULL AND datetime(due_date) < datetime('now')`
		).all();
		for (const task of projects.results || []) {
			await notificationService.notify(c, {
				userId: task.assignee_id,
				type: 'task',
				title: `Task overdue: ${task.title || ''}`,
				body: `Was due ${task.due_date}`,
				link: `/projects/${task.id}`,
				eventKey: `project-task:overdue:${task.id}`
			});
		}
	},

	async scanApprovalOverdue(c) {
		const {results} = await c.env.db.prepare(
			`SELECT id, title, approver_id, due_at FROM approvals
			 WHERE is_del = 0 AND status = 'pending' AND approver_id IS NOT NULL
			 AND due_at IS NOT NULL AND datetime(due_at) < datetime('now')`
		).all();
		for (const row of results || []) {
			await notificationService.notify(c, {
				userId: row.approver_id,
				type: 'approval',
				title: `Approval overdue: ${row.title || ''}`,
				body: `Was due ${row.due_at}`,
				link: `/approvals/${row.id}`,
				eventKey: `approval:overdue:${row.id}`
			});
		}
	},

	async scanRequestOverdue(c) {
		const {results} = await c.env.db.prepare(
			`SELECT id, title, recipient_id, due_date FROM internal_requests
			 WHERE is_del = 0 AND recipient_id IS NOT NULL
			 AND status IN ('pending','pending_approval','accepted','in_progress')
			 AND due_date IS NOT NULL AND datetime(due_date) < datetime('now')`
		).all();
		for (const row of results || []) {
			await notificationService.notify(c, {
				userId: row.recipient_id,
				type: 'request',
				title: `Request overdue: ${row.title || ''}`,
				body: `Was due ${row.due_date}`,
				link: `/requests/${row.id}`,
				eventKey: `request:overdue:${row.id}`
			});
		}
	},

	// Finance reminders: upcoming subscription renewals, overdue invoices and
	// overdue debts. Each delivery carries a stable event_key keyed on the
	// record + the date it became actionable, so re-scanning the same day never
	// duplicates but a new day's overdue fires once.
	async scanFinanceReminders(c) {
		await this.scanSubscriptionRenewals(c);
		await this.scanOverdueInvoices(c);
		await this.scanOverdueDebts(c);
	},

	async scanSubscriptionRenewals(c) {
		// Active subscriptions billing within the next 7 days. owner_id is the
		// person who should be nudged; fall back to created_by, else the first
		// finance approver, so a reminder is never silently dropped.
		const {results} = await c.env.db.prepare(
			`SELECT id, service, amount_cents, currency, next_billing_date, owner_id, created_by
			 FROM finance_subscription
			 WHERE status = 'active' AND next_billing_date IS NOT NULL
			 AND date(next_billing_date) <= date('now', '+7 days')`
		).all();
		for (const sub of results || []) {
			const recipient = await this.financeRecipient(c, sub.owner_id, sub.created_by);
			if (!recipient) continue;
			const day = String(sub.next_billing_date).slice(0, 10);
			await notificationService.notify(c, {
				userId: recipient,
				type: 'reminder',
				title: `Subscription renews soon: ${sub.service || 'Subscription'}`,
				body: `${sub.currency || 'KES'} ${this.minor(sub.amount_cents)} due ${day}`,
				link: `/finance?section=subscriptions`,
				eventKey: `finance:subscription:${sub.id}:${day}`
			});
		}
	},

	async scanOverdueInvoices(c) {
		const {results} = await c.env.db.prepare(
			`SELECT id, invoice_number, client_name, total_cents, paid_cents, currency, due_date, user_id
			 FROM finance_invoices
			 WHERE is_del = 0 AND status NOT IN ('paid','cancelled','draft')
			 AND due_date IS NOT NULL AND date(due_date) < date('now')
			 AND COALESCE(total_cents, amount_cents) - COALESCE(paid_cents, 0) > 0`
		).all();
		for (const inv of results || []) {
			const recipient = await this.financeRecipient(c, inv.user_id, null);
			if (!recipient) continue;
			const day = String(inv.due_date).slice(0, 10);
			const balance = (Number(inv.total_cents) || Number(inv.amount_cents) || 0) - (Number(inv.paid_cents) || 0);
			await notificationService.notify(c, {
				userId: recipient,
				type: 'reminder',
				title: `Invoice overdue: ${inv.invoice_number || inv.client_name || ''}`.trim(),
				body: `${inv.currency || 'KES'} ${this.minor(balance)} outstanding, was due ${day}`,
				link: `/finance?section=invoices`,
				eventKey: `finance:invoice-overdue:${inv.id}:${day}`
			});
		}
	},

	async scanOverdueDebts(c) {
		const {results} = await c.env.db.prepare(
			`SELECT id, name, currency, due_date, created_by
			 FROM finance_debt
			 WHERE is_del = 0 AND status NOT IN ('paid','cancelled','disputed')
			 AND due_date IS NOT NULL AND date(due_date) < date('now')`
		).all();
		for (const debt of results || []) {
			const recipient = await this.financeRecipient(c, null, debt.created_by);
			if (!recipient) continue;
			const day = String(debt.due_date).slice(0, 10);
			await notificationService.notify(c, {
				userId: recipient,
				type: 'reminder',
				title: `Debt overdue: ${debt.name || ''}`.trim(),
				body: `Was due ${day}`,
				link: `/finance?section=debts`,
				eventKey: `finance:debt-overdue:${debt.id}:${day}`
			});
		}
	},

	// Prefer the explicit owner, then the creator, then any active finance
	// approver so company-wide finance items still reach someone. A user's role
	// is user.type, which maps to role_perm.role_id (see perm-service).
	async financeRecipient(c, ownerId, createdBy) {
		if (ownerId) return ownerId;
		if (createdBy) return createdBy;
		const {results} = await c.env.db.prepare(
			`SELECT DISTINCT u.user_id FROM user u
			 JOIN role_perm rp ON rp.role_id = u.type
			 JOIN perm p ON p.perm_id = rp.perm_id
			 WHERE p.perm_key = 'finance:approve' AND u.is_del = 0
			 ORDER BY u.user_id ASC LIMIT 1`
		).all();
		return results && results[0] ? results[0].user_id : null;
	},

	minor(cents) {
		const value = Number(cents) || 0;
		return (value / 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
	}
};

export default reminderService;