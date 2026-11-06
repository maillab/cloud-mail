import { defineStore } from 'pinia'

export const useWriterStore = defineStore('writer', {
    state: () => ({
        sendRecipientRecord: [],
        // 写信面板是否展开（不用路由，直接在主区域内铺满）
        open: false,
        // 打开时要执行的动作，'new' | 'reply' | 'forward' | 'draft'
        intent: null,
        intentPayload: null
    }),
    actions: {
        startNew() {
            this.intent = 'new'
            this.intentPayload = null
            this.open = true
        },
        startReply(email) {
            this.intent = 'reply'
            this.intentPayload = email
            this.open = true
        },
        startForward(email) {
            this.intent = 'forward'
            this.intentPayload = email
            this.open = true
        },
        startDraft(draft) {
            this.intent = 'draft'
            this.intentPayload = draft
            this.open = true
        },
        closeCompose() {
            this.open = false
            this.intent = null
            this.intentPayload = null
        },
        clearIntent() {
            this.intent = null
            this.intentPayload = null
        }
    },
    persist: {
        pick: ['sendRecipientRecord'],
    },
})
