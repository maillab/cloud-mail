import { defineStore } from 'pinia'

export const useSendStore = defineStore('send', {
    state: () => ({
        deleteId: 0,
        searchParams: {
            text: '',
            type: 'subject',
            startDate: '',
            endDate: '',
        },
    }),
    actions: {
        setSearchParams(params) {
            this.searchParams = {
                ...this.searchParams,
                ...params,
            }
        },
    },
})
