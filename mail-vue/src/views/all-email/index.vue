<template>
  <div class="email-list-box">
    <emailScroll ref="sysEmailScroll"
                 :get-emailList="getEmailList"
                 :email-delete="allEmailDelete"
                 :star-add="starAdd"
                 :star-cancel="starCancel"
                 :show-star="false"
                 show-user-info
                 show-status
                 actionLeft="4px"
                 :show-account-icon="false"
                 :time-sort="params.timeSort"
                 :item-height="65"
                 @jump="jumpContent"
                 @refresh-before="refreshBefore"
                 @right-search="rightSearch"
                 :type="'all-email'"

    >
      <template #first>
        <el-input
            v-model="searchValue"
            :placeholder="$t('searchByContent')"
            class="search-input"
        >
          <template #prefix>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="params.searchType"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option key="3" :label="$t('sender')" :value="'name'"/>
                <el-option key="4" :label="$t('subject')" :value="'subject'"/>
                <el-option key="1" :label="$t('user')" :value="'user'"/>
                <el-option key="2" :label="$t('selectEmail')" :value="'account'"/>
              </el-select>
              <div class="search-type">
                <span>{{ selectTitle }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-select v-model="params.type" placeholder="Select" class="status-select" @change="typeSelectChange">
          <el-option key="1" :label="$t('all')" value="all"/>
          <el-option key="3" :label="$t('received')" value="receive"/>
          <el-option key="2" :label="$t('sent')" value="send"/>
          <el-option key="4" :label="$t('selectDeleted')" value="delete"/>
          <el-option key="4" :label="$t('noRecipientTitle')" value="noone"/>
        </el-select>
        <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
              v-if="params.timeSort === 0" width="28" height="28"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
              width="28" height="28"/>
        <Icon class="icon clear" icon="fluent:broom-sparkle-16-regular" width="22" height="22" @click="openBathDelete"/>
      </template>
    </emailScroll>
    <el-dialog v-model="showBathDelete" :title="$t('clearEmail')" width="335"
               @closed="closedClear">
      <div class="clear-email">
        <el-input v-model="clearParams.sendName" :placeholder="$t('sender')"/>
        <el-input v-model="clearParams.subject" :placeholder="$t('subject')"/>
        <el-input v-model="clearParams.sendEmail" :placeholder="$t('sendEmailAddress')"/>
        <el-input v-model="clearParams.toEmail" :placeholder="$t('toEmail')"/>
        <el-date-picker popper-class="my-date-picker"
                        v-model="clearTime"
                        type="daterange"
                        :teleported="false"
                        unlink-panels
                        :range-separator="t('to')"
                        size="default"
        />
        <div class="clear-button">
          <el-select v-model="clearParams.type" style="width: 200px">
            <el-option key="eq" :label="t('equal')" value="eq"/>
            <el-option key="left" :label="t('leading')" value="left"/>
            <el-option key="include" :label="t('include')" value="include"/>
          </el-select>
          <el-button :loading="clearLoading" type="primary" @click="batchDelete">{{ t('clear') }}</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {starAdd, starCancel} from "@/request/star.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {computed, defineOptions, reactive, ref, watch, onMounted} from "vue";
import {useEmailStore} from "@/store/email.js";
import {
  allEmailList,
  allEmailDelete,
  allEmailBatchDelete,
  allEmailLatest
} from "@/request/all-email.js";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import {useI18n} from 'vue-i18n';
import {toUtc} from "@/utils/day.js";
import {sleep} from "@/utils/time-utils.js";
import {useSettingStore} from "@/store/setting.js";
import { useRoute } from 'vue-router'

defineOptions({
  name: 'all-email'
})

const route = useRoute()
const {t} = useI18n();
const emailStore = useEmailStore();
const settingStore = useSettingStore();
const clearTime = ref('')
const sysEmailScroll = ref({})
const searchValue = ref('')
const mySelect = ref()
const showBathDelete = ref(false)
const clearLoading = ref(false)

onMounted(() => {
  latest();
})

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const params = reactive({
  timeSort: 0,
  type: 'receive',
  userEmail: null,
  accountEmail: null,
  name: null,
  subject: null,
  searchType: 'name'
})

const clearParams = reactive({
  subject: '',
  sendEmail: '',
  sendName: '',
  startTime: '',
  toEmail: '',
  endTime: '',
  type: 'eq',
})

function resetClearParams() {
  clearParams.subject = ''
  clearParams.sendEmail = ''
  clearParams.sendName = ''
  clearParams.startTime = ''
  clearParams.toEmail = ''
  clearParams.endTime = ''
}

function closedClear() {
  resetClearParams()
  clearParams.type = 'eq'
  clearParams.endTime = ''
  clearTime.value = null
}

const selectTitle = computed(() => {
  if (params.searchType === 'user') return t('user')
  if (params.searchType === 'account') return t('selectEmail')
  if (params.searchType === 'name') return t('sender')
  if (params.searchType === 'subject') return t('subject')
})

const paramsStar = localStorage.getItem('all-email-params')
if (paramsStar) {
  const locaParams = JSON.parse(paramsStar)
  params.type = locaParams.type
  params.timeSort = locaParams.timeSort
  params.status = locaParams.status
  params.searchType = locaParams.searchType
}

watch(() => params, () => {
  localStorage.setItem('all-email-params', JSON.stringify(params))
}, {
  deep: true
})

function openBathDelete() {
  showBathDelete.value = true
}

function batchDelete() {

  if (clearTime.value) {
    clearParams.startTime = toUtc(clearTime.value[0]).format("YYYY-MM-DD HH:mm:ss")
    clearParams.endTime = toUtc(clearTime.value[1]).add(1, 'day').format("YYYY-MM-DD HH:mm:ss")
  }

  if (!clearParams.sendEmail && !clearParams.sendName && !clearParams.subject && !clearParams.toEmail && !clearTime.value) {
    showBathDelete.value = false
    return
  }

  ElMessageBox.confirm(
      t('delAllConfirm'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning',
      }
  ).then(() => {
    clearLoading.value = true

    allEmailBatchDelete(clearParams).then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: "success",
        plain: true
      })
      resetClearParams()
      sysEmailScroll.value.refreshList();
    }).finally(() => {
      clearLoading.value = false
    })
  })
}

function rightSearch(type, value) {
  params.searchType = type;
  searchValue.value = value;
  search();
}

function refreshBefore() {
  searchValue.value = null
  params.timeSort = 0
  params.type = 'receive'
  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null
  params.searchType = 'name'
}

function search() {

  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null

  if (params.searchType === 'user') {
    params.userEmail = searchValue.value
  }

  if (params.searchType === 'account') {
    params.accountEmail = searchValue.value
  }

  if (params.searchType === 'name') {
    params.name = searchValue.value
  }

  if (params.searchType === 'subject') {
    params.subject = searchValue.value
  }

  sysEmailScroll.value.refreshList();
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  search()
}

function typeSelectChange() {
  search()
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push({name: 'content'})
}


function getEmailList(emailId, size) {
  const query = {size, ...params}
  // 降序第一页不发送 emailId=0，兼容旧后端；升序第一页的 0 是有效游标。
  if (emailId > 0 || params.timeSort === 1) query.emailId = emailId
  return allEmailList(query)
}

async function latest() {

  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;

    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    const latestId = sysEmailScroll.value.latestEmail?.emailId

    if (autoRefresh < 2) {
      continue
    }

    if (!latestId && latestId !== 0) {
      continue
    }

    if (route.name !== 'all-email') {
      continue
    }


    if (params.type !== 'receive') {
      continue
    }

    try {

      const curTimeSort = params.timeSort
      let list = await allEmailLatest(latestId)

      if (list.length === 0) {
        continue
      }

      if (params.type !== 'receive') {
        continue
      }

      // 确保回来之后条件没变
      if (params.timeSort !== curTimeSort) {
        continue
      }

      for (let email of list) {

        sysEmailScroll.value.addItem(email)
        await sleep(50)

      }

    } catch (e) {
      if (e.code === 401 || e.code === 403) {
        settingStore.settings.autoRefresh = 0;
      }
      console.error(e)
    }

  }
}

</script>
<style>

@media (max-width: 767px) {
  .el-date-range-picker .el-picker-panel__body {
    min-width: auto;

  }

  .my-date-picker::after {
    content: "";
    position: absolute; /* 脱离文档流，不会撑开 */
    left: 0;
    right: 0;
    height: 20px;
    background: transparent; /* 方便看效果 */
  }

  .el-date-range-picker__content {
    width: 100%;
  }

  .el-date-range-picker {
    width: 300px;
  }

  .el-tooltip .el-picker_popper {
    padding-bottom: 200px;
  }

  .el-date-range-picker__content.is-left {
    border-right: 0;
  }
}

</style>
<style scoped lang="scss">
.email-list-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}


.search {
  padding-top: 5px;
  padding-bottom: 5px;
}

.select {
  position: absolute;
  width: 40px;
  opacity: 0;
  pointer-events: none;
}

.search-type {
  display: flex;
  color: var(--el-text-color-regular);
}

:deep(.header-actions) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.search-input {
  width: 100%;
  max-width: 280px;
  height: 28px;

  .setting-icon {
    position: relative;
    top: 3px;
  }
}

.clear-email {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.clear-button {
  display: flex;
  align-items: center;
  gap: 15px;

  .el-button {
    width: 100%;
  }
}

.status-select {
  margin-bottom: 2px;
  width: 102px;

  :deep(.el-select__wrapper) {
    min-height: 28px;
  }
}

.input-with-select {
  max-width: 200px;
  border-radius: 0 4px 4px 0;
}

:deep(.input-with-select .el-input-group__append) {
  background-color: var(--el-fill-color-blank);
}

:deep(.el-select__wrapper) {
  padding: 2px 10px;
  min-height: 28px;
}

:deep(.el-date-editor.el-input__wrapper) {
  width: 303px;
}

.icon {
  cursor: pointer;
}

.clear {
  @media (max-width: 419px) {
    position: absolute;
    top: 41px;
    left: 242px;
  }
}

:deep(.reload) {
  @media (max-width: 419px) {
    position: absolute;
    top: 42px;
    left: 208px;
  }
}

:deep(.delete) {
  @media (max-width: 456px) {
    position: absolute;
    top: 43px;
    left: 294px;
  }

  @media (max-width: 419px) {
    position: absolute;
    top: 43px;
    left: 282px;
  }
}
</style>
