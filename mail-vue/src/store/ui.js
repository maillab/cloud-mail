import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
    state: () => ({
        asideShow: window.innerWidth > 700,
        asideCollapsed: false,
        accountShow: false,
        backgroundLoading: true,
        changeNotice: 0,
        writerRef: null,
        changePreview: 0,
        previewData: {},
        key: 0,
        theme: 'system',
        dark: false,
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
    }),
    getters: {
        isDark(state) {
            if (state.theme === 'dark') return true;
            if (state.theme === 'light') return false;
            if (typeof window !== 'undefined' && window.matchMedia) {
                return window.matchMedia('(prefers-color-scheme: dark)').matches;
            }
            return false;
        }
    },
    actions: {
        setTheme(newTheme) {
            this.theme = newTheme;
            this.applyTheme();
        },
        applyTheme() {
            const dark = this.isDark;
            this.dark = dark;
            if (typeof document !== 'undefined') {
                document.documentElement.classList.toggle('dark', dark);
                const isMobile = typeof window !== 'undefined' && !window.matchMedia("(pointer: fine) and (hover: hover)").matches;
                document.getElementById('theme-color-meta')?.setAttribute(
                    'content',
                    dark ? (isMobile ? '#110e0c' : '#050403') : (isMobile ? '#f8f7f5' : '#ffffff')
                );
            }
        },
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        }
    },
    persist: {
        pick: ['accountShow','asideCollapsed','theme','dark'],
    },
})
