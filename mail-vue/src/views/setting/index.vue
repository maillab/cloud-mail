<template>
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAutoDelete')}}</div>
        <div>
          <el-tooltip effect="dark" :content="$t('emailAutoDeleteDesc')">
            <el-input-number 
              v-model="emailAutoDeleteDays" 
              @change="handleSetEmailAutoDeleteDays" 
              :min="1" 
              :max="30" 
              :precision="0" 
              style="width: 150px"
            >
              <template #suffix>
                <span>{{ $t('dayUnit') }}</span>
              </template>
            </el-input-number>
          </el-tooltip>
        </div>
      </div>
      <div class="item">
        <div>{{$t('githubBinding')}}</div>
        <div>
          <div v-if="userStore.user.oauthId" class="github-info" @click="showUnbindConfirm">
            <el-avatar :src="userStore.user.githubAvatar" :size="30" style="margin-right: 10px" />
            <span class="github-username">{{ userStore.user.githubUsername }}</span>
            <el-icon class="unbind-icon">
              <Icon icon="mingcute:delete-fill" width="16" height="16" />
            </el-icon>
          </div>
          <el-button v-else type="primary" @click="bindGithub">
            <el-avatar src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" :size="18" style="margin-right: 10px" />{{$t('bindGithub')}}
          </el-button>
        </div>
      </div>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {reactive, ref, defineOptions, onMounted} from 'vue'
import {resetPassword, userDelete, setEmailAutoDeleteDays, unbindGithub as unbindGithubApi} from "@/request/my.js"
import {useUserStore} from "@/store/user.js"
import router from "@/router/index.js"
import {accountSetName} from "@/request/account.js"
import {useAccountStore} from "@/store/account.js"
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {Icon} from "@iconify/vue";

const { t } = useI18n()
const accountStore = useAccountStore()
const userStore = useUserStore();
const settingStore = useSettingStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const emailAutoDeleteDays = ref(30)
const setEmailAutoDeleteLoading = ref(false)
const unbindGithubLoading = ref(false)

// 显示解绑确认对话框
const showUnbindConfirm = () => {
  ElMessageBox.confirm(t('unbindGithubConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    handleUnbindGithub()
  })
}

defineOptions({
  name: 'setting'
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}

// 设置邮件自动删除天数
const handleSetEmailAutoDeleteDays = () => {
  setEmailAutoDeleteLoading.value = true
  setEmailAutoDeleteDays(emailAutoDeleteDays.value).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    setEmailAutoDeleteLoading.value = false
  }).catch(() => {
    setEmailAutoDeleteLoading.value = false
  })
}

// 绑定GitHub账号
const bindGithub = () => {
  const clientId = settingStore.settings.githubClientId
  const redirectUri = encodeURIComponent(settingStore.settings.githubCallbackUrl)
  window.location.href =
      `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=user:email`
}

// 解绑GitHub账号
const handleUnbindGithub = () => {
  ElMessageBox.confirm(t('unbindGithubConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    unbindGithubLoading.value = true
    unbindGithubApi().then(() => {
      ElMessage({
        message: t('unbindSuccessMsg'),
        type: 'success',
        plain: true,
      })
      userStore.user.oauthId = null
      unbindGithubLoading.value = false
    }).catch(() => {
      unbindGithubLoading.value = false
    })
  })
}

// 组件挂载时获取用户信息，包括邮件自动删除设置
onMounted(() => {
  // 从用户信息中获取邮件自动删除设置
  if (userStore.user.emailAutoDeleteDays) {
    emailAutoDeleteDays.value = userStore.user.emailAutoDeleteDays
  } else {
    emailAutoDeleteDays.value = 30
  }
})


function submitPwd() {

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}
</style>
