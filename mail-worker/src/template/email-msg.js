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
		const localTime = dayjs(timestamp).tz(userTimezone).format('YYYY-MM-DD HH:mm:ss');
		return `⏰ Server Time (UTC): ${utcTime}\n🌍 Local Time (${userTimezone}): ${localTime}`;
	}
	
	return `⏰ Time (UTC): ${utcTime}`;
}

// Template untuk notifikasi penerimaan email (UPDATED - dengan dual time)
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

	template += `

${formatDualTime(email.createTime, senderTimezone)}`

	return template;

}

// Template untuk notifikasi login
export function loginMsgTemplate(userInfo) {
	return `🔐 <b>User Login</b>

📧 Email: <code>${userInfo.email}</code>
📍 IP Address: <code>${userInfo.activeIp}</code>
📱 Device: ${userInfo.device || 'Unknown'}
💻 OS: ${userInfo.os || 'Unknown'}
🌐 Browser: ${userInfo.browser || 'Unknown'}
${formatDualTime(userInfo.activeTime, userInfo.timezone)}`;
}

// Template untuk notifikasi registrasi
export function registerMsgTemplate(userInfo, accountCount) {
	return `✅ <b>New User Registration</b>

📧 Email: <code>${userInfo.email}</code>
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
	
	return `📤 <b>Email Sent</b>

📧 From: <code>${emailInfo.sendEmail}</code>
📨 To: <code>${recipientList}</code>
📝 Subject: <b>${emailInfo.subject}</b>
${text ? `💬 Preview: ${text}${(emailInfo.text?.length > 200 || emailInfo.content?.length > 200) ? '...' : ''}

` : ''}📍 Sender IP: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
${formatDualTime(emailInfo.createTime, userInfo.timezone)}`;
}

// Template untuk notifikasi penghapusan email
export function deleteEmailMsgTemplate(emailIds, userInfo) {
	const idArray = emailIds.split(',');
	const count = idArray.length;
	
	return `🗑️ <b>Email Deleted</b>

📧 User: <code>${userInfo.email}</code>
🔢 Email Count: ${count}
📋 Email IDs: <code>${emailIds}</code>
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), userInfo.timezone)}`;
}

// Template untuk notifikasi penambahan address
export function addAddressMsgTemplate(addressInfo, userInfo, totalAddresses) {
	return `➕ <b>Address Added</b>

📧 User: <code>${userInfo.email}</code>
📬 New Address: <code>${addressInfo.email}</code>
📝 Name: ${addressInfo.name}
🔢 Total Addresses: ${totalAddresses}
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), userInfo.timezone)}`;
}

// Template untuk notifikasi penghapusan address
export function deleteAddressMsgTemplate(addressEmail, userInfo, remainingAddresses) {
	return `❌ <b>Address Deleted</b>

📧 User: <code>${userInfo.email}</code>
📬 Deleted Address: <code>${addressEmail}</code>
🔢 Remaining Addresses: ${remainingAddresses}
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
${formatDualTime(new Date().toISOString(), userInfo.timezone)}`;
}
