import BizError from '../error/biz-error.js';
import { t } from '../i18n/i18n.js';
import { emailConst, isDel, userConst } from '../const/entity-const';

function requireAdmin(c) {
	// 查看全部邮件可以授权给角色，转移邮件归属只允许管理员
	if (!c.get('user')?.email || c.get('user').email !== c.env.admin) {
		throw new BizError(t('claimAdminOnly'), 403);
	}
}

function positiveId(value) {
	if (!['string', 'number'].includes(typeof value)
		|| !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
		throw new BizError(t('claimInvalidId'), 400);
	}
	return Number(value);
}

async function unclaimedMessage(c, emailId) {
	const message = await c.env.db.prepare(`
		SELECT email_id AS emailId, to_email AS toEmail
		FROM email
		WHERE email_id = ? AND user_id = 0 AND account_id = 0
		  AND status = ? AND type = ? AND is_del = ?
	`).bind(emailId, emailConst.status.NOONE, emailConst.type.RECEIVE, isDel.NORMAL).first();
	if (!message) throw new BizError(t('claimNotUnclaimed'), 409);
	return message;
}

const mailClaimService = {
	async accounts(c, params) {
		requireAdmin(c);
		const message = await unclaimedMessage(c, positiveId(params?.emailId));
		// 按 SMTP 信封收件人匹配，不信任可伪造的 To 头
		const { results } = await c.env.db.prepare(`
			SELECT a.account_id AS accountId, a.email, u.email AS userEmail
			FROM account a JOIN user u ON u.user_id = a.user_id
			WHERE a.email = ? COLLATE NOCASE AND a.is_del = ?
			  AND u.is_del = ? AND u.status = ?
		`).bind(message.toEmail, isDel.NORMAL, isDel.NORMAL, userConst.status.NORMAL).all();
		return { toEmail: message.toEmail, accounts: results };
	},

	async claim(c, params) {
		requireAdmin(c);
		const emailId = positiveId(params?.emailId);
		const accountId = positiveId(params?.accountId);
		const message = await unclaimedMessage(c, emailId);
		const target = await c.env.db.prepare(`
			SELECT a.account_id AS accountId, a.user_id AS userId
			FROM account a JOIN user u ON u.user_id = a.user_id
			WHERE a.account_id = ? AND a.email = ? COLLATE NOCASE
			  AND a.is_del = ? AND u.is_del = ? AND u.status = ?
		`).bind(accountId, message.toEmail, isDel.NORMAL, isDel.NORMAL, userConst.status.NORMAL).first();
		if (!target) throw new BizError(t('claimTargetUnavailable'), 409);

		// D1 batch 是事务：附件更新失败时邮件归属一起回滚
		// 写入时再次校验邮件和目标邮箱，避免读写之间的并发竞争
		const [updated] = await c.env.db.batch([
			c.env.db.prepare(`
				UPDATE email SET user_id = ?, account_id = ?, status = ?
				WHERE email_id = ? AND user_id = 0 AND account_id = 0
				  AND status = ? AND type = ? AND is_del = ?
				  AND EXISTS (
					SELECT 1 FROM account a JOIN user u ON u.user_id = a.user_id
					WHERE a.account_id = ? AND a.user_id = ?
					  AND a.email = email.to_email COLLATE NOCASE
					  AND a.is_del = ? AND u.is_del = ? AND u.status = ?
				  )
				RETURNING email_id AS emailId, user_id AS userId,
					account_id AS accountId, status
			`).bind(target.userId, accountId, emailConst.status.RECEIVE, emailId,
				emailConst.status.NOONE, emailConst.type.RECEIVE, isDel.NORMAL,
				accountId, target.userId, isDel.NORMAL, isDel.NORMAL, userConst.status.NORMAL),
			c.env.db.prepare(`
				UPDATE attachments SET user_id = ?, account_id = ?
				WHERE email_id = ?
				  AND EXISTS (
					SELECT 1 FROM email WHERE email_id = ? AND user_id = ?
					  AND account_id = ? AND status = ? AND is_del = ?
				  )
			`).bind(target.userId, accountId, emailId, emailId, target.userId,
				accountId, emailConst.status.RECEIVE, isDel.NORMAL)
		]);
		if (!updated.results?.length) throw new BizError(t('claimNotUnclaimed'), 409);
		return updated.results[0];
	}
};

export default mailClaimService;
