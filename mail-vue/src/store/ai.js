import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAiStore = defineStore('ai', () => {
    const visible = ref(false)
    const context = ref(null)

    function open(ctx) {
        context.value = ctx || null
        visible.value = true
    }

    function close() {
        visible.value = false
    }

    return { visible, context, open, close }
})