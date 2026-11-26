import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
const user = sqliteTable('user', {
	userId: integer('user_id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	type: integer('type').default(1).notNull(),
	password: text('password').notNull(),
	salt: text('salt').notNull(),
	status: integer('status').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
	activeTime: text('active_time'),
	createIp: text('create_ip'),
	activeIp: text('active_ip'),
	os: text('os'),
	browser: text('browser'),
	device: text('device'),
	sort: text('sort').default(0),
	sendCount: text('send_count').default(0),
	regKeyId: integer('reg_key_id').default(0).notNull(),
	signatureImageKey: text('signature_image_key'),
	// The downscaled asset actually embedded in outgoing mail. The master is kept
	// only so the image can be replaced or re-derived later.
	signatureDeliveryKey: text('signature_delivery_key'),
	signatureText: text('signature_text').default('').notNull(),
	signature: text('signature').default('').notNull(),
	signatureSettings: text('signature_settings').default('{}').notNull(),
	// --- Canonical internal identity ---
	displayName: text('display_name'),
	username: text('username'),
	avatarKey: text('avatar_key'),
	jobTitle: text('job_title').default('').notNull(),
	phone: text('phone'),
	teamId: integer('team_id'),
	lastSeenAt: text('last_seen_at'),
	// --- Security state ---
	// Encrypted with a key derived from the deployment secret; never plaintext.
	mfaEnabled: integer('mfa_enabled').default(0).notNull(),
	mfaSecretEnc: text('mfa_secret_enc'),
	mfaEnrolledAt: text('mfa_enrolled_at'),
	mfaRecoveryGeneratedAt: text('mfa_recovery_generated_at'),
	// 'none' | 'login' | 'admin' | 'expired'
	passwordChangeRequired: text('password_change_required').default('none').notNull(),
	passwordChangedAt: text('password_changed_at'),
	onboardingStartedAt: text('onboarding_started_at'),
	onboardingCompletedAt: text('onboarding_completed_at'),
	suspendedReason: text('suspended_reason').default('').notNull(),
	isDel: integer('is_del').default(0).notNull()
});
export default user
