<template>
  <el-scrollbar class="support-resolver">
    <div class="support-resolver-inner">
      <div v-if="resolving" class="support-resolver-loading">
        <div class="resolver-bar" aria-hidden="true"></div>
        <span>Opening Support Inbox…</span>
      </div>

      <el-empty
        v-else-if="!resolved"
        description="No Support Inbox is configured for your account."
      >
        <p class="support-resolver-hint">
          A Support Inbox is a shared company mailbox. An administrator can set one up under
          Administration → Shared Mailboxes, then grant you access.
        </p>
      </el-empty>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import router from '@/router/index.js'
import { useMailboxStore } from '@/store/mailbox.js'

// Support Inbox is a first-class sidebar destination, but it is still the same
// shared Mail system: this view resolves the member's Support mailbox and hands
// off to the existing shared-inbox conversation view. No separate login, no
// duplicated backend.
const mailboxStore = useMailboxStore()
const resolving = ref(true)
const resolved = ref(false)

function findSupportMailbox() {
  const boxes = mailboxStore.sharedMailboxes || []
  return boxes.find(box => {
    const label = `${box.display_name || ''} ${box.email || ''}`.toLowerCase()
    return label.includes('support')
  }) || null
}

onMounted(async () => {
  try {
    if (!mailboxStore.loaded) await mailboxStore.load()
    const box = findSupportMailbox()
    if (box) {
      resolved.value = true
      router.replace({ name: 'mail-shared-inbox', params: { mailboxId: String(box.account_id) } })
      return
    }
  } catch {
    // fall through to the empty state
  } finally {
    resolving.value = false
  }
})
</script>

<style scoped>
.support-resolver { height: 100%; background: var(--hq-page); }
.support-resolver-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 40px 24px;
  gap: 14px;
  color: var(--hq-muted);
  text-align: center;
}
.support-resolver-loading { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.resolver-bar {
  width: 180px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--hq-accent) 16%, transparent);
  position: relative;
  overflow: hidden;
}
.resolver-bar::before {
  content: "";
  position: absolute;
  inset: 0;
  width: 40%;
  border-radius: inherit;
  background: var(--hq-accent);
  animation: resolver-slide 1.1s ease-in-out infinite;
}
@keyframes resolver-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
.support-resolver-hint {
  max-width: 420px;
  margin: 6px auto 0;
  color: var(--hq-muted);
  font-size: 13px;
  line-height: 1.55;
}
</style>