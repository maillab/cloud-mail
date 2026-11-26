import { defineStore } from 'pinia'
import {hasPerm} from "@/perm/perm.js";

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
        theme: 'dark',
        dark: true,
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
    }),
    getters: {
        isDark() {
            return true;
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
        // Every way of starting a message (the sidebar button, the header, the
        // keyboard shortcut) goes through here, so the permission gate and the
        // writer reference live in exactly one place.
        openCompose() {
            if (!hasPerm('email:send')) return false
            if (!this.writerRef?.open) return false
            this.writerRef.open()
            return true
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
