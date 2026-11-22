<template>
  <div class="crm-nav">
    <div class="crm-nav-label">Workspace</div>
    <button
      v-for="item in primaryLinks"
      :key="item.id"
      class="crm-link"
      :class="{ 'is-active': isActive(item) }"
      type="button"
      :aria-current="isActive(item) ? 'page' : undefined"
      @click="open(item)"
    >
      <Icon :icon="item.icon" width="17" height="17" />
      <span class="crm-link-text">{{ item.label }}</span>
    </button>

    <button
      class="crm-link crm-more-toggle"
      type="button"
      :aria-expanded="moreOpen"
      @click="moreOpen = !moreOpen"
    >
      <Icon icon="fluent:more-horizontal-20-regular" width="17" height="17" />
      <span class="crm-link-text">More</span>
      <Icon
        class="crm-chevron"
        :icon="moreOpen ? 'fluent:chevron-up-12-regular' : 'fluent:chevron-down-12-regular'"
        width="13"
        height="13"
      />
    </button>

    <div v-show="moreOpen" class="crm-more">
      <button
        v-for="item in moreLinks"
        :key="item.id"
        class="crm-link crm-link-sub"
        :class="{ 'is-active': isActive(item) }"
        type="button"
        :aria-current="isActive(item) ? 'page' : undefined"
        @click="open(item)"
      >
        <Icon :icon="item.icon" width="16" height="16" />
        <span class="crm-link-text">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import router from '@/router/index.js'
import { useUiStore } from '@/store/ui.js'
import { hasPerm } from '@/perm/perm.js'

const emit = defineEmits(['navigate'])
const route = useRoute()
const uiStore = useUiStore()
const moreOpen = ref(false)

const primaryLinks = computed(() => [
  { id: 'overview', label: 'Overview', icon: 'solar:widget-2-line-duotone', routeName: 'crm-overview' },
  { id: 'contacts', label: 'Contacts', icon: 'fluent:person-20-regular', routeName: 'crm-contacts', permission: 'contacts:query' },
  { id: 'organizations', label: 'Organizations', icon: 'fluent:building-bank-20-regular', routeName: 'crm-organizations', permission: 'organizations:query' },
  { id: 'leads', label: 'Leads', icon: 'fluent:arrow-trending-20-regular', routeName: 'crm-leads', permission: 'leads:query' },
  { id: 'deals', label: 'Opportunities', icon: 'fluent:briefcase-20-regular', routeName: 'crm-deals', permission: 'deals:query' },
  { id: 'pipelines', label: 'Pipelines', icon: 'fluent:slide-grid-20-regular', routeName: 'crm-pipelines', permission: 'pipelines:query' },
].filter(item => !item.permission || hasPerm(item.permission)))

const moreLinks = computed(() => [
  { id: 'activities', label: 'Activities', icon: 'fluent:call-20-regular', routeName: 'crm-activities', permission: 'activities:query' },
  { id: 'tasks', label: 'CRM Tasks', icon: 'fluent:clipboard-task-20-regular', routeName: 'crm-tasks', permission: 'tasks:query' },
  { id: 'events', label: 'Linked Events', icon: 'fluent:calendar-ltr-20-regular', routeName: 'crm-events', permission: 'events:query' },
  { id: 'relationships', label: 'Relationships', icon: 'fluent:link-20-regular', routeName: 'crm-relationships', permission: 'contact-organizations:query' },
].filter(item => !item.permission || hasPerm(item.permission)))

function isActive(item) {
  return route.name === item.routeName
}

function open(item) {
  router.push({ name: item.routeName })
  if (window.innerWidth < 700) uiStore.asideShow = false
  emit('navigate')
}
</script>

<style scoped>
.crm-nav {
  display: grid;
  gap: 1px;
}

.crm-nav-label {
  padding: 6px 9px 4px;
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 600;
}

.crm-link {
  display: flex;
  min-width: 0;
  min-height: 32px;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.crm-link:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.crm-link.is-active {
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.crm-link-sub {
  min-height: 30px;
  padding-left: 27px;
}

.crm-link-text {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crm-chevron {
  flex: 0 0 auto;
  color: var(--hq-muted);
}

.crm-more-toggle {
  margin-top: 2px;
}

.crm-more {
  display: grid;
  gap: 1px;
}

.crm-link:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}
</style>