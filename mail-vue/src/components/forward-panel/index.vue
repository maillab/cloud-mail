<template>
  <div class="forward-panel">
    <div class="desc">{{ $t('forwardDesc') }}</div>
    <div class="list" v-loading="listLoading">
      <div class="row" v-for="item in list" :key="item.forwardId">
        <div class="row-main">
          <span class="target" :title="item.targetEmail">{{ item.targetEmail }}</span>
          <el-tag v-if="item.status === 0" type="warning" size="small">{{ $t('forwardPending') }}</el-tag>
          <el-tag v-else-if="item.status === 1 || item.status === 2" type="success" size="small">{{ $t('forwardActive') }}</el-tag>
          <el-tooltip v-else :content="item.lastError || ''" :disabled="!item.lastError" placement="top">
            <el-tag type="danger" size="small">{{ $t('forwardFailed', {count: item.failCount}) }}</el-tag>
          </el-tooltip>
        </div>
        <div class="row-opt">
          <template v-if="item.status === 0">
            <el-button size="small" @click="openCode(item)">{{ $t('forwardEnterCode') }}</el-button>
            <el-button size="small" :loading="item.busy" @click="resend(item)">{{ $t('forwardResend') }}</el-button>
          </template>
          <el-switch v-else-if="item.status === 1 || item.status === 2" size="small" :model-value="item.status === 1"
                     :loading="item.busy" :before-change="() => toggle(item)"/>
          <el-button v-else size="small" :loading="item.busy" @click="reEnable(item)">{{ $t('forwardReEnable') }}</el-button>
          <el-button size="small" type="danger" plain @click="remove(item)">{{ $t('delete') }}</el-button>
        </div>
        <div class="code-row" v-if="codeId === item.forwardId">
          <el-input :model-value="code" @update:model-value="onCodeInput" size="small" inputmode="numeric"
                    :placeholder="$t('forwardEnterCode')" @keyup.enter="submitCode(item)"/>
          <el-button size="small" type="primary" :loading="codeLoading" @click="submitCode(item)">{{ $t('confirm') }}</el-button>
        </div>
      </div>
    </div>
    <div class="add-row">
      <el-input v-model="targetEmail" :disabled="list.length >= 3" :placeholder="$t('forwardInputDesc')"
                autocomplete="off" @keyup.enter="add"/>
      <el-button type="primary" :disabled="list.length >= 3" :loading="addLoading" @click="add">{{ $t('add') }}</el-button>
    </div>
    <div class="tip">{{ $t('forwardLimitTip') }}</div>
  </div>
</template>
<script setup>
import {onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {isEmail} from "@/utils/verify-utils.js";
import {
  forwardList,
  forwardAdd,
  forwardVerify,
  forwardResendCode,
  forwardSetStatus,
  forwardDelete
} from "@/request/forward.js";

const {t} = useI18n();
const list = ref([])
const listLoading = ref(false)
const targetEmail = ref('')
const addLoading = ref(false)
const codeId = ref(null)
const code = ref('')
const codeLoading = ref(false)

function load() {
  listLoading.value = true
  return forwardList().then(rows => {
    list.value = rows.map(row => ({...row, busy: false}))
  }).finally(() => {
    listLoading.value = false
  })
}

onMounted(() => {
  load()
})

function msg(message, type = 'success') {
  ElMessage({message, type, plain: true})
}

function add() {
  if (addLoading.value || list.value.length >= 3) return
  const email = targetEmail.value.trim()
  if (!isEmail(email)) {
    msg(t('notEmailMsg'), 'error')
    return
  }
  addLoading.value = true
  forwardAdd(email).then(row => {
    targetEmail.value = ''
    list.value.push({...row, busy: false})
    msg(t('forwardCodeSent', {email: row.targetEmail}))
  }).finally(() => {
    addLoading.value = false
  })
}

function openCode(item) {
  code.value = ''
  codeId.value = codeId.value === item.forwardId ? null : item.forwardId
}

// 先去掉非数字再截断，粘贴 " 202721 " 这类带空格/分隔符的码不会被截掉一位
function onCodeInput(value) {
  code.value = String(value ?? '').replace(/\D/g, '').slice(0, 6)
}

function submitCode(item) {
  const value = code.value.trim()
  if (!value || codeLoading.value) return
  codeLoading.value = true
  forwardVerify(item.forwardId, value).then(() => {
    codeId.value = null
    code.value = ''
    msg(t('forwardActive'))
  }).catch(() => {
  }).finally(() => {
    codeLoading.value = false
    // wrong code counts attempts / may void the code, so always resync with the server
    load()
  })
}

function resend(item) {
  item.busy = true
  forwardResendCode(item.forwardId).then(() => {
    msg(t('forwardCodeSent', {email: item.targetEmail}))
  }).finally(() => {
    item.busy = false
  })
}

function setStatus(item, status) {
  item.busy = true
  return forwardSetStatus(item.forwardId, status).then(() => {
    item.status = status
    if (status === 1) item.failCount = 0
    return true
  }).finally(() => {
    item.busy = false
  })
}

function toggle(item) {
  return setStatus(item, item.status === 1 ? 2 : 1).catch(() => false)
}

function reEnable(item) {
  setStatus(item, 1).catch(() => {})
}

function remove(item) {
  ElMessageBox.confirm(t('forwardDelConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    forwardDelete(item.forwardId).then(() => {
      list.value = list.value.filter(row => row.forwardId !== item.forwardId)
      if (codeId.value === item.forwardId) codeId.value = null
      msg(t('delSuccessMsg'))
    })
  }).catch(() => {})
}
</script>
<style scoped lang="scss">
.forward-panel {
  width: 100%;
  max-width: 560px;
}

.desc, .tip {
  font-size: 12px;
  line-height: 1.5;
  color: var(--secondary-text-color);
}

.list {
  margin: 12px 0;
  min-height: 20px;

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .row-main {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;

      .target {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }

    .row-opt {
      display: flex;
      align-items: center;
      gap: 8px;

      .el-button + .el-button {
        margin-left: 0;
      }
    }

    .code-row {
      display: flex;
      gap: 8px;
      width: 100%;
    }
  }
}

.add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;

  .el-input {
    flex: 1;
  }
}
</style>
