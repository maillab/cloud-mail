<template>
  <div class="sidebar-shell">
    <nav class="app-rail" aria-label="Primary navigation">
      <button class="rail-brand" type="button" aria-label="XPass Mail home" @click="router.push({name: 'email'})">
        <img src="/xpass-brand-mark.png" alt="" />
      </button>
      <button
        class="rail-item"
        :class="{ active: route.name === 'email' || route.name === 'mail-folder' }"
        type="button"
        aria-label="Inbox"
        title="Inbox"
        @click="router.push({name: 'email'})"
      >
        <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
      </button>
      <button
        v-perm="'email:send'"
        class="rail-item"
        :class="{ active: route.meta.name === 'send' }"
        type="button"
        aria-label="Sent mail"
        title="Sent mail"
        @click="router.push({name: 'send'})"
      >
        <Icon icon="cil:send" width="19" height="19" />
      </button>
      <button
        class="rail-item"
        :class="{ active: route.name === 'templates' }"
        type="button"
        aria-label="Templates"
        title="Templates"
        @click="router.push({name: 'templates'})"
      >
        <Icon icon="fluent:document-bullet-list-20-regular" width="20" height="20" />
      </button>
      <button
        v-perm="'analysis:query'"
        class="rail-item"
        :class="{ active: route.meta.name === 'analysis' }"
        type="button"
        aria-label="Analytics"
        title="Analytics"
        @click="router.push({name: 'analysis'})"
      >
        <Icon icon="fluent:data-pie-20-regular" width="20" height="20" />
      </button>
      <span class="rail-spacer"></span>
      <button
        class="rail-item"
        :class="{ active: route.meta.name === 'setting' }"
        type="button"
        aria-label="Settings"
        title="Settings"
        @click="router.push({name: 'setting'})"
      >
        <Icon icon="fluent:settings-48-regular" width="20" height="20" />
      </button>
    </nav>
    <el-scrollbar class="scroll">
      <nav class="sidebar-navigation" role="navigation" aria-label="Mail folders and administration">
      <div>
      <div class="title brand-row">
        <img class="brand-logo" src="/xpass-logo.png" alt="XPass" />
      </div>
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
        aria-label="Send mail (C)"
        @click="openCompose"
      >
        <Icon icon="hugeicons:quill-write-01" width="20" height="20" />
        <span>SEND MAIL</span>
        <kbd aria-hidden="true">[C]</kbd>
      </button>
      <el-menu :collapse="false" text-color="#fff" active-text-color="#fff">
        <div class="section-title">QUICK FILTERS</div>
        <el-menu-item @click="router.push({name: 'email'})" index="home">
          <Icon icon="solar:home-2-line-duotone" width="20" height="20" />
          <span class="menu-name">Home</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'mail-folder', params: {folderKey: 'all-unread'}})" index="all-unread"
                      :class="route.params.folderKey === 'all-unread' ? 'choose-item' : ''">
          <Icon icon="fluent:mail-unread-20-regular" width="20" height="20" />
          <span class="menu-name">All unread</span>
          <span v-if="counts.unread" class="count-badge">{{ badge(counts.unread) }}</span>
        </el-menu-item>
        <div class="folder-tools">
          <span>FOLDERS</span>
          <div>
            <el-button text aria-label="Create new folder" @click="showFolderDialog = true">
              <Icon icon="fluent:add-20-regular" width="18" height="18" />
            </el-button>
            <el-button text aria-label="Manage folders" @click="router.push({name: 'folder-settings'})">
              <Icon icon="fluent:settings-48-regular" width="18" height="18" />
            </el-button>
          </div>
        </div>
        <el-menu-item @click="router.push({name: 'email'})" index="email"
                      :class="route.meta.name === 'email' ? 'choose-item' : ''">
          <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
          <span class="menu-name">{{$t('inbox')}}</span>
          <span v-if="counts.inbox" class="count-badge">{{ badge(counts.inbox) }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="route.meta.name === 'send' ? 'choose-item' : ''">
          <Icon icon="cil:send" width="20" height="20" />
          <span class="menu-name">{{$t('sent')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="route.meta.name === 'draft' ? 'choose-item' : ''">
          <Icon icon="ep:document" width="19" height="19" />
          <span class="menu-name">{{$t('drafts')}}</span>
          <span v-if="draftCount" class="count-badge">{{ badge(draftCount) }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'templates'})" index="templates"
                      :class="route.name === 'templates' ? 'choose-item' : ''">
          <Icon icon="fluent:document-bullet-list-20-regular" width="20" height="20" />
          <span class="menu-name">Templates</span>
        </el-menu-item>
        <el-menu-item @click="openFolder('snoozed')" index="snoozed"
                      :class="route.params.folderKey === 'snoozed' ? 'choose-item' : ''">
          <Icon icon="fluent:clock-20-regular" width="20" height="20" />
          <span class="menu-name">Snoozed</span>
          <span v-if="counts.snoozed" class="count-badge">{{ badge(counts.snoozed) }}</span>
        </el-menu-item>
        <el-menu-item @click="openFolder('spam')" index="spam"
                      :class="route.params.folderKey === 'spam' ? 'choose-item' : ''">
          <Icon icon="fluent:shield-error-20-regular" width="20" height="20" />
          <span class="menu-name">Spam</span>
          <span v-if="counts.spam" class="count-badge">{{ badge(counts.spam) }}</span>
        </el-menu-item>
        <el-menu-item @click="openFolder('trash')" index="trash"
                      :class="route.params.folderKey === 'trash' ? 'choose-item' : ''">
          <Icon icon="fluent:delete-20-regular" width="20" height="20" />
          <span class="menu-name">Trash</span>
          <span v-if="counts.trash" class="count-badge">{{ badge(counts.trash) }}</span>
        </el-menu-item>
        <el-menu-item @click="openFolder('archive')" index="archive"
                      :class="route.params.folderKey === 'archive' ? 'choose-item' : ''">
          <Icon icon="fluent:archive-20-regular" width="20" height="20" />
          <span class="menu-name">Archive</span>
          <span v-if="counts.archive" class="count-badge">{{ badge(counts.archive) }}</span>
        </el-menu-item>
        <el-menu-item @click="openFolder('outbox')" index="outbox"
                      :class="route.params.folderKey === 'outbox' ? 'choose-item' : ''">
          <Icon icon="fluent:send-clock-20-regular" width="20" height="20" />
          <span class="menu-name">Outbox</span>
          <span v-if="counts.outbox" class="count-badge">{{ badge(counts.outbox) }}</span>
        </el-menu-item>
        <el-menu-item v-for="folder in folders" :key="folder.folderId"
                      @click="openFolder('custom-' + folder.folderId)" :index="'custom-' + folder.folderId"
                      :class="route.params.folderKey === 'custom-' + folder.folderId ? 'choose-item' : ''">
          <Icon icon="fluent:folder-20-regular" width="20" height="20" />
          <span class="menu-name">{{ folder.name }}</span>
          <span v-if="folder.unreadCount" class="count-badge">{{ badge(folder.unreadCount) }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'star'})" index="star"
                      :class="route.meta.name === 'star' ? 'choose-item' : ''">
          <Icon icon="solar:star-line-duotone" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('starred')}}</span>
        </el-menu-item>
        <div class="section-title">SMART CATEGORIES</div>
        <el-menu-item @click="openFolder('newsletter')" index="newsletter"
                      :class="route.params.folderKey === 'newsletter' ? 'choose-item' : ''">
          <Icon icon="fluent:mail-list-20-regular" width="20" height="20" />
          <span class="menu-name">Newsletter</span>
          <span v-if="counts.newsletter" class="count-badge">{{ badge(counts.newsletter) }}</span>
        </el-menu-item>
        <el-menu-item @click="openFolder('notification')" index="notification"
                      :class="route.params.folderKey === 'notification' ? 'choose-item' : ''">
          <Icon icon="fluent:alert-20-regular" width="20" height="20" />
          <span class="menu-name">Notification</span>
          <span v-if="counts.notification" class="count-badge">{{ badge(counts.notification) }}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                      :class="route.meta.name === 'setting' ? 'choose-item' : ''">
          <Icon icon="fluent:settings-48-regular" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('settings')}}</span>
        </el-menu-item>
        <div class="manage-title" v-perm="['all-email:query','user:query','role:query','setting:query','analysis:query','reg-key:query']">
          <div>{{$t('manage')}}</div>
        </div>
        <el-menu-item @click="router.push({name: 'analysis'})" index="analysis" v-perm="'analysis:query'"
                      :class="route.meta.name === 'analysis' ? 'choose-item' : ''">
          <Icon icon="fluent:data-pie-20-regular" width="24" height="24" />
          <span class="menu-name" style="margin-left: 13px">{{$t('analytics')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'user'})" index="user" v-perm="'user:query'"
                      :class="route.meta.name === 'user' ? 'choose-item' : ''">
          <Icon icon="si:user-alt-2-line" width="20" height="20" />
          <span class="menu-name" style="margin-left: 16px">{{$t('allUsers')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'all-email'})" index="all-email" v-perm="'all-email:query'"
                      :class="route.meta.name === 'all-email' ? 'choose-item' : ''">
          <Icon icon="fluent:mail-list-28-regular" width="22" height="22" />
          <span class="menu-name" style="margin-left: 15px">{{$t('allMail')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'role'})" index="role" v-perm="'role:query'"
                      :class="route.meta.name === 'role' ? 'choose-item' : ''">
          <Icon icon="fluent:lock-closed-16-regular" width="22" height="22" />
          <span class="menu-name" style="margin-left: 15px">{{$t('permissions')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'reg-key'})" index="reg-key" v-perm="'reg-key:query'"
                      :class="route.meta.name === 'reg-key' ? 'choose-item' : ''">
          <Icon icon="fluent:fingerprint-20-filled" width="22" height="22" />
          <span class="menu-name" style="margin-left: 15px">{{$t('inviteCode')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'sys-setting'})" index="sys-setting" v-perm="'setting:query'"
                      :class="route.meta.name === 'sys-setting' ? 'choose-item' : ''">
          <Icon icon="eos-icons:system-ok-outlined" width="18" height="18" style="margin-left: 2px" />
          <span class="menu-name" style="margin-left: 17px">{{$t('SystemSettings')}}</span>
        </el-menu-item>
      </el-menu>
    </div>
      </nav>
      <el-dialog v-model="showFolderDialog" title="Create new folder" width="420px">
      <el-input v-model="folderName" maxlength="60" show-word-limit placeholder="Folder name" @keyup.enter="createFolder" />
      <template #footer>
        <el-button @click="showFolderDialog = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="createFolder">Create</el-button>
      </template>
      </el-dialog>
    </el-scrollbar>
  </div>
</template>

<script setup>
import router from "@/router/index.js";
import { useRoute } from "vue-router";
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {onMounted, onUnmounted, ref, watch} from "vue";
import {mailboxCounts, mailboxFolderCreate, mailboxFolderList} from "@/request/mailbox.js";
import {accountList} from "@/request/account.js";
import {userDraftStore} from "@/store/draft.js";
import db from "@/db/db.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {hasPerm} from "@/perm/perm.js";
import {computed} from "vue";
import {ElMessage} from "element-plus";
import {useEmailStore} from "@/store/email.js";

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
const canSwitchAccount = computed(() => hasPerm('account:query'));
const activeAccountEmail = computed(() =>
  accountStore.currentAccount?.email || userStore.user?.account?.email || ''
);
const accountInitial = computed(() => accountInitials(activeAccountEmail.value));

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

function openCompose() {
  uiStore.writerRef?.open()
}

</script>

<style lang="scss" scoped>

.title {
  margin: 14px 18px 18px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.brand-logo {
  width: 126px;
  height: 36px;
  object-fit: contain;
  object-position: left center;
}

.account-switch {
  display: block;
  margin: 0 14px 14px;
}

.account-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #3a2f28;
  border-radius: 7px;
  background: #100e0c;
  color: #f2ebe5;
  text-align: left;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.account-switcher:hover {
  border-color: rgba(194, 125, 79, .38);
  background: #18110d;
}

.account-switcher-static {
  width: calc(100% - 28px);
  margin: 0 14px 14px;
  cursor: default;
}

.account-switcher-static:hover {
  border-color: #3a2f28;
  background: #100e0c;
}

.account-avatar,
.account-option-avatar {
  display: grid;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 6px;
  background: rgba(255, 85, 0, .13);
  color: #ff8751;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .02em;
}

.account-switcher-copy {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.account-switcher-label {
  color: #a99b91;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .12em;
}

.account-switcher-email {
  overflow: hidden;
  color: #f2ebe5;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-switcher-arrow {
  color: #8d929a;
}

.account-option-email {
  overflow: hidden;
  max-width: 230px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-cta {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  width: calc(100% - 36px);
  height: 46px;
  margin: 0 18px 20px;
  gap: 8px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: #ff5500;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 5px 16px rgba(255, 85, 0, .2);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .08em;
  transition: filter .15s ease, transform .15s ease;
}

.compose-cta:hover {
  background: #e94c00;
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.compose-cta:active {
  transform: scale(.98);
}

.compose-cta:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

.compose-cta kbd {
  margin-left: auto;
  padding: 2px 7px;
  border: 1px solid rgba(255, 255, 255, .35);
  border-radius: 5px;
  color: rgba(255, 255, 255, .8);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0;
}

.compose-cta span {
  text-align: center;
}

.section-title {
  margin: 0 20px 8px;
  padding-top: 10px;
  border-top: 1px solid #3a2f28;
  color: #858b93;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .14em;
}

.folder-tools {
  margin: 0 14px 6px 20px;
  padding-top: 10px;
  border-top: 1px solid #3a2f28;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #858b93;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .14em;
}

.folder-tools :deep(.el-button) {
  color: #a99b91;
  padding: 4px;
}

.count-badge {
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 85, 0, .16);
  color: #ff8751;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
}

.manage-title {
  margin-top: 10px;
  padding-left: 20px;
  color: #a99b91;
}

.el-menu-item {
  margin: 3px 10px !important;
  border-radius: 6px;
  height: 37px;
  padding: 10px !important;
  color: #c1b4aa;
}

.choose-item {
  position: relative;
  font-weight: 400;
  color: #fff0e7 !important;
  background: rgba(255, 85, 0, 0.15) !important;
  backdrop-filter: blur(4px);
}

.choose-item::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #ff5500;
  content: "";
}

@media (hover: hover) {
  .el-menu-item:hover {
    background: rgba(255, 255, 255, 0.07) !important;
    color: #fff !important;
  }
}

.menu-name {
  margin-left: 16px;
  user-select: none;
}


:deep(.el-scrollbar__wrap--hidden-default ) {
  background: #0d0a08 !important;
}

:deep(.el-menu-item) {
  background: #0d0a08;
}

:deep(.el-menu) {
  background: #0d0a08;
}

.el-menu {
  border-right: 0;
  width: 100%;
}

.scroll,
:deep(.el-scrollbar__view) {
  background: #0d0a08;
}

:deep(.el-divider__text) {
  background: var(--aside-backgound);
  color: #FFFFFF;
}

.scroll {
  height: 100%;
}

.aside {
  width: 294px !important;
  height: 100%;
  flex: 0 0 294px;
  background: #fff;
}

.sidebar-shell {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid #e8e4e1;
  background: #fff;
}

.app-rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  background: #202020;
  color: #f9f8f7;
}

.rail-brand {
  display: grid;
  width: 40px;
  height: 40px;
  margin-bottom: 12px;
  place-items: center;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
}

.rail-brand img {
  width: 52px;
  height: 52px;
  object-fit: contain;
}

.rail-item {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  color: #c9c7c5;
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease;
}

.rail-item:hover,
.rail-item.active {
  background: rgba(255, 255, 255, .13);
  color: #fff;
}

.rail-item.active {
  box-shadow: inset 3px 0 #ff5500;
}

.rail-spacer {
  flex: 1;
}

.sidebar-navigation {
  min-height: 100%;
  padding-bottom: 16px;
  background: #fff;
}

.title {
  margin: 14px 16px 16px;
}

.account-switcher,
.account-switcher-static {
  border-color: #e7e2de;
  background: #fff;
  color: #292624;
}

.account-switcher:hover {
  border-color: #ffb18a;
  background: #fffaf7;
}

.account-switcher-static:hover {
  border-color: #e7e2de;
  background: #fff;
}

.account-switcher-label,
.account-switcher-arrow {
  color: #8a837f;
}

.account-switcher-email {
  color: #292624;
}

.section-title,
.folder-tools {
  border-color: #ece8e5;
  color: #918a86;
}

.folder-tools :deep(.el-button) {
  color: #77716d;
}

.count-badge {
  background: #fff0e8;
  color: #d94b00;
}

.manage-title {
  color: #807a76;
}

.el-menu-item {
  color: #605a56;
}

.choose-item {
  color: #aa3d00 !important;
  background: #fff2eb !important;
}

.scroll,
.scroll :deep(.el-scrollbar__view),
.scroll :deep(.el-scrollbar__wrap--hidden-default),
.scroll :deep(.el-menu-item),
.scroll :deep(.el-menu) {
  background: #fff !important;
}

.el-menu-item :deep(svg) {
  color: #77716d;
}

.choose-item :deep(svg) {
  color: #e65000;
}

@media (hover: hover) {
  .el-menu-item:hover {
    background: #f7f4f2 !important;
    color: #272321 !important;
  }
}

@media (max-width: 767px) {
  .sidebar-shell {
    grid-template-columns: 56px minmax(0, 1fr);
  }
}

@media (min-width: 701px) and (max-width: 900px) {
  .sidebar-shell {
    grid-template-columns: 52px minmax(0, 1fr);
  }
}
</style>

<style lang="scss">
.account-menu-popper {
  min-width: 270px;
  border: 1px solid #e7e2de !important;
  border-radius: 8px !important;
  background: #fff !important;
}

.account-menu-popper .el-dropdown-menu {
  max-height: min(460px, 70vh);
  overflow-y: auto;
  background: #fff;
}

.account-menu-popper .el-dropdown-menu__item {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 9px;
  color: #55504c;
}

.account-menu-popper .el-dropdown-menu__item:hover,
.account-menu-popper .account-option-active {
  background: #fff3ec;
  color: #292624;
}

.account-menu-popper .account-option-active > svg {
  margin-left: auto;
  color: #ff5500;
}
</style>
