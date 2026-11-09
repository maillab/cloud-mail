import {useSettingStore} from "@/store/setting.js";
export function cvtR2Url(key) {

    if (!key) {
        return ''
    }

    if (key.startsWith('https://') || key.startsWith('http://')) {
        return key
    }

    const { settings } = useSettingStore();

    let domain = settings.r2Domain

    // No public CDN domain: serve via this site's /attachments|/static|/oss proxy
    if (!domain) {
        return '/' + String(key).replace(/^\//, '')
    }

    if (!domain.startsWith('http')) {
        return 'https://' + domain + '/' + key
    }

    if (domain.endsWith("/")) {
        domain = domain.slice(0, -1);
    }
    return domain + '/' + key
}

export function toOssDomain(domain) {

    if (!domain) {
        return ''
    }

    if (!domain.startsWith('http')) {
        return 'https://' + domain
    }

    if (domain.endsWith("/")) {
        domain = domain.slice(0, -1);
    }

    return domain
}
