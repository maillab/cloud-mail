import { defineStore } from 'pinia'
import { emailUnreadCount } from '@/request/email.js'

let refreshTask = null
let refreshAgain = false
let refreshTimer = null

export const useUnreadStore = defineStore('unread', {
    state: () => ({
        total: 0,
        byAccount: {},
    }),
    getters: {
        accountCount: (state) => (accountId) => state.byAccount[accountId] || 0,
    },
    actions: {
        apply(data) {
            const map = {}
            for (const item of data?.list || []) {
                const count = Number(item.count) || 0
                if (count > 0) {
                    map[item.accountId] = count
                }
            }
            this.byAccount = map
            this.total = Number(data?.total) || Object.values(map).reduce((sum, count) => sum + count, 0)
        },
        refresh() {
            if (!localStorage.getItem('token')) {
                this.total = 0
                this.byAccount = {}
                return Promise.resolve()
            }
            if (refreshTask) {
                refreshAgain = true
                return refreshTask
            }
            refreshTask = emailUnreadCount().then(data => {
                this.apply(data)
            }).finally(() => {
                refreshTask = null
                if (refreshAgain) {
                    refreshAgain = false
                    this.refresh()?.catch(err => console.error(err))
                }
            })
            return refreshTask
        },
        scheduleRefresh() {
            if (refreshTimer) {
                window.clearTimeout(refreshTimer)
            }
            refreshTimer = window.setTimeout(() => {
                refreshTimer = null
                this.refresh()?.catch(err => console.error(err))
            }, 200)
        },
    },
})
