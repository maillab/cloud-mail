import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
    state: () => ({
        asideShow: window.innerWidth > 1024,
        asideCollapse: false,
        accountShow: false,
        accountPanel: false,
        backgroundLoading: true,
        changeNotice: 0,
        writerRef: null,
        changePreview: 0,
        previewData: {},
        key: 0,
        dark: false,
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
    }),
    actions: {
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        },
        toggleAccountPanel() {
            this.accountPanel = !this.accountPanel
        },
        closeAccountPanel() {
            this.accountPanel = false
        }
    },
    persist: {
        pick: ['accountShow','dark','asideCollapse'],
    },
})
