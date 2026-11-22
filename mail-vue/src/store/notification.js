import { defineStore } from 'pinia'
import {notificationsList, notificationsMarkRead, notificationsMarkReadAll} from "@/request/notifications.js";

export const useNotificationStore = defineStore('notification', {
    state: () => ({
        unreadCount: 0,
        list: [],
        loading: false
    }),
    actions: {
        async fetchList(params = {}) {
            this.loading = true;
            try {
                const res = await notificationsList(params);
                this.list = res.list || [];
                this.unreadCount = res.unread ?? this.unreadCount;
                return res;
            } finally {
                this.loading = false;
            }
        },
        async markRead(id) {
            await notificationsMarkRead(id);
            const item = this.list.find(i => i.id === id);
            if (item && !item.is_read) {
                item.is_read = 1;
                this.unreadCount = Math.max(0, this.unreadCount - 1);
            }
        },
        async markAllRead() {
            await notificationsMarkReadAll();
            this.list.forEach(i => { i.is_read = 1; });
            this.unreadCount = 0;
        },
        setUnread(count) {
            this.unreadCount = count;
        },
        incrementUnread() {
            this.unreadCount++;
        },
        decrementUnread() {
            this.unreadCount = Math.max(0, this.unreadCount - 1);
        }
    }
});
