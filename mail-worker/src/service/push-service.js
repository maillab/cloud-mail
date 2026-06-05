import emailUtils from '../utils/email-utils';

const pushService = {
    async sendPush(c, emailRow, settings) {
        const { subject, name, sendEmail, text, content, code } = emailRow;
        const bodyText = emailUtils.formatText(text) || emailUtils.htmlToText(content);
        const title = subject || 'New Email';
        const message = `From: ${name} <${sendEmail}>\n\n${bodyText}`;

        // 1. Bark (iOS)
        if (settings.barkUrl) {
            await this.pushToBark(settings.barkUrl, title, message, code);
        }

        // 2. Pushover (iOS & Android)
        if (settings.pushoverUser && settings.pushoverToken) {
            await this.pushToPushover(settings.pushoverUser, settings.pushoverToken, title, message);
        }

        // 3. ntfy (iOS & Android)
        if (settings.ntfyTopic) {
            await this.pushToNtfy(settings.ntfyTopic, settings.ntfyServer || 'https://ntfy.sh', title, message);
        }
    },

    async pushToBark(barkUrl, title, message, code) {
        try {
            const url = new URL(barkUrl);
            const key = url.pathname.split('/').filter(Boolean)[0];
            const baseUrl = url.origin;
            const pushUrl = `${baseUrl}/${key}/${encodeURIComponent(title)}/${encodeURIComponent(message)}?autoCopy=1&copy=${code || ''}`;
            await fetch(pushUrl);
        } catch (e) {
            console.error('Bark push failed:', e);
        }
    },

    async pushToPushover(user, token, title, message) {
        try {
            const res = await fetch('https://api.pushover.net/1/messages.json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token,
                    user: user,
                    title: title,
                    message: message
                })
            });
            if (!res.ok) {
                console.error(`Pushover push failed status: ${res.status} response: ${await res.text()}`);
            }
        } catch (e) {
            console.error('Pushover push failed:', e);
        }
    },

    async pushToNtfy(topic, server, title, message) {
        try {
            const res = await fetch(`${server}/${topic}`, {
                method: 'POST',
                headers: {
                    'Title': encodeURIComponent(title)
                },
                body: message
            });
            if (!res.ok) {
                console.error(`ntfy push failed status: ${res.status} response: ${await res.text()}`);
            }
        } catch (e) {
            console.error('ntfy push failed:', e);
        }
    }
};

export default pushService;
