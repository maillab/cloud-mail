<template>
  <div class="account-box" :class="{ 'panel-mode': panel }">
    <div class="head-opt">
      <span class="head-title" v-if="panel">{{ $t('account') }}</span>
      <div class="head-actions">
        <button v-perm="'account:add'" type="button" class="icon-btn" @click="add">
          <Icon icon="ion:add-outline" width="18" height="18"/>
        </button>
        <button type="button" class="icon-btn" @click="refresh">
          <Icon icon="ion:reload" width="17" height="17"/>
        </button>
      </div>
    </div>
    <el-scrollbar class="scrollbar" ref="scrollbarRef">
      <div v-infinite-scroll="getAccountList" :infinite-scroll-distance="600" :infinite-scroll-immediate="false">
        <div class="acct-item"
             :class="{ active: accountStore.currentAccountId === item.accountId }"
             v-for="(item, index) in accounts" :key="item.accountId"
             @click="changeAccount(item)">
          <span class="acct-avatar">{{ avatarInitial(item.email) }}</span>
          <span class="acct-meta">
            <span class="acct-email">{{ item.email }}</span>
            <span class="acct-sub" v-if="item.name">{{ item.name }}</span>
          </span>
          <span class="acct-actions" @click.stop>
            <button type="button" class="icon-btn" :class="{ 'is-on': item.allReceive }"
                    @click="setAllReceive(item)">
              <Icon v-if="!item.allReceive" icon="fluent:mail-24-regular" width="17" height="17"/>
              <Icon v-else icon="fluent:folder-mail-24-regular" width="17" height="17"/>
            </button>
            <button type="button" class="icon-btn" @click="copyAccount(item.email)">
              <Icon icon="fluent:clipboard-24-regular" width="17" height="17"/>
            </button>
            <el-dropdown v-if="!showNullSetting(item)" trigger="click" placement="bottom-end">
              <button type="button" class="icon-btn">
                <Icon icon="material-symbols-light:more-vert" width="18" height="18"/>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="hasPerm('email:send')" @click="openSetName(item)">{{ $t('rename') }}</el-dropdown-item>
                  <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId" @click="setAsTop(item, index)">{{ $t('pin') }}</el-dropdown-item>
                  <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId && hasPerm('account:delete')"
                                    @click="remove(item)">{{ $t('delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </span>
        </div>

        <!-- Initial Loading Skeleton -->
        <template v-if="loading">
          <div class="acct-item is-skeleton" v-for="i in skeletonRows" :key="i">
            <el-skeleton animated>
              <template #template>
                <div class="skeleton-row">
                  <el-skeleton-item variant="circle" style="width: 32px; height: 32px"/>
                  <div class="skeleton-lines">
                    <el-skeleton-item variant="text" style="width: 70%"/>
                    <el-skeleton-item variant="text" style="width: 40%"/>
                  </div>
                </div>
              </template>
            </el-skeleton>
          </div>
        </template>

        <!-- Follow Loading Skeleton -->
        <template v-if="accounts.length > 0 && !noLoading">
          <div class="acct-item is-skeleton">
            <el-skeleton animated>
              <template #template>
                <div class="skeleton-row">
                  <el-skeleton-item variant="circle" style="width: 32px; height: 32px"/>
                  <div class="skeleton-lines">
                    <el-skeleton-item variant="text" style="width: 70%"/>
                    <el-skeleton-item variant="text" style="width: 40%"/>
                  </div>
                </div>
              </template>
            </el-skeleton>
          </div>
        </template>

        <div class="noLoading" v-if="noLoading && accounts.length > 0">
          <div>{{ $t('noMoreData') }}</div>
        </div>
        <div class="empty" v-if="noLoading && accounts.length === 0">
          <el-empty :description="$t('noMessagesFound')"/>
        </div>
      </div>

    </el-scrollbar>
    <el-dialog v-model="showAdd" :title="$t('addAccount')">
      <div class="container">
        <el-input v-model="addForm.email" ref="addRef" type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="submit">
          <template #append>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="addForm.suffix"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div>
                <span>{{ addForm.suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
      <div
          ref="turnstileContainer"
          :key="turnstileContainerKey"
          class="add-email-turnstile"
          :class="verifyShow ? 'turnstile-show' : 'turnstile-hide'"
          :data-sitekey="settingStore.settings.siteKey"
          data-callback="onTurnstileSuccess"
          data-error-callback="onTurnstileError"
      >
        <span style="font-size: 12px;color: #F56C6C" v-if="botJsError">{{ $t('verifyModuleFailed', {action: $t('add')}) }}</span>
      </div>
    </el-dialog>
    <el-dialog v-model="setNameShow" :title="$t('changeUserName')" width="380px" align-center class="acct-dialog">
      <div class="dialog-body">
        <label class="dialog-label">{{ $t('username') }}</label>
        <el-input v-model="accountName" type="text" :placeholder="$t('username')" autocomplete="off"
                  size="large" @keyup.enter="setName"/>
      </div>
      <template #footer>
        <el-button text @click="setNameShow = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" class="dialog-submit" :loading="setNameLoading" @click="setName">
          {{ $t('save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
import {computed, nextTick, reactive, ref, watch} from "vue";
import {
  accountList,
  accountAdd,
  accountDelete,
  accountSetName,
  accountSetAllReceive,
  accountSetAsTop
} from "@/request/account.js";
import {sleep} from "@/utils/time-utils.js"
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useUserStore} from "@/store/user.js";
import {useUiStore} from "@/store/ui.js";
import {avatarInitial} from "@/utils/avatar.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {AccountAllReceiveEnum} from "@/enums/account-enum.js";
import {reloadTurnstileScript} from "@/utils/turnstile-script.js";

const props = defineProps({
  // 嵌在左下角浮层里使用时的紧凑模式
  panel: {
    type: Boolean,
    default: false
  }
})

const {t} = useI18n();
const userStore = useUserStore();
const uiStore = useUiStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const emailStore = useEmailStore();
const showAdd = ref(false)
const addLoading = ref(false);
const domainList = computed(() => settingStore.domainList)
const accounts = reactive([])
const noLoading = ref(false)
const loading = ref(false)
const followLoading = ref(false);
const verifyShow = ref(false)
const setNameShow = ref(false)
const setNameLoading = ref(false)
const accountName = ref(null)
const addRef = ref({})
const scrollbarRef = ref({})
let account = null
let turnstileId = null
const botJsError = ref(false)
let verifyToken = ''
let verifyErrorCount = 0
let turnstileRecoveryAttempted = false
const turnstileContainer = ref(null)
const turnstileContainerKey = ref(0)
let first = true
const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0]
})
let skeletonRows = 10
const queryParams = {
  size: 30
}

const mySelect = ref()

if (hasPerm('account:query')) {
  getAccountList()
}

watch(() => accountStore.changeUserAccountName, () => {
  accounts[0].name = accountStore.changeUserAccountName
})

watch(() => settingStore.domainList, (list) => {
  if (!addForm.suffix && list.length > 0) {
    addForm.suffix = list[0]
  }
}, {immediate: true})


const openSelect = () => {
  mySelect.value.toggleMenu()
}

async function recoverTurnstile() {
  if (turnstileRecoveryAttempted) return
  turnstileRecoveryAttempted = true
  botJsError.value = false
  verifyToken = ''
  turnstileId = null
  turnstileContainerKey.value++
  try {
    const api = await reloadTurnstileScript()
    await nextTick()
    if (!showAdd.value || !turnstileContainer.value) return
    turnstileId = api.render(turnstileContainer.value)
  } catch (error) {
    botJsError.value = true
    console.warn('Turnstile recovery failed', error)
  } finally {
    turnstileRecoveryAttempted = false
  }
}

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  console.warn('人机验加载失败', e)
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.add-email-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

function getSkeletonRows() {
  if (accounts.length > 20) return skeletonRows = 20
  if (accounts.length === 0) return skeletonRows = 1
  skeletonRows = accounts.length
}

function setName() {

  if (setNameLoading.value) return

  let name = accountName.value

  if (name === account.name) {
    setNameShow.value = false
    return
  }

  if (!name) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameLoading.value = true
  accountSetName(account.accountId, name).then(() => {
    account.name = name
    setNameShow.value = false

    if (account.accountId === userStore.user.account.accountId) {
      userStore.user.name = name
    }

    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  }).finally(() => {
    setNameLoading.value = false
  })
}

function openSetName(accountItem) {
  accountName.value = accountItem.name
  account = accountItem
  setNameShow.value = true
}

function setAllReceive(account) {
  let allReceiveAccount = accounts.find(account => account.allReceive === AccountAllReceiveEnum.ENABLED);
  if (allReceiveAccount && allReceiveAccount.accountId !== account.accountId) allReceiveAccount.allReceive = AccountAllReceiveEnum.DISABLED;
  account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
  accountSetAllReceive(account.accountId).catch(() => {
    account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
    if (allReceiveAccount) allReceiveAccount.allReceive = AccountAllReceiveEnum.ENABLED;
  }).then(() => {
    if (account.allReceive === AccountAllReceiveEnum.ENABLED) {
      ElMessage({
        message: t('setSuccess'),
        type: 'success',
        plain: true,
      })
    }
    changeAccount(account);
    emailStore.emailScroll?.refreshList();
    emailStore.sendScroll?.refreshList();
  })
}


function showNullSetting(item) {
  return !hasPerm('email:send') && !(item.accountId !== userStore.user.account.accountId && hasPerm('account:delete'))
}

function itemBg(accountId) {
  return accountStore.currentAccountId === accountId ? 'item-choose' : ''
}



function remove(account) {
  ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    accountDelete(account.accountId).then(() => {
      const index = accounts.findIndex(item => item.accountId === account.accountId);
      accounts.splice(index, 1);
      if (accounts.length < queryParams.size) {
        getAccountList()
      }
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  });
}

function refresh() {
  if (loading.value) {
    return
  }
  loading.value = false
  followLoading.value = false
  noLoading.value = false
  queryParams.accountId = 0
  queryParams.lastSort = null
  getSkeletonRows();
  scrollbarRef.value.setScrollTop(0)
  accounts.splice(0, accounts.length)
  getAccountList()
}

function changeAccount(account) {
  accountStore.currentAccountId = account.accountId
  accountStore.currentAccount = account
  if (props.panel) {
    uiStore.closeAccountPanel()
  }
}

function add() {
  addForm.suffix = addForm.suffix || settingStore.domainList[0]
  showAdd.value = true
  setTimeout(() => {
    addRef.value.focus()
  }, 100)
}

function setAsTop(account, index) {
  accountSetAsTop(account.accountId).then(() => {
    ElMessage({
      message: t('setSuccess'),
      type: 'success',
      plain: true,
    })

    const [item] = accounts.splice(index, 1);
    accounts.splice(1, 0, item);

  });
}

async function copyAccount(account) {
  try {
    await navigator.clipboard.writeText(account);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function getAccountList() {

  if (loading.value || followLoading.value || noLoading.value) return;

  if (accounts.length === 0) {
    loading.value = true
  } else {
    followLoading.value = true
  }

  let start = Date.now();

  const accountId = accounts.length > 0 ? accounts.at(-1).accountId : 0;
  const lastSort = accounts.length > 0 ? accounts.at(-1).sort : null;

  accountList(accountId, queryParams.size, lastSort).then(async list => {

    let end = Date.now();
    let duration = end - start;
    if (duration < 300) {
      await sleep(300 - duration)
    }

    if (list.length < queryParams.size) {
      noLoading.value = true
    }
    if (accounts.length === 0 && !accountStore.currentAccount?.accountId) {
      accountStore.currentAccount = list[0]
    }

    accounts.push(...list)

    loading.value = false
    followLoading.value = false
    first = false
  }).catch(() => {
    loading.value = false
    followLoading.value = false
  })
}


function submit() {

  if (addLoading.value) return

  if (!addForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (addForm.email.length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(addForm.email + addForm.suffix)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!verifyToken && (settingStore.settings.addEmailVerify === 0 || (settingStore.settings.addEmailVerify === 2 && settingStore.settings.addVerifyOpen))) {
    if (turnstileRecoveryAttempted) return
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.add-email-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
            recoverTurnstile()
          }
        } else {
          window.turnstile.reset('.add-email-turnstile')
        }
      })
    } else if (botJsError.value) {
      recoverTurnstile()
    } else {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  addLoading.value = true
  accountAdd(addForm.email + addForm.suffix, verifyToken).then(account => {
    addLoading.value = false
    addForm.email = ''
    accounts.push(account)
    verifyToken = ''
    settingStore.settings.addVerifyOpen = account.addVerifyOpen
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    verifyShow.value = false
    showAdd.value = false
    userStore.refreshUserInfo()
  }).catch(res => {
    if (res.code === 400) {
      verifyToken = ''
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.add-email-turnstile')
        })
      }
      verifyShow.value = true
    }
    addLoading.value = false
  })
}
</script>
<style>
path[fill="#ffdda1"] {
  fill: #ffdd7d;
}
</style>
<style scoped lang="scss">
.account-box {

  border-right: 1px solid var(--mail-hairline) !important;
  background-color: var(--el-bg-color);
  height: 100%;
  overflow: hidden;

  .head-opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    height: 44px;
    padding: 0 10px 0 14px;
    box-shadow: var(--header-actions-border);

    .head-title {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.06em;
      color: var(--secondary-text-color);
    }

    .head-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: auto;
    }
  }

  .icon-btn {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--secondary-text-color);
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;

    &:hover {
      background: var(--mail-nav-hover);
      color: var(--el-text-color-primary);
    }

    &.is-on {
      color: var(--el-color-primary);
    }
  }

  .scrollbar {
    width: 100%;
    height: calc(100% - 44px);
    overflow: auto;
    @media (max-width: 767px) {
      height: calc(100% - 98px);
    }

    .empty {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }

    .noLoading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px 0;
      color: var(--secondary-text-color);
    }
  }

  /* 账号行：头像 + 邮箱 / 备注，操作按钮只在悬停时出现 */
  .acct-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 8px 2px;
    padding: 8px 8px 8px 10px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.12s ease;

    &:hover {
      background: var(--mail-nav-hover);
    }

    &.active {
      background: var(--choose-account-background);
    }

    &.is-skeleton {
      cursor: default;
      pointer-events: none;

      &:hover {
        background: transparent;
      }
    }
  }

  .acct-avatar {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    background: var(--el-color-primary-light-8);
    color: var(--el-color-primary);
    user-select: none;
  }

  .acct-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.4;
  }

  .acct-email {
    font-size: 13px;
    color: var(--el-text-color-primary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .acct-sub {
    font-size: 11.5px;
    color: var(--secondary-text-color);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .acct-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.12s ease;

    .icon-btn {
      width: 26px;
      height: 26px;
      border-radius: 7px;
    }
  }

  .acct-item:hover .acct-actions,
  .acct-item.active .acct-actions {
    opacity: 1;
  }

  /* 触屏没有悬停，直接常显 */
  @media (hover: none) {
    .acct-actions {
      opacity: 1;
    }
  }

  .skeleton-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  .skeleton-lines {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .btn {
    width: 100%;
    margin-top: 15px;
  }

  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dialog-label {
    font-size: 12.5px;
    color: var(--secondary-text-color);
  }

  .dialog-submit {
    border-radius: 999px;
    padding-left: 22px;
    padding-right: 22px;
  }

  /* 左下角浮层里的紧凑模式 */
  &.panel-mode {
    border-right: none !important;
    height: auto;

    .head-opt {
      height: 34px;
      box-shadow: none;
      padding: 0 2px 0 4px;
      margin-bottom: 4px;
    }

    .scrollbar {
      height: min(320px, 46vh);
    }

    .acct-item {
      margin-left: 0;
      margin-right: 0;
    }

    .noLoading {
      padding: 6px 0;
    }
  }
}



.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: var(--el-bg-color);
}

:deep(.el-dialog) {
  width: 400px !important;
  border-radius: 14px;
  padding: 24px 24px 20px;
  box-shadow: 0 16px 48px rgba(16, 24, 40, 0.18), 0 2px 8px rgba(16, 24, 40, 0.06);
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.el-dialog__header) {
  padding: 0;
  margin-right: 0;
}

:deep(.el-dialog__title) {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--el-text-color-primary);
}

:deep(.el-dialog__body) {
  padding: 12px 0 4px;
}

:deep(.el-dialog__footer) {
  padding: 16px 0 0;
}

:deep(.el-dialog__footer .el-button) {
  border-radius: 999px;
  padding-left: 20px;
  padding-right: 20px;
}

:deep(.el-input__wrapper) {
  border-radius: 10px;
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

:deep(.el-pagination .el-select) {
  width: 100px;
  background: var(--el-bg-color);
}

.add-email-turnstile {
  margin-top: 15px;
}

.turnstile-show {
  opacity: 1;
}

.turnstile-hide {
  opacity: 0;
  pointer-events: none;
  position: fixed;
}

</style>
