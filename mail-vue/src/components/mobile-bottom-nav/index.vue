<template>
  <nav v-if="isMobile" class="mobile-bottom-nav" aria-label="Primary navigation">
    <button
      v-for="item in items"
      :key="item.routeName"
      type="button"
      class="mnav-item"
      :class="{ 'is-active': isActive(item) }"
      :aria-current="isActive(item) ? 'page' : undefined"
      @click="navigate(item)"
    >
      <Icon :icon="item.icon" width="20" height="20" />
      <span class="mnav-label">{{ item.label }}</span>
    </button>
    <button type="button" class="mnav-item mnav-more" @click="toggleDrawer">
      <Icon icon="fluent:apps-20-regular" width="20" height="20" />
      <span class="mnav-label">More</span>
    </button>
  </nav>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { hasPerm } from '@/perm/perm.js'
import { useUiStore } from '@/store/ui.js'

const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()

const isMobile = ref(window.innerWidth <= 700)

// The five most-used destinations. Permission-gated; anything the member
// cannot reach is simply omitted, so the bar never shows a dead item.
const PRIMARY = [
  { label: 'Overview', routeName: 'overview', icon: 'solar:widget-2-line-duotone', perm: null, match: ['overview'] },
  { label: 'Mail', routeName: 'email', icon: 'hugeicons:mailbox-01', perm: null, match: ['email', 'mail', 'mail-folder', 'content', 'message-detail', 'send', 'draft', 'star'] },
  { label: 'CRM', routeName: 'crm-overview', icon: 'fluent:people-community-20-regular', perm: 'contacts:query', match: ['crm-overview', 'crm-contacts', 'crm-leads', 'crm-deals', 'crm-tasks', 'crm-companies', 'crm-pipelines'] },
  { label: 'Finance', routeName: 'finance', icon: 'fluent:building-bank-20-regular', perm: 'finance:view', match: ['finance'] },
  { label: 'Documents', routeName: 'documents', icon: 'fluent:document-folder-20-regular', perm: 'documents:query', match: ['documents'] },
]

const items = computed(() => PRIMARY.filter(item => !item.perm || hasPerm(item.perm)))

function isActive(item) {
  const name = route.name
  if (item.match.includes(name)) return true
  // CRM sub-routes share the crm- prefix
  if (item.routeName === 'crm-overview' && String(name).startsWith('crm-')) return true
  return false
}

function navigate(item) {
  if (route.name === item.routeName) return
  router.push({ name: item.routeName }).catch(() => {})
}

function toggleDrawer() {
  // Open the full sidebar drawer (the existing mobile aside) so the member
  // can reach everything else without a separate menu system.
  uiStore.asideShow = true
}

function onResize() {
  isMobile.value = window.innerWidth <= 700
}

onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
</script>

<style scoped>
.mobile-bottom-nav {
  display: none;
}

@media (max-width: 700px) {
  .mobile-bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 90;
    display: flex;
    align-items: stretch;
    justify-content: space-around;
    gap: 2px;
    height: 56px;
    padding: 4px 6px calc(4px + env(safe-area-inset-bottom, 0px));
    background: var(--hq-surface, var(--el-bg-color));
    border-top: 1px solid var(--hq-border, rgba(148, 163, 184, .2));
    box-shadow: 0 -2px 12px rgba(0, 0, 0, .06);
  }
}

.mnav-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 2px 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--hq-muted, #6b6b6b);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mnav-item.is-active {
  color: var(--hq-accent, #ff5500);
}

.mnav-item.is-active .mnav-label {
  font-weight: 650;
}

.mnav-label {
  font-size: 10px;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.mnav-more {
  flex: 0 0 auto;
  min-width: 48px;
}
</style>