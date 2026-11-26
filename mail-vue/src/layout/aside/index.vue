<template>
  <div class="sidebar-shell">
    <header class="sidebar-header">
      <button class="brand-button" type="button" aria-label="Go to Overview" @click="router.push({name: 'overview'})">
        <img class="brand-wordmark brand-logo-light" src="/xpass-wordmark.png" alt="XPass" />
        <img class="brand-wordmark brand-logo-dark" src="/xpass-wordmark-inverted.png" alt="XPass" />
        <img class="brand-mark" src="/xpass-mark.png" alt="XPass" />
      </button>
      <button v-if="isMobile" class="mobile-toggle" type="button" aria-label="Toggle navigation" @click="uiStore.asideShow = !uiStore.asideShow">
        <Icon icon="mingcute:menu-line" width="20" height="20" />
      </button>
    </header>

    <el-scrollbar class="sidebar-content-scroll">
      <nav class="workspace-navigation" aria-label="Workspace">
      <div v-for="group in moduleGroups" :key="group.id" class="module-group">
        <div class="navigation-label">{{ group.label }}</div>
        <template v-for="module in group.modules" :key="module.id">
          <div v-if="isGroupedModule(module)" class="nav-group">
            <div class="nav-group-row" :class="{ 'is-active': isModuleActive(module) }">
              <button class="nav-group-main" type="button" @click="openModule(module)">
                <Icon :icon="module.icon" width="19" height="19" />
                <span>{{ module.name }}</span>
              </button>
              <button
                v-if="!isCollapsed"
                class="nav-group-chevron"
                type="button"
                :aria-expanded="isGroupOpen(module.id)"
                :aria-label="groupToggleLabel(module)"
                @click.stop="toggleGroup(module.id)"
              >
                <Icon :icon="isGroupOpen(module.id) ? 'fluent:chevron-up-12-regular' : 'fluent:chevron-down-12-regular'" width="14" height="14" />
              </button>
            </div>
            <div v-show="isGroupOpen(module.id)" class="nav-sub">
              <MailNav v-if="module.id === 'mail'" />
              <CrmNav v-else-if="module.id === 'crm'" />
            </div>
          </div>
          <button
            v-else
            class="navigation-item"
            :class="{ 'is-active': isModuleActive(module) }"
            type="button"
            :aria-label="module.name"
            :aria-current="isModuleActive(module) ? 'page' : undefined"
            :title="module.name"
            @click="openModule(module)"
          >
            <Icon :icon="module.icon" width="19" height="19" />
            <span class="navigation-item-text">{{ module.name }}</span>
            <span v-if="moduleSoon(module)" class="nav-soon">Soon</span>
          </button>
        </template>
      </div>
    </nav>

    <section v-if="isMailModule" class="mail-controls" aria-label="Mail actions">
      <el-dropdown
        v-if="canSwitchAccount"
        class="account-switch"
        trigger="click"
        popper-class="account-menu-popper"
        @command="handleAccountCommand"
        @visible-change="loadAccountsWhenOpened"
      >
        <button class="account-switcher" type="button" aria-label="Switch mail account">
          <span class="account-avatar">{{ accountInitial }}</span>
          <span class="account-switcher-copy">
            <span class="account-switcher-label">MAIL ACCOUNT</span>
            <span class="account-switcher-email">{{ activeAccountEmail || 'Select an account' }}</span>
          </span>
          <Icon class="account-switcher-arrow" icon="mingcute:down-small-fill" width="17" height="17" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="account in switchAccounts"
              :key="account.accountId"
              :command="account.accountId"
              :class="{ 'account-option-active': account.accountId === accountStore.currentAccountId }"
            >
              <span class="account-option-avatar">{{ accountInitials(account.email) }}</span>
              <span class="account-option-email">{{ account.email }}</span>
              <Icon v-if="account.accountId === accountStore.currentAccountId" icon="fluent:checkmark-20-regular" width="16" height="16" />
            </el-dropdown-item>
            <el-dropdown-item v-if="hasMoreAccounts" command="load-more" divided>
              {{ loadingAccounts ? 'Loading accounts…' : 'Load more accounts' }}
            </el-dropdown-item>
            <el-dropdown-item command="manage-accounts" divided>Manage accounts</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <div v-else class="account-switcher account-switcher-static">
        <span class="account-avatar">{{ accountInitial }}</span>
        <span class="account-switcher-copy">
          <span class="account-switcher-label">MAIL ACCOUNT</span>
          <span class="account-switcher-email">{{ activeAccountEmail || 'Your mailbox' }}</span>
        </span>
      </div>

    </section>

    </el-scrollbar>

    <el-drawer
      v-model="groupDrawerOpen"
      direction="ltr"
      :with-header="false"
      size="280px"
      append-to-body
      class="mail-nav-drawer"
    >
      <div class="mail-drawer-head">
        <span class="mail-drawer-title">{{ groupDrawerTitle }}</span>
        <button type="button" aria-label="Close menu" @click="groupDrawerOpen = false">
          <Icon icon="fluent:dismiss-12-regular" width="16" height="16" />
        </button>
      </div>
      <MailNav v-if="groupDrawerId === 'mail'" @navigate="groupDrawerOpen = false" />
      <CrmNav v-else-if="groupDrawerId === 'crm'" @navigate="groupDrawerOpen = false" />
    </el-drawer>

    <el-dialog v-model="showFolderDialog" title="Create new folder" width="420px">
      <el-input v-model="folderName" maxlength="60" show-word-limit placeholder="Folder name" @keyup.enter="createFolder" />
      <template #footer>
        <el-button @click="showFolderDialog = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="createFolder">Create</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import router from "@/router/index.js";
import {useRoute} from "vue-router";
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {mailboxCounts, mailboxFolderCreate, mailboxFolderList} from "@/request/mailbox.js";
import {accountList} from "@/request/account.js";
import {userDraftStore} from "@/store/draft.js";
import db from "@/db/db.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {hasPerm} from "@/perm/perm.js";
import {ElMessage} from "element-plus";
import {useEmailStore} from "@/store/email.js";
import {workspaceModules} from "@/modules/registry.js";
import {featureStatus, isHidden} from "@/features/registry.js";
import MailNav from "@/layout/mail-nav.vue";
import CrmNav from "@/layout/crm-nav.vue";
import {useI18n} from "vue-i18n";

const {t} = useI18n();
const uiStore = useUiStore();
const route = useRoute();
const draftStore = userDraftStore();
const accountStore = useAccountStore();
const userStore = useUserStore();
const emailStore = useEmailStore();
const folders = ref([]);
const counts = ref({});
const switchAccounts = ref([]);
const loadingAccounts = ref(false);
const hasMoreAccounts = ref(false);
const accountSwitchLoaded = ref(false);
const showFolderDialog = ref(false);
const folderName = ref('');
const saving = ref(false);
const draftCount = ref(0);
let countRefreshTimer;

const isMobile = computed(() => window.innerWidth < 700);
const isCollapsed = computed(() => uiStore.asideCollapsed && !isMobile.value);

const groupedModuleIds = ['mail', 'crm'];
const expandedGroups = ref({});
const groupDrawerOpen = ref(false);
const groupDrawerId = ref('');

function isGroupedModule(module) {
  return groupedModuleIds.includes(module.id);
}

function isGroupOpen(id) {
  return Boolean(expandedGroups.value[id]) && !isCollapsed.value;
}

function toggleGroup(id) {
  expandedGroups.value = {...expandedGroups.value, [id]: !expandedGroups.value[id]};
}

function groupToggleLabel(module) {
  return `${isGroupOpen(module.id) ? 'Collapse' : 'Expand'} ${module.name} menu`;
}

const groupDrawerTitle = computed(() =>
  workspaceModules.find(module => module.id === groupDrawerId.value)?.name || ''
);

function syncGroupsFromRoute() {
  const next = {};
  for (const module of workspaceModules) {
    if (!groupedModuleIds.includes(module.id)) continue;
    if (module.routeNames?.includes(route.name)) next[module.id] = true;
  }
  expandedGroups.value = next;
}

watch(
  () => route.name,
  () => syncGroupsFromRoute(),
  { immediate: true }
);

const moduleGroups = computed(() => {
  const groups = [
    {id: 'workspace', label: t('sidebarGroupWorkspace'), modules: []},
    {id: 'people', label: t('sidebarGroupPeople'), modules: []},
    {id: 'settings', label: t('sidebarGroupSettings'), modules: []},
    {id: 'admin', label: t('sidebarGroupAdmin'), modules: []},
  ];
  const byId = Object.fromEntries(groups.map(g => [g.id, g]));
    for (const module of workspaceModules) {
        if (!module.available) continue;
        if (isHidden(module.id)) continue;
        if (module.requiredPermission && !hasPerm(module.requiredPermission)) continue;
        const group = byId[module.group];
        if (group) group.modules.push(module);
    }
  return groups.filter(g => g.modules.length > 0);
});

const canSwitchAccount = computed(() => hasPerm('account:query'));
const activeAccountEmail = computed(() =>
  accountStore.currentAccount?.email || userStore.user?.account?.email || ''
);
const accountInitial = computed(() => accountInitials(activeAccountEmail.value));
const isMailModule = computed(() =>
  workspaceModules.find(module => module.id === 'mail')?.routeNames?.includes(route.name)
);
function accountInitials(email) {
  const [name = 'X'] = String(email || 'X').split('@');
  return name.slice(0, 2).toUpperCase();
}

async function loadAccountsWhenOpened(visible) {
  if (!visible || accountSwitchLoaded.value || loadingAccounts.value) return;
  await loadMoreAccounts();
}

async function loadMoreAccounts() {
  if (loadingAccounts.value || !hasMoreAccounts.value && accountSwitchLoaded.value) return;
  loadingAccounts.value = true;
  const last = switchAccounts.value.at(-1);
  try {
    const page = await accountList(last?.accountId || 0, 30, last?.sort ?? null);
    switchAccounts.value.push(...page);
    hasMoreAccounts.value = page.length === 30;
    accountSwitchLoaded.value = true;
  } catch (error) {
    console.error('Could not load mail accounts:', error);
    ElMessage({message: error.message || 'Could not load mail accounts.', type: 'error', plain: true});
  } finally {
    loadingAccounts.value = false;
  }
}

function handleAccountCommand(command) {
  if (command === 'load-more') {
    loadMoreAccounts();
    return;
  }
  if (command === 'manage-accounts') {
    uiStore.accountShow = true;
    return;
  }
  const selected = switchAccounts.value.find(account => account.accountId === Number(command));
  if (!selected || selected.accountId === accountStore.currentAccountId) return;
  accountStore.currentAccountId = selected.accountId;
  accountStore.currentAccount = selected;
  emailStore.contentData.email = null;
  emailStore.emailScroll?.refreshList?.();
  emailStore.sendScroll?.refreshList?.();
  window.dispatchEvent(new Event('mailbox:updated'));
  if (window.innerWidth < 700) uiStore.asideShow = false;
}

async function refreshNavigation() {
  const [folderRows, folderCounts] = await Promise.all([mailboxFolderList(), mailboxCounts()]);
  folders.value = folderRows;
  counts.value = folderCounts;
}

function refreshAfterMailboxUpdate() {
  refreshNavigation().catch(error => console.error(error));
}

function openFolder(folderKey) {
  router.push({name: 'mail-folder', params: {folderKey}});
  if (window.innerWidth < 700) uiStore.asideShow = false;
}

function openMailLink(item) {
  if (item.folderKey) {
    openFolder(item.folderKey);
  } else {
    router.push({name: item.routeName});
    if (window.innerWidth < 700) uiStore.asideShow = false;
  }
}

function isMailLinkActive(item) {
  if (item.folderKey) return route.params.folderKey === item.folderKey;
  if (item.routeName === 'email') return ['email', 'mail', 'content', 'message-detail'].includes(route.name)
    && (!route.params.mailbox || route.params.mailbox === 'inbox');
  if (item.routeName === 'templates') return route.name === 'templates';
  return route.name === item.routeName;
}

function isModuleActive(module) {
  if (route.name === 'coming-soon' && moduleSoon(module)) {
    return route.params.feature === module.id;
  }
  return module.routeNames?.includes(route.name) || route.name === module.routeName;
}

function openModule(module) {
  if (!module.available || !module.routeName) return;
  if (isGroupedModule(module) && isCollapsed.value) {
    groupDrawerId.value = module.id;
    groupDrawerOpen.value = true;
    return;
  }
  if (isGroupedModule(module)) {
    expandedGroups.value = {...expandedGroups.value, [module.id]: true};
  }
  // Coming-soon modules have no real, permission-gated destination yet. Send
  // them straight to the explainer page so the click always lands somewhere
  // instead of being bounced back to Overview by the permission guard.
  if (moduleSoon(module)) {
    router.push({name: 'coming-soon', params: {feature: module.id}});
    if (window.innerWidth < 700) uiStore.asideShow = false;
    return;
  }
  router.push({name: module.routeName, query: module.query || {}});
  if (window.innerWidth < 700) uiStore.asideShow = false;
}

function badge(value) {
  const count = Number(value) || 0;
  return count > 99 ? '99+' : count;
}

function moduleSoon(module) {
  return featureStatus(module.id) === 'comingSoon';
}

async function createFolder() {
  if (!folderName.value.trim()) return;
  saving.value = true;
  try {
    await mailboxFolderCreate(folderName.value);
    folderName.value = '';
    showFolderDialog.value = false;
    await refreshNavigation();
  } finally {
    saving.value = false;
  }
}

async function updateDraftCount() {
  if (db.value?.draft) {
    draftCount.value = await db.value.draft.count();
  }
}

function openCompose() {
  uiStore.openCompose();
}

onMounted(() => {
  refreshNavigation().catch(error => console.error(error));
  updateDraftCount().catch(error => console.error(error));
  window.addEventListener('mailbox:updated', refreshAfterMailboxUpdate);
  // Mailbox counts are refreshed on the mailbox:updated event (fired when mail
  // actually arrives or changes). The interval is only a slow fallback for
  // cases where the event is missed, so it is kept at 5 minutes rather than 30
  // seconds to avoid a steady stream of D1 reads from every open tab.
  countRefreshTimer = window.setInterval(refreshAfterMailboxUpdate, 300000);
});

onUnmounted(() => {
  window.removeEventListener('mailbox:updated', refreshAfterMailboxUpdate);
  window.clearInterval(countRefreshTimer);
});

watch(() => draftStore.refreshList, () => updateDraftCount().catch(error => console.error(error)));
watch(() => db.value, () => updateDraftCount().catch(error => console.error(error)));
watch(() => route.path, () => refreshNavigation().catch(error => console.error(error)));
</script>

<style lang="scss" scoped>
.sidebar-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--hq-border);
  background: var(--hq-sidebar);
  color: var(--hq-text);
}

.sidebar-header {
  display: flex;
  height: 68px;
  flex: 0 0 68px;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.brand-button {
  display: flex;
  width: 184px;
  height: 48px;
  align-items: center;
  justify-content: flex-start;
  border-radius: 8px;
  cursor: pointer;
}

.brand-wordmark {
  width: 168px;
  height: 42px;
  object-fit: contain;
  object-position: left center;
}

.brand-mark {
  display: none;
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.brand-logo-dark {
  display: none;
}

html.dark .brand-logo-light {
  display: none;
}

html.dark .brand-logo-dark {
  display: block;
}

:global(.aside-collapsed) .brand-wordmark {
  display: none !important;
}

:global(.aside-collapsed) .brand-mark {
  display: block !important;
}

:global(.aside-collapsed) .brand-button {
  width: 48px;
  justify-content: center;
}

.mobile-toggle {
  display: none;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text);
  cursor: pointer;
}

.mobile-toggle:hover {
  background: var(--hq-hover);
}

.folder-actions button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  color: var(--hq-muted);
  cursor: pointer;
}

.folder-actions button:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.workspace-navigation {
  display: grid;
  flex: 0 0 auto;
  gap: 2px;
  padding: 5px 10px 12px;
  border-bottom: 1px solid var(--hq-border);
}

.module-group {
  display: contents;
}

.navigation-label {
  padding: 6px 9px 5px;
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 600;
}

.navigation-item,
.mail-navigation-item {
  display: flex;
  min-width: 0;
  min-height: 36px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.navigation-item:hover,
.mail-navigation-item:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.navigation-item.is-active,
.mail-navigation-item.is-active {
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.navigation-item :deep(svg),
.mail-navigation-item :deep(svg) {
  flex: 0 0 auto;
  color: currentColor;
}

.navigation-item-text {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-soon {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--hq-accent) 16%, transparent);
  color: var(--hq-accent-strong);
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: .03em;
  text-transform: uppercase;
}

.nav-group {
  display: grid;
  gap: 1px;
}

.nav-group-row {
  display: flex;
  min-width: 0;
  align-items: center;
  border-radius: 6px;
  color: var(--hq-text-secondary);
}

.nav-group-row:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.nav-group-row.is-active {
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
}

.nav-group-main {
  display: flex;
  min-width: 0;
  min-height: 36px;
  flex: 1;
  align-items: center;
  gap: 10px;
  padding: 0 4px 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.nav-group-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-group-main :deep(svg),
.nav-group-chevron :deep(svg) {
  flex: 0 0 auto;
}

.nav-group-main:focus-visible,
.nav-group-chevron:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: -2px;
}

.nav-group-chevron {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  margin-right: 4px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-muted);
  cursor: pointer;
}

.nav-group-chevron:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.nav-sub {
  display: grid;
  gap: 1px;
  margin: 1px 0 3px;
  padding-left: 8px;
  border-left: 1px solid var(--hq-border);
}

.mail-drawer-head {
  display: flex;
  height: 54px;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--hq-border);
}

.mail-drawer-title {
  color: var(--hq-text);
  font-size: 13px;
  font-weight: 650;
}

.mail-drawer-head button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-muted);
  cursor: pointer;
}

.mail-drawer-head button:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

:global(.aside-collapsed) .nav-sub {
  display: none !important;
}

.admin-navigation {
  color: var(--hq-text-secondary);
}

.admin-navigation summary {
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  list-style: none;
}

.admin-navigation summary::-webkit-details-marker {
  display: none;
}

.admin-navigation summary:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.summary-chevron {
  margin-left: auto;
  transition: transform .15s ease;
}

.admin-navigation[open] .summary-chevron {
  transform: rotate(180deg);
}

.mail-controls {
  display: grid;
  flex: 0 0 auto;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--hq-border);
}

.account-switch {
  display: block;
  min-width: 0;
}

.account-switcher {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border: 1px solid var(--hq-border);
  border-radius: 7px;
  background: var(--hq-surface);
  color: var(--hq-text);
  text-align: left;
  cursor: pointer;
}

.account-switcher:hover {
  border-color: var(--hq-border-strong);
  background: var(--hq-hover);
}

.account-switcher-static {
  cursor: default;
}

.account-avatar,
.account-option-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-size: 11px;
  font-weight: 700;
}

.account-switcher-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.account-switcher-label {
  color: var(--hq-muted);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: .04em;
}

.account-switcher-email {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-switcher-arrow {
  color: var(--hq-muted);
}

.compose-cta {
  display: flex;
  width: 100%;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 0;
  border-radius: 6px;
  background: var(--hq-accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color .15s ease;
}

.compose-cta:hover {
  background: var(--hq-accent-hover);
}

.compose-cta:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

.sidebar-content-scroll {
  min-height: 0;
  flex: 1;
}

.secondary-navigation {
  display: grid;
  gap: 2px;
  padding: 6px 10px 14px;
}

.mail-navigation {
  display: grid;
  gap: 1px;
  padding: 8px 10px 16px;
}

.mail-navigation-item {
  min-height: 34px;
  font-size: 12px;
}

.count-badge {
  min-width: 20px;
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-size: 10px;
  text-align: center;
}

.folder-heading {
  display: flex;
  min-height: 35px;
  align-items: center;
  justify-content: space-between;
  margin-top: 5px;
  padding: 0 4px 0 9px;
  border-top: 1px solid var(--hq-border);
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 600;
}

.folder-actions {
  display: flex;
}

.folder-actions button {
  width: 28px;
  height: 28px;
}

.smart-label {
  margin-top: 7px;
  border-top: 1px solid var(--hq-border);
}

:deep(.el-scrollbar__view) {
  min-height: 100%;
}

:deep(.el-scrollbar__bar.is-vertical) {
  width: 6px;
}

:deep(.el-scrollbar__thumb) {
  background: var(--hq-border-strong);
}

.brand-button:focus-visible,
.navigation-item:focus-visible,
.admin-navigation summary:focus-visible,
.mail-navigation-item:focus-visible,
.folder-actions button:focus-visible,
.account-switcher:focus-visible,
.compose-cta:focus-visible,
.mobile-toggle:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

@media (max-width: 767px) {
  .sidebar-header {
    height: 54px;
    flex-basis: 54px;
  }
}

@media (max-width: 700px) {
  .compose-cta {
    display: none;
  }

  .mobile-toggle {
    display: inline-flex;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}

@media (min-width: 701px) {
  .mobile-toggle {
    display: none !important;
  }
}
</style>

<style lang="scss">
.account-menu-popper {
  min-width: 250px;
  border: 1px solid var(--hq-border) !important;
  border-radius: 8px !important;
  background: var(--el-bg-color) !important;
}

.account-menu-popper .el-dropdown-menu {
  max-height: min(460px, 70vh);
  overflow-y: auto;
  background: var(--el-bg-color);
}

.account-menu-popper .el-dropdown-menu__item {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 9px;
  color: var(--el-text-color-primary);
}

.account-menu-popper .el-dropdown-menu__item:hover,
.account-menu-popper .account-option-active {
  background: var(--hq-selected);
  color: var(--el-text-color-primary);
}

.account-menu-popper .account-option-active > svg {
  margin-left: auto;
  color: var(--hq-accent);
}
</style>
