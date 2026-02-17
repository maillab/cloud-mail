import emailUtils from '../utils/email-utils';
import dayjs from 'dayjs';

// Template asli untuk notifikasi penerimaan email
export default function emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText) {

	let template = `<b>${email.subject}</b>`

		if (tgMsgFrom === 'only-name') {
			template += `

From\u200B：${email.name}`
		}

		if (tgMsgFrom === 'show') {
			template += `

From\u200B：${email.name}  &lt;${email.sendEmail}&gt;`
		}

		if(tgMsgTo === 'show' && tgMsgFrom === 'hide') {
			template += `

To：\u200B${email.toEmail}`

		} else if(tgMsgTo === 'show') {
		template += `
To：\u200B${email.toEmail}`
	}

	const text = (emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content))
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	if(tgMsgText === 'show') {
		template += `

${text}`
	}

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
⏰ Time: ${dayjs(userInfo.activeTime).format('YYYY-MM-DD HH:mm:ss')}`;
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
⏰ Time: ${dayjs(userInfo.createTime).format('YYYY-MM-DD HH:mm:ss')}`;
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
${text ? `\n💬 Preview: ${text}${emailInfo.text?.length > 200 ? '...' : ''}` : ''}
📍 Sender IP: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
⏰ Time: ${dayjs(emailInfo.createTime).format('YYYY-MM-DD HH:mm:ss')}`;
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
⏰ Time: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;
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
⏰ Time: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;
}

// Template untuk notifikasi penghapusan address
export function deleteAddressMsgTemplate(addressEmail, userInfo, remainingAddresses) {
	return `❌ <b>Address Deleted</b>

📧 User: <code>${userInfo.email}</code>
📬 Deleted Address: <code>${addressEmail}</code>
🔢 Remaining Addresses: ${remainingAddresses}
📍 IP Address: <code>${userInfo.activeIp}</code>
💻 Device: ${userInfo.device || 'Unknown'} / ${userInfo.os || 'Unknown'}
⏰ Time: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;
}
