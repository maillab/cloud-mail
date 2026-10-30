import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'
import 'dayjs/locale/ja'
import 'dayjs/locale/ko'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import {useSettingStore} from "@/store/setting.js";
const settingStore = useSettingStore();
dayjs.extend(utc)
dayjs.extend(timezone)

// 前端语言 -> dayjs locale
export function toDayjsLocale(lang) {
    switch (lang) {
        case 'en': return 'en'
        case 'zh-TW': return 'zh-tw'
        case 'ja': return 'ja'
        case 'ko': return 'ko'
        default: return 'zh-cn'
    }
}

dayjs.locale(toDayjsLocale(settingStore.lang))
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// 相对时间文案（fromNow 的 CJK 分支用）
const REL_WORDS = {
    'zh': {'justNow': '几秒前', 'minAgo': '分钟前', 'hourAgo': '1小时前', 'yesterday': '昨天', 'dayBefore': '前天'},
    'zh-TW': {'justNow': '幾秒前', 'minAgo': '分鐘前', 'hourAgo': '1小時前', 'yesterday': '昨天', 'dayBefore': '前天'},
    'ja': {'justNow': 'たった今', 'minAgo': '分前', 'hourAgo': '1時間前', 'yesterday': '昨日', 'dayBefore': '一昨日'},
    'ko': {'justNow': '방금', 'minAgo': '분 전', 'hourAgo': '1시간 전', 'yesterday': '어제', 'dayBefore': '그저께'},
}

export function fromNow(date) {
    const d = dayjs.utc(date).tz(timeZone);
    const now = dayjs();
    const diffSeconds = now.diff(d, 'second');
    const diffMinutes = now.diff(d, 'minute');
    const diffHours = now.diff(d, 'hour');
    const isToday = now.isSame(d, 'day');
    const lang = settingStore.lang;
    if (lang === 'en') {

        if (isToday) {
            if (diffSeconds < 60) return `Just now`;
            if (diffMinutes < 60) return `${diffMinutes} min ago`;
            if (diffHours < 2) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            return d.format('hh:mm A');
        }

        if (now.subtract(1, 'day').isSame(d, 'day')) {
            return d.format('MMM D');
        }

        return d.year() === now.year()
            ? d.format('MMM D')
            : d.format('YYYY/MM/DD');


    } else {

        const w = REL_WORDS[lang] || REL_WORDS['zh'];
        const mdFmt = lang === 'ko' ? 'M월 D일' : 'M月D日';

        if (isToday) {
            if (diffSeconds < 60) return w.justNow;
            if (diffMinutes < 60) return `${diffMinutes}${w.minAgo}`;
            if (diffHours >= 1 && diffHours < 2) return w.hourAgo;
            return d.format('HH:mm');
        }
        else if (now.subtract(1, 'day').isSame(d, 'day')) {
            return `${w.yesterday} ${d.format('HH:mm')}`;
        }
        else if (now.subtract(2, 'day').isSame(d, 'day')) {
            return `${w.dayBefore} ${d.format('HH:mm')}`;
        }
        return d.year() === now.year()
            ? d.format(mdFmt)
            : d.format('YYYY/M/D');

    }

}

export function formatDetailDate(time) {
    const d = dayjs.utc(time).tz(timeZone);
    const now = dayjs();

    const isSameYear = now.year() === d.year();
    const lang = settingStore.lang;

    if (lang === 'en') {
        return isSameYear
            ? d.format('ddd, MMM D, h:mm A')
            : d.format('ddd, MMM D, YYYY, h:mm A');
    } else if (lang === 'ko') {
        return isSameYear
            ? d.format('M월 D일(ddd) A h:mm')
            : d.format('YYYY년 M월 D일(ddd) A h:mm');
    } else {
        return d.format('YYYY年M月D日 ddd AH:mm');
    }
}

export function tzDayjs(time) {
    return dayjs.utc(time).tz(timeZone)
}

export function toUtc(time) {
    return dayjs(time).utc()
}

export function setExtend(lang) {
    dayjs.locale(lang)
}
