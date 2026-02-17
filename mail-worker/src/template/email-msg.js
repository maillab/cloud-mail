import emailUtils from '../utils/email-utils';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// Helper function untuk format waktu dengan dual timezone
function formatDualTime(timestamp, userTimezone = null) {
	const utcTime = dayjs(timestamp).utc().format('YYYY-MM-DD HH:mm:ss');
	
	if (userTimezone) {
		try {
			const localTime = dayjs(timestamp).tz(userTimezone).format('YYYY-MM-DD HH:mm:ss');
			const offset = dayjs(timestamp).tz(userTimezone).format('Z');
			return `⏰ Server (UTC): ${utcTime}\n🌍 Local (${userTimezone} UTC${offset}): ${localTime}`;
		} catch (e) {
			console.error('Invalid timezone:', userTimezone, e);
		}
	}
	
	return `⏰ Time (UTC): ${utcTime}`;
}

// Helper untuk format role info
function formatRoleInfo(roleInfo) {
	if (!roleInfo) return '';
	
	let roleText = `\n👤 Role: <b>${roleInfo.name || 'Unknown'}</b>`;
	
	// Tambahkan info send limit jika ada
	if (roleInfo.sendCount !== undefined && roleInfo.sendCount !== null) {
		if (roleInfo.sendType === 'day') {
			roleText += `\n📊 Send Limit: ${roleInfo.sendCount} emails/day`;
		} else if (roleInfo.sendType === 'count') {
			roleText += `\n📊 Send Limit: ${roleInfo.sendCount} emails total`;
		} else if (roleInfo.sendType === 'ban') {
			roleText += `\n🚫 Send Status: Banned`;
		} else if (roleInfo.sendType === 'internal') {
			roleText += `\n📨 Send Status: Internal only`;
		}
	}
	
	// Tambahkan info account limit jika ada
	if (roleInfo.accountCount !== undefined && roleInfo.accountCount > 0) {
		roleText += `\n📬 Address Limit: ${roleInfo.accountCount}`;
	}
	
	return roleText;
}

// Template untuk notifikasi penerimaan email
export default function emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText, senderTimezone = null) {

	let template = `📨 <b>Email Received</b>

📧 To: <code>${email.toEmail}</code>`

	if (tgMsgFrom === 'only-name') {
		template += `
📤 From: ${email.name}`
	}

	if (tgMsgFrom === 'show') {
		template += `
📤 From: ${email.name} &lt;${email.sendEmail}&gt;`
	}

	template += `
📝 Subject: <b>${email.subject}</b>`

	const text = (emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content))
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.substring(0, 200);

	if(tgMsgText === 'show' && text) {
		template += `

💬 Preview: ${text}${(email.text?.length > 200 || email.content?.length > 200) ? '...' : ''}`
	}

	// Tambahkan info attachments jika ada
	if (email.attachmentCount > 0) {
		template += `
📎 Attachments: ${email.attachmentCount} file(s)`;
	}

	template += `

${formatDualTime(email.createTime, senderTimezone)}`

	return template;

}

// Template untuk notifikasi login
export function loginMsgTemplate(userInfo) {
	return `🔐 <b>User Login</b>

📧 Email: <code>${userInfo.email}</code>${formatRoleInfo(userInfo.role)}
📍 IP Address: <code>${userInfo.activeIp}</code>
📱 Device: ${userInfo.device || 'Unknown'}
💻 OS: ${userInfo.os || 'Unknown'}
🌐 Browser: ${userInfo.browser || 'Unknown'}
${userInfo.loginCount ? `🔢 Total Logins: ${userInfo.loginCount}\n` : ''}${formatDualTime(userInfo.activeTime, userInfo.timezone)}`;
}

// Template untuk notifikasi registrasi
export function registerMsgTemplate(userInfo, accountCount, roleInfo = null) {
	return `✅ <b>New User Registration</b>

📧 Email: <code>${userInfo.email}</code>${formatRoleInfo(roleInfo)}
📬 Addresses: ${accountCount}
📍 Registration IP: <code>${userInfo.createIp}</code>
📱 Device: ${userInfo.device || 'Unknown'}
💻 OS: ${userInfo.os || 'Unknown'}
🌐 Browser: ${userInfo.browser || 'Unknown'}
${formatDualTime(userInfo.createTime, userInfo.timezone)}`;
}

// Template untuk notifikasi pengiriman email
export function sendEmailMsgTemplate(emailInfo, userInfo) {
	const recipients = JSON.parse(emailInfo.recipient || '[]');
	const recipientList = recipients.map(r => r.address).join(', ');
	
	const text = (emailUtils.formatText(emailInfo.text) || emailUtils.htmlToText(emailInfo.content))
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.substring(0, 200);
	
	let template = `📤 <b>Email Sent</b>

📧 From: <code>${emailInfo.sendEmail}</code>${formatRoleInfo(userInfo.role)}
📨 To: <code>${recipientList}</code>
📝 Subject: <b>${emailInfo.subject}</b>`;

	if (text) {
		template += `
💬 Preview: ${text}${(emailInfo.text?.length > 200 || emailInfo.content?.length > 200) ? '...' : ''}`;
	}

	// Tambahkan info attachments jika ada
	if (emailInfo.attachmentCount > 0) {
		template += `
📎 Attachments: ${emailInfo.attachmentCount} file(s)`;
	}

	template += `

📍 Sender IP: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}`;

	// Tambahkan info send quota jika ada
	if (userInfo.sendCount !== undefined && userInfo.role?.sendCount) {
		const remaining = userInfo.role.sendCount - userInfo.sendCount;
		template += `
📊 Quota: ${userInfo.sendCount}/${userInfo.role.sendCount} (${remaining} remaining)`;
	}

	template += `
${formatDualTime(emailInfo.createTime, userInfo.timezone)}`;

	return template;
}

// Template untuk notifikasi penghapusan email
export function deleteEmailMsgTemplate(emailIds, userInfo) {
	const idArray = emailIds.split(',');
	const count = idArray.length;
	
	return `🗑️ <b>Email Deleted</b>

📧 User: <code>${userInfo.email}</code>${formatRoleInfo(userInfo.role)}
🔢 Email Count: ${count}
📋 Email IDs: <code>${emailIds}</code>
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), userInfo.timezone)}`;
}

// Template untuk notifikasi penambahan address
export function addAddressMsgTemplate(addressInfo, userInfo, totalAddresses) {
	return `➕ <b>Address Added</b>

📧 User: <code>${userInfo.email}</code>${formatRoleInfo(userInfo.role)}
📬 New Address: <code>${addressInfo.email}</code>
📝 Name: ${addressInfo.name}
🔢 Total Addresses: ${totalAddresses}${userInfo.role?.accountCount ? `/${userInfo.role.accountCount}` : ''}
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), userInfo.timezone)}`;
}

// Template untuk notifikasi penghapusan address
export function deleteAddressMsgTemplate(addressEmail, userInfo, remainingAddresses) {
	return `❌ <b>Address Deleted</b>

📧 User: <code>${userInfo.email}</code>${formatRoleInfo(userInfo.role)}
📬 Deleted Address: <code>${addressEmail}</code>
🔢 Remaining Addresses: ${remainingAddresses}${userInfo.role?.accountCount ? `/${userInfo.role.accountCount}` : ''}
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), userInfo.timezone)}`;
}

// Template untuk notifikasi perubahan role
export function roleChangeMsgTemplate(userInfo, oldRole, newRole, changedBy) {
	return `🔄 <b>Role Changed</b>

📧 User: <code>${userInfo.email}</code>
📍 IP Address: <code>${userInfo.activeIp}</code>

<b>Role Update:</b>
❌ Old Role: <b>${oldRole.name}</b>
${oldRole.sendCount ? `   ├ Send Limit: ${oldRole.sendCount}${oldRole.sendType === 'day' ? '/day' : ' total'}\n` : ''}${oldRole.accountCount ? `   └ Address Limit: ${oldRole.accountCount}\n` : ''}
✅ New Role: <b>${newRole.name}</b>
${newRole.sendCount ? `   ├ Send Limit: ${newRole.sendCount}${newRole.sendType === 'day' ? '/day' : ' total'}\n` : ''}${newRole.accountCount ? `   └ Address Limit: ${newRole.accountCount}\n` : ''}
👨‍💼 Changed By: <code>${changedBy.email}</code>${formatRoleInfo(changedBy.role)}
💻 Device: ${changedBy.device || 'Unknown'} / ${changedBy.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), changedBy.timezone)}`;
}

// Template untuk notifikasi perubahan status user (ban/unban)
export function userStatusChangeMsgTemplate(userInfo, oldStatus, newStatus, changedBy) {
	const statusText = {
		0: '✅ Active',
		1: '🚫 Banned'
	};
	
	return `⚠️ <b>User Status Changed</b>

📧 User: <code>${userInfo.email}</code>${formatRoleInfo(userInfo.role)}
📍 User IP: <code>${userInfo.activeIp || 'Unknown'}</code>

<b>Status Update:</b>
Old: ${statusText[oldStatus] || 'Unknown'}
New: ${statusText[newStatus] || 'Unknown'}

👨‍💼 Changed By: <code>${changedBy.email}</code>${formatRoleInfo(changedBy.role)}
📍 Admin IP: <code>${changedBy.activeIp}</code>
💻 Device: ${changedBy.device || 'Unknown'} / ${changedBy.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), changedBy.timezone)}`;
}

// Template untuk notifikasi password reset
export function passwordResetMsgTemplate(userInfo) {
	return `🔐 <b>Password Reset</b>

📧 User: <code>${userInfo.email}</code>${formatRoleInfo(userInfo.role)}
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
🌐 Browser: ${userInfo.browser || 'Unknown'}
${formatDualTime(new Date().toISOString(), userInfo.timezone)}`;
}

// Template untuk notifikasi user deletion (self-delete)
export function userSelfDeleteMsgTemplate(userInfo) {
	return `⚠️ <b>User Self-Deleted Account</b>

📧 Email: <code>${userInfo.email}</code>${formatRoleInfo(userInfo.role)}
📬 Addresses: ${userInfo.addressCount || 0}
📨 Total Emails: ${userInfo.emailCount || 0}
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
📅 Account Age: ${userInfo.accountAge || 'Unknown'}
${formatDualTime(new Date().toISOString(), userInfo.timezone)}`;
}

// Template untuk notifikasi admin deletion
export function adminDeleteUserMsgTemplate(deletedUser, adminUser) {
	return `🗑️ <b>User Deleted by Admin</b>

<b>Deleted User:</b>
📧 Email: <code>${deletedUser.email}</code>${formatRoleInfo(deletedUser.role)}
📬 Addresses: ${deletedUser.addressCount || 0}
📨 Total Emails: ${deletedUser.emailCount || 0}

<b>Deleted By:</b>
👨‍💼 Admin: <code>${adminUser.email}</code>${formatRoleInfo(adminUser.role)}
📍 IP Address: <code>${adminUser.activeIp}</code>
💻 Device: ${adminUser.device || 'Unknown'} / ${adminUser.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), adminUser.timezone)}`;
}

// Template untuk notifikasi failed login attempts
export function failedLoginMsgTemplate(email, ip, attempts, device, os, browser, timezone) {
	return `⚠️ <b>Failed Login Attempt${attempts > 1 ? 's' : ''}</b>

📧 Email: <code>${email}</code>
🔢 Attempts: ${attempts}
📍 IP Address: <code>${ip}</code>
💻 Device: ${device || 'Unknown'} / ${os || 'Unknown'}
🌐 Browser: ${browser || 'Unknown'}
${formatDualTime(new Date().toISOString(), timezone)}

${attempts >= 3 ? '⚠️ <b>Warning:</b> Multiple failed attempts detected!' : ''}`;
}

// Template untuk notifikasi quota warning
export function quotaWarningMsgTemplate(userInfo, quotaType) {
	let warningText = '';
	
	if (quotaType === 'send') {
		const remaining = userInfo.role.sendCount - userInfo.sendCount;
		const percentage = (remaining / userInfo.role.sendCount * 100).toFixed(0);
		warningText = `📤 Send Quota: ${userInfo.sendCount}/${userInfo.role.sendCount} (${remaining} remaining - ${percentage}%)`;
	} else if (quotaType === 'address') {
		const remaining = userInfo.role.accountCount - userInfo.addressCount;
		const percentage = (remaining / userInfo.role.accountCount * 100).toFixed(0);
		warningText = `📬 Address Quota: ${userInfo.addressCount}/${userInfo.role.accountCount} (${remaining} remaining - ${percentage}%)`;
	}
	
	return `⚠️ <b>Quota Warning</b>

📧 User: <code>${userInfo.email}</code>${formatRoleInfo(userInfo.role)}
${warningText}

⚠️ User approaching quota limit!`;
}
