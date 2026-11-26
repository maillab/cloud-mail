import { defineStore } from 'pinia'
import { sharedMailboxList, sharedMailboxSummary } from '@/request/shared-mailbox.js'

// Shared inboxes are a first-class part of the mail workspace, not a mode you
// switch the whole app into. This store holds the mailboxes the signed-in
// member may work in, so the sidebar, the composer's From selector and the
// conversation views all read the same list.
export const useMailboxStore = defineStore('mailbox', {
    state: () => ({
        mailboxes: [],
        // Per-inbox queue counts, straight from the server so a badge can never
        // claim a number the queue does not contain.
        summary: {},
        loaded: false,
        loading: false,
        loadingSummary: false,
        error: '',
    }),
    getters: {
        sharedMailboxes(state) {
            return state.mailboxes.filter(item => item.mailbox_type === 'shared')
        },
        personalMailbox(state) {
            return state.mailboxes.find(item => item.mailbox_type === 'personal') || null
        },
        sendableMailboxes(state) {
            return state.mailboxes.filter(item => (item.permissions || '').includes('send'))
        },
        mailboxById(state) {
            return (id) => state.mailboxes.find(item => item.account_id === Number(id)) || null
        },
        // Badge text for one shared inbox: what is unclaimed plus what is mine.
        badgeFor(state) {
            return (id) => {
                const row = state.summary[Number(id)]
                if (!row) return 0
                const counts = row.counts || {}
                return (Number(counts.unassigned) || 0) + (Number(counts.mine) || 0)
            }
        },
        countsFor(state) {
            return (id) => state.summary[Number(id)]?.counts || null
        },
    },
    actions: {
        async load(force = false) {
            if (this.loaded && !force) return this.mailboxes
            if (this.loading) return this.mailboxes
            this.loading = true
            this.error = ''
            try {
                const rows = await sharedMailboxList()
                this.mailboxes = Array.isArray(rows) ? rows : []
                this.loaded = true
            } catch (error) {
                this.error = error?.message || 'Could not load mailboxes.'
                // A failed refresh must not empty a list we already have: the
                // composer's From selector would lose inboxes the member can
                // still send from. loaded stays false so the next call retries.
                if (!this.loaded) this.mailboxes = []
            } finally {
                this.loading = false
            }
            return this.mailboxes
        },
        // Queue counts for every shared inbox in one request. The server
        // computes them per mailbox, so a member with no membership in an inbox
        // simply never sees it here.
        async loadSummary(force = false) {
            if (this.loadingSummary) return this.summary
            this.loadingSummary = true
            try {
                const rows = await sharedMailboxSummary()
                const next = {}
                for (const row of Array.isArray(rows) ? rows : []) {
                    next[Number(row.mailbox_id)] = row
                }
                this.summary = next
            } catch (error) {
                // A badge is not worth breaking the sidebar for.
                console.error('Shared mailbox summary failed:', error)
            } finally {
                this.loadingSummary = false
            }
            return this.summary
        },
    },
})