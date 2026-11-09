<template>
  <div class="sidebar-shell">
    <header class="sidebar-header">
      <button class="brand-button" type="button" aria-label="Go to Overview" @click="router.push({name: 'overview'})">
        <img src="/xpass-logo.png" alt="XPass" />
      </button>
    </header>

    <nav class="workspace-navigation" aria-label="Workspace">
      <div class="navigation-label">Workspace</div>
      <button
        v-for="module in primaryModules"
        :key="module.id"
        class="navigation-item"
        :class="{ 'is-active': isModuleActive(module) }"
        type="button"
        :aria-label="module.name"
        :aria-current="isModuleActive(module) ? 'page' : undefined"
        :title="module.name"
        @click="openModule(module)"
      >
        <Icon :icon="module.icon" width="19" height="19" />
        <span>{{ module.name }}</span>
      </button>

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

      <button
        v-perm="'email:send'"
        class="compose-cta"
        type="button"
        aria-label="Compose email (C)"
        @click="openCompose"
      >
        <Icon icon="hugeicons:quill-write-01" width="19" height="19" />
        <span>Compose</span>
        <kbd aria-hidden="true">C</kbd>
      </button>
    </section>

    <el-scrollbar class="sidebar-content-scroll">
      <nav v-if="isMailModule" class="mail-navigation" aria-label="Mail folders">
        <div class="navigation-label">Mail</div>
        <button
          v-for="item in primaryMailLinks"
          :key="item.id"
          class="mail-navigation-item"
          :class="{ 'is-active': isMailLinkActive(item) }"
          type="button"
          :aria-current="isMailLinkActive(item) ? 'page' : undefined"
          @click="openMailLink(item)"
        >
          <Icon :icon="item.icon" width="18" height="18" />
          <span>{{ item.label }}</span>
          <span v-if="item.count" class="count-badge">{{ badge(item.count) }}</span>
        </button>

        <div class="folder-heading">
          <span>Folders</span>
          <span class="folder-actions">
            <button type="button" aria-label="Create folder" title="Create folder" @click="showFolderDialog = true">
              <Icon icon="fluent:add-20-regular" width="17" height="17" />
            </button>
            <button type="button" aria-label="Manage folders" title="Manage folders" @click="router.push({name: 'folder-settings'})">
              <Icon icon="fluent:settings-48-regular" width="17" height="17" />
            </button>
          </span>
        </div>
        <button
          v-for="folder in folders"
          :key="folder.folderId"
          class="mail-navigation-item"
          :class="{ 'is-active': route.params.folderKey === `custom-${folder.folderId}` }"
          type="button"
          :aria-current="route.params.folderKey === `custom-${folder.folderId}` ? 'page' : undefined"
          @click="openFolder(`custom-${folder.folderId}`)"
        >
          <Icon icon="fluent:folder-20-regular" width="18" height="18" />
          <span>{{ folder.name }}</span>
          <span v-if="folder.unreadCount" class="count-badge">{{ badge(folder.unreadCount) }}</span>
        </button>

        <div class="navigation-label smart-label">Categories</div>
        <button
          v-for="item in categoryLinks"
          :key="item.id"
          class="mail-navigation-item"
          :class="{ 'is-active': isMailLinkActive(item) }"
          type="button"
          :aria-current="isMailLinkActive(item) ? 'page' : undefined"
          @click="openMailLink(item)"
        >
          <Icon :icon="item.icon" width="18" height="18" />
          <span>{{ item.label }}</span>
          <span v-if="item.count" class="count-badge">{{ badge(item.count) }}</span>
        </button>
      </nav>
      <nav class="secondary-navigation" aria-label="Additional workspace navigation">
        <details v-if="futureModules.length" class="future-modules">
          <summary>
            <Icon icon="fluent:grid-20-regular" width="18" height="18" />
            <span>More modules</span>
            <span class="future-count">{{ futureModules.length }}</span>
            <Icon class="summary-chevron" icon="fluent:chevron-down-20-regular" width="15" height="15" />
          </summary>
          <div class="future-module-list">
            <div v-for="module in futureModules" :key="module.id" class="future-module" :title="`${module.name} — upcoming`">
              <Icon :icon="module.icon" width="17" height="17" />
              <span>{{ module.name }}</span>
              <span class="future-status">Soon</span>
            </div>
          </div>
        </details>
        <details v-if="adminLinks.length" class="admin-navigation" :open="isAdminRoute">
          <summary>
            <Icon icon="fluent:shield-task-20-regular" width="18" height="18" />
            <span>Administration</span>
            <Icon class="summary-chevron" icon="fluent:chevron-down-20-regular" width="15" height="15" />
          </summary>
          <div class="admin-link-list">
            <button
              v-for="item in adminLinks"
              :key="item.routeName"
              class="navigation-item"
              :class="{ 'is-active': route.name === item.routeName }"
              type="button"
              :aria-current="route.name === item.routeName ? 'page' : undefined"
              @click="router.push({name: item.routeName})"
            >
              <Icon :icon="item.icon" width="18" height="18" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </details>
      </nav>
    </el-scrollbar>

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

const primaryModules = computed(() => workspaceModules.filter(module =>
  module.available && (!module.requiredPermission || hasPerm(module.requiredPermission))
));
const futureModules = computed(() => workspaceModules.filter(module => !module.available));
const canSwitchAccount = computed(() => hasPerm('account:query'));
const activeAccountEmail = computed(() =>
  accountStore.currentAccount?.email || userStore.user?.account?.email || ''
);
const accountInitial = computed(() => accountInitials(activeAccountEmail.value));
const isMailModule = computed(() =>
  workspaceModules.find(module => module.id === 'mail')?.routeNames?.includes(route.name)
);
const adminLinks = computed(() => [
  {routeName: 'user', label: 'People', icon: 'fluent:people-20-regular', permission: 'user:query'},
  {routeName: 'all-email', label: 'All mail', icon: 'fluent:mail-list-28-regular', permission: 'all-email:query'},
  {routeName: 'role', label: 'Roles & permissions', icon: 'fluent:lock-closed-16-regular', permission: 'role:query'},
  {routeName: 'reg-key', label: 'Invite codes', icon: 'fluent:fingerprint-20-regular', permission: 'reg-key:query'},
  {routeName: 'sys-setting', label: 'System settings', icon: 'fluent:settings-48-regular', permission: 'setting:query'},
].filter(item => hasPerm(item.permission)));
const isAdminRoute = computed(() => adminLinks.value.some(item => item.routeName === route.name));
const primaryMailLinks = computed(() => [
  {id: 'inbox', label: 'Inbox', icon: 'hugeicons:mailbox-01', routeName: 'email', count: counts.value.inbox},
  {id: 'unread', label: 'Unread', icon: 'fluent:mail-unread-20-regular', folderKey: 'all-unread', count: counts.value.unread},
  {id: 'sent', label: 'Sent', icon: 'cil:send', routeName: 'send', permission: 'email:send'},
  {id: 'drafts', label: 'Drafts', icon: 'fluent:document-20-regular', routeName: 'draft', permission: 'email:send', count: draftCount.value},
  {id: 'starred', label: 'Starred', icon: 'solar:star-line-duotone', routeName: 'star'},
  {id: 'templates', label: 'Templates', icon: 'fluent:document-bullet-list-20-regular', routeName: 'templates'},
  {id: 'snoozed', label: 'Snoozed', icon: 'fluent:clock-20-regular', folderKey: 'snoozed', count: counts.value.snoozed},
].filter(item => !item.permission || hasPerm(item.permission)));
const categoryLinks = computed(() => [
  {id: 'spam', label: 'Spam', icon: 'fluent:shield-error-20-regular', folderKey: 'spam', count: counts.value.spam},
  {id: 'trash', label: 'Trash', icon: 'fluent:delete-20-regular', folderKey: 'trash', count: counts.value.trash},
  {id: 'archive', label: 'Archive', icon: 'fluent:archive-20-regular', folderKey: 'archive', count: counts.value.archive},
  {id: 'outbox', label: 'Outbox', icon: 'fluent:send-clock-20-regular', folderKey: 'outbox', count: counts.value.outbox},
  {id: 'newsletter', label: 'Newsletter', icon: 'fluent:mail-list-20-regular', folderKey: 'newsletter', count: counts.value.newsletter},
  {id: 'notification', label: 'Notification', icon: 'fluent:alert-20-regular', folderKey: 'notification', count: counts.value.notification},
]);

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
  return module.routeNames?.includes(route.name) || route.name === module.routeName;
}

function openModule(module) {
  if (!module.available || !module.routeName) return;
  router.push({name: module.routeName});
  if (window.innerWidth < 700) uiStore.asideShow = false;
}

function badge(value) {
  const count = Number(value) || 0;
  return count > 99 ? '99+' : count;
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
  uiStore.writerRef?.open();
}

onMounted(() => {
  refreshNavigation().catch(error => console.error(error));
  updateDraftCount().catch(error => console.error(error));
  window.addEventListener('mailbox:updated', refreshAfterMailboxUpdate);
  countRefreshTimer = window.setInterval(refreshAfterMailboxUpdate, 30000);
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
  height: 58px;
  flex: 0 0 58px;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.brand-button {
  display: flex;
  width: 132px;
  height: 38px;
  align-items: center;
  border-radius: 6px;
  cursor: pointer;
}

.brand-button img {
  width: 122px;
  height: 34px;
  object-fit: contain;
  object-position: left center;
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

.future-modules,
.admin-navigation {
  color: var(--hq-text-secondary);
}

.future-modules summary,
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

.future-modules summary::-webkit-details-marker,
.admin-navigation summary::-webkit-details-marker {
  display: none;
}

.future-modules summary:hover,
.admin-navigation summary:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.summary-chevron {
  margin-left: auto;
  transition: transform .15s ease;
}

.future-modules[open] .summary-chevron,
.admin-navigation[open] .summary-chevron {
  transform: rotate(180deg);
}

.future-count {
  color: var(--hq-muted);
  font-size: 11px;
}

.future-module-list,
.admin-link-list {
  display: grid;
  gap: 1px;
  padding: 2px 0 4px 16px;
}

.future-module {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  color: var(--hq-muted);
  font-size: 12px;
}

.future-module > span:nth-child(2) {
  flex: 1;
}

.future-status {
  font-size: 10px;
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

.compose-cta kbd {
  margin-left: auto;
  padding: 1px 6px;
  border: 1px solid rgba(255, 255, 255, .4);
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
}

.compose-cta span {
  margin-right: auto;
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
.future-modules summary:focus-visible,
.admin-navigation summary:focus-visible,
.mail-navigation-item:focus-visible,
.folder-actions button:focus-visible,
.account-switcher:focus-visible,
.compose-cta:focus-visible {
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
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
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
