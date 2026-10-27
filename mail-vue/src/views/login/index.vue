<template>
  <div id="login-box" class="login-surface" v-loading="oauthLoading" element-loading-text="Signing in...">
    <main class="login-layout">
      <img class="login-brand-logo" src="/xpass-logo.png" alt="XPass" />
      <section class="login-brand">
        <div class="login-brand-copy">
          <div class="login-brand-kicker"><span></span> INTERNAL WORKSPACE.</div>
          <h1>The event ends.<br /><em>The relationship shouldn’t.</em></h1>
          <p>Powering the infrastructure behind seamless event commerce and organizer success.</p>
        </div>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <h2>Sign In</h2>
          <p class="login-card-description">
            Sign in to continue.
          </p>

          <form class="auth-form" @submit.prevent="submit">
            <div class="auth-field">
              <label for="login-username">{{ hideLoginDomain ? $t('emailAccount') : 'Username' }}</label>
              <el-input
                id="login-username"
                v-model="form.email"
                type="text"
                :placeholder="hideLoginDomain ? 'name@company.com' : 'your.name'"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                @keyup.enter="submit"
              >
                <template v-if="!hideLoginDomain" #append>
                  <div class="domain-picker" @click.stop="openSelect">
                    <el-select ref="mySelect" v-model="suffix" :placeholder="$t('select')" class="select">
                      <el-option v-for="item in domainList" :key="item" :label="item" :value="item" />
                    </el-select>
                    <span>{{ suffix }}</span>
                    <Icon icon="mingcute:down-small-fill" width="16" height="16" />
                  </div>
                </template>
              </el-input>
            </div>
            <div class="auth-field">
              <label for="login-password">{{ $t('password') }}</label>
              <el-input
                id="login-password"
                v-model="form.password"
                type="password"
                show-password
                :placeholder="$t('password')"
                autocomplete="current-password"
                @keyup.enter="submit"
              />
            </div>
            <el-button class="auth-submit" type="primary" native-type="submit" :loading="loginLoading">
              {{ loginLoading ? 'Signing in…' : 'Sign in' }}
            </el-button>
            <div v-if="oauthProviders.length" class="oauth-list">
              <el-button v-for="p in oauthProviders" :key="p.key" class="oauth-button" @click="oauthLogin(p.key)">
                <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="18" />
                <Icon v-else :icon="p.icon" width="18" height="18" />
                {{ p.label }}
              </el-button>
            </div>
          </form>

        </div>
        <div class="login-brand-footer">Confidential system. Access limited to authorized personnel.</div>
      </section>
    </main>
    <el-dialog class="bind-dialog" v-model="showBindForm" title="Connect your email">
      <div class="bind-container">
        <el-input v-model="bindForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="bind">
          <template v-if="!hideLoginDomain" #append>
            <div class="domain-picker" @click.stop="openSelect">
              <el-select ref="mySelect" v-model="suffix" :placeholder="$t('select')" class="select">
                <el-option v-for="item in domainList" :key="item" :label="item" :value="item" />
              </el-select>
              <span>{{ suffix }}</span>
              <Icon icon="mingcute:down-small-fill" width="16" height="16" />
            </div>
          </template>
        </el-input>
        <el-input v-if="settingStore.settings.regKey === 0" v-model="bindForm.code" :placeholder="$t('regKey')" type="text" autocomplete="off" @keyup.enter="bind" />
        <el-input v-if="settingStore.settings.regKey === 2" v-model="bindForm.code" :placeholder="$t('regKeyOptional')" type="text" autocomplete="off" @keyup.enter="bind" />
        <el-button class="auth-submit" type="primary" :loading="bindLoading" @click="bind">Connect account</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import router from "@/router";
import {useRoute} from "vue-router";
import {computed, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {websiteConfig} from "@/request/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {Icon} from "@iconify/vue";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import {useI18n} from "vue-i18n";
import {oauthBindUser, oauthLinuxDoLogin, oauthGithubLogin, oauthGoogleLogin} from "@/request/ouath.js";

const {t} = useI18n();
const accountStore = useAccountStore();
const userStore = useUserStore();
const settingStore = useSettingStore();
const route = useRoute();
const loginLoading = ref(false)
const bindLoading = ref(false)
const oauthLoading = ref(false);
const showBindForm = ref(false);

const oauthKeys = ['linuxdo', 'github', 'google']

const oauthProvider = computed(() => {
  const fromState = route.query.state
  if (oauthKeys.includes(fromState)) return fromState
  const fromStore = sessionStorage.getItem('oauthProvider')
  return oauthKeys.includes(fromStore) ? fromStore : null
})

const oauthProviders = computed(() => {
  const allProviders = [
    { key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify' },
    { key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify' },
    { key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image' },
  ]
  return allProviders.filter(p => settingStore.settings[p.key + 'Switch'] === 0)
})

const bindForm = reactive({
  email: '',
  oauthUserId: '',
  code: ''
})

const form = reactive({
  email: '',
  password: '',

});
const mySelect = ref()
const suffix = ref('')
const domainList = settingStore.domainList;
suffix.value = domainList[0]

const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const getFullEmail = (email) => {
  return hideLoginDomain.value ? email : email + suffix.value
}

const getEmailName = (email) => {
  return email.split('@')[0]
}

function oauthLogin(provider) {
  const clientId = settingStore.settings[provider + 'ClientId']
  const redirectUri = encodeURIComponent(window.location.origin + '/login')
  sessionStorage.setItem('oauthProvider', provider)
  const authorizeUrls = {
    linuxdo: `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
    github: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&state=${provider}`,
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
  }
  window.location.href = authorizeUrls[provider]
}

const loginFns = {
  linuxdo: oauthLinuxDoLogin,
  github: oauthGithubLogin,
  google: oauthGoogleLogin,
}

oauthGetUser();

async function oauthGetUser() {

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code || !oauthProvider.value) return

  const provider = oauthProvider.value
  oauthLoading.value = true
  sessionStorage.removeItem('oauthProvider')
  window.history.replaceState({}, '', window.location.origin + window.location.pathname)

  loginFns[provider](code, window.location.origin + '/login').then(data => {

    bindForm.oauthUserId = data.userInfo.oauthUserId;

    if (!data.token) {
      showBindForm.value = true
      oauthLoading.value = false
      ElMessage({
        message: 'Register an email address to connect this account.',
        type: 'warning',
        duration: 4000,
        plain: true,
      })
      return;
    }

    saveToken(data.token);
  }).catch(() => {
    oauthLoading.value = false
  })
}

function bind() {

  if (bindLoading.value) return

  if (!bindForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }


  if (getEmailName(bindForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(bindForm.email);


  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!bindForm.code) {

      ElMessage({
        message: t('emptyRegKeyMsg'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  const form = {email, oauthUserId: bindForm.oauthUserId, code: bindForm.code}

  bindLoading.value = true
  oauthBindUser(form).then(data => {
    saveToken(data.token)
  }).catch(() => {
    bindLoading.value = false
  })
}

const submit = () => {

  if (loginLoading.value) return

  if (!form.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(form.email);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  loginLoading.value = true
  login(email, form.password).then(async data => {
    await saveToken(data.token)
  }).finally(() => {
    loginLoading.value = false
  })
}

async function saveToken(token) {
  localStorage.setItem('token', token)
  refreshWebsiteConfig()
  const user = await loginUserInfo();
  accountStore.currentAccountId = user.account.accountId;
  accountStore.currentAccount = user.account;
  userStore.user = user;
  const routers = permsToRouter(user.permKeys);
  routers.forEach(routerData => {
    router.addRoute('layout', routerData);
  });
  await router.replace({name: 'layout'})
  oauthLoading.value = false;
  bindLoading.value = false;
}

function refreshWebsiteConfig() {
  websiteConfig().then(setting => {
    settingStore.settings = setting
    settingStore.domainList = setting.domainList
    if (!suffix.value && setting.domainList.length > 0) {
      suffix.value = setting.domainList[0]
    }
    document.title = 'XPass Mail'
  }).catch(e => {
    console.error(e)
  })
}


</script>


<style>
.el-select-dropdown__item {
  padding: 0 15px;
}

.no-autofill-pwd {
  .el-input__inner {
    -webkit-text-security: disc !important;
  }
}
</style>

<style scoped>
#login-box {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100vh;
  height: 100svh;
  min-height: 0;
  overflow: hidden;
  background: #050403;
  color: #f2ebe5;
  font-family: Manrope, Inter, "Segoe UI", sans-serif;
}

.login-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
  align-items: center;
  gap: clamp(56px, 9vw, 132px);
  width: min(1120px, 100%);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding: 48px;
}

.login-brand {
  display: flex;
  min-width: 0;
  height: min(590px, 76vh);
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0;
  margin: 0;
  padding: 4px 0;
  font: inherit;
}

.login-brand-logo {
  width: 144px !important;
  height: 42px !important;
  border-radius: 0 !important;
  object-fit: contain;
  object-position: left center;
}

.login-brand-copy {
  max-width: 460px;
}

.login-brand-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 22px;
  color: #c1b4aa;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
}

.login-brand-kicker span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff5500;
}

.login-brand-copy h1 {
  max-width: 12ch;
  margin: 0;
  color: #f2ebe5;
  font: 700 clamp(38px, 5vw, 60px)/1.08 "Space Grotesk", Manrope, sans-serif;
  letter-spacing: -.05em;
}

.login-brand-copy h1 em,
.login-brand em {
  color: #ff8751;
  font-style: normal;
}

.login-brand-copy p {
  max-width: 380px;
  margin: 20px 0 0;
  color: #b2a49a;
  font-size: 14px;
  line-height: 1.75;
}

.login-brand-footer {
  color: #857970;
  font-size: 12px;
}

.login-panel {
  display: block;
  width: 100%;
  padding: 0;
}

.login-card {
  width: 100%;
  max-width: none;
  max-height: min(760px, calc(100svh - 48px));
  overflow: hidden;
  padding: 32px;
  border: 1px solid rgba(194, 125, 79, .2);
  border-radius: 12px;
  background: #100e0c;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .35);
}

.login-logo {
  display: none;
  width: 132px;
  height: 42px;
  margin: 0 auto 24px;
  object-fit: contain;
}

.login-card h2 {
  margin: 0;
  color: #f2ebe5;
  font: 700 25px/1.25 Manrope, sans-serif;
  letter-spacing: -.025em;
}

.login-card-description {
  margin: 8px 0 0;
  color: #b2a49a;
  font-size: 13px;
}

.auth-form {
  gap: 16px;
  margin-top: 25px;
}

.auth-field {
  display: grid;
  gap: 8px;
}

.auth-field > label {
  color: #e6ded7;
  font-size: 12px;
  font-weight: 600;
}

.auth-field :deep(.el-input__wrapper) {
  min-height: 44px;
  border-radius: 7px;
  background: #0d0a08;
  box-shadow: 0 0 0 1px rgba(194, 125, 79, .26) inset;
}

.auth-field :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #ff5500 inset, 0 0 0 3px rgba(255, 85, 0, .12);
}

.auth-field :deep(.el-input__inner) {
  color: #f2ebe5;
  font-size: 13px;
}

.auth-field :deep(.el-input__inner::placeholder) {
  color: #857970;
}

.auth-field :deep(.el-input-group__append) {
  border-left: 1px solid rgba(194, 125, 79, .2);
  border-radius: 0 7px 7px 0;
  background: #18110d;
  color: #c1b4aa;
}

.auth-submit {
  min-height: 44px;
  border: 1px solid #ff5500;
  border-radius: 7px;
  background: #ff5500;
  color: #160d08;
  font-size: 13px;
  font-weight: 700;
  transition: background-color .15s ease, border-color .15s ease;
}

.auth-submit:hover,
.auth-submit:focus {
  border-color: #ff8244;
  background: #ff8244;
  color: #160d08;
}

.oauth-list {
  display: grid;
  gap: 9px;
}

.oauth-button {
  min-height: 42px;
  border: 1px solid rgba(194, 125, 79, .22);
  border-radius: 7px;
  background: #18110d;
  color: #f2ebe5;
}

.oauth-button:hover {
  border-color: rgba(194, 125, 79, .38);
  background: #211811;
  color: #fff;
}

.auth-switch {
  margin-top: 18px;
  color: #b2a49a;
  font-size: 12px;
  text-align: center;
}

.auth-switch button {
  color: #ff8751;
}

.login-card.registering {
  overflow-y: auto;
}

@media (max-width: 800px) {
  .login-layout {
    grid-template-columns: minmax(0, 420px);
    justify-content: center;
    padding: 24px;
  }

  .login-brand {
    display: none;
  }

  .login-logo {
    display: block;
  }

  .login-card h2,
  .login-card-description {
    text-align: center;
  }
}

@media (max-width: 480px) {
  #login-box {
    overflow: hidden;
  }

  .login-layout {
    padding: 12px;
  }

  .login-card {
    max-height: calc(100svh - 24px);
    padding: 24px 20px;
    border-radius: 9px;
  }
}
</style>

<style scoped>
#login-box {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100vh;
  height: 100svh;
  min-height: 0;
  overflow: hidden;
  color: #f2ebe5;
  background: #181614;
}

.login-layout {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  place-items: center;
  padding: 16px;
}

.login-panel {
  display: block;
  width: min(420px, 100%);
  padding: 0;
}

.login-card {
  width: 100%;
  max-width: none;
  max-height: calc(100svh - 32px);
  overflow: hidden;
  padding: 22px 26px;
  border: 1px solid #403731;
  border-radius: 14px;
  background: #211e1b;
}

.login-logo {
  display: block;
  width: min(190px, 60%);
  height: 54px;
  margin: 0 auto 12px;
  object-fit: contain;
}

.login-card h2 {
  margin: 0;
  color: #f2ebe5;
  font-size: 24px;
  text-align: center;
}

.login-card-description {
  margin: 6px 0 0;
  color: #b2a49a;
  font-size: 13px;
  text-align: center;
}

.auth-form {
  display: grid;
  gap: 13px;
  margin-top: 18px;
}

.auth-field {
  display: grid;
  gap: 7px;
}

.auth-field > label {
  color: #e6ded7;
  font-size: 13px;
  font-weight: 600;
}

.auth-field :deep(.el-input__wrapper) {
  min-height: 42px;
  border-radius: 7px;
  background: #181614;
  box-shadow: 0 0 0 1px #443a33 inset;
}

.auth-field :deep(.el-input__inner) {
  color: #f2ebe5;
}

.auth-field :deep(.el-input-group__append) {
  border: 0;
  border-left: 1px solid #403731;
  background: #302a26;
  color: #c1b4aa;
}

.domain-picker {
  position: relative;
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.domain-picker .select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}

.auth-submit {
  width: 100%;
  min-height: 42px;
  margin: 2px 0 0 !important;
  border-color: #ff5500;
  border-radius: 7px;
  background: #ff5500;
  color: #fff;
  font-weight: 700;
}

.auth-submit:hover,
.auth-submit:focus {
  border-color: #e94c00;
  background: #e94c00;
  color: #fff;
}

.oauth-list {
  display: grid;
  gap: 8px;
}

.oauth-button {
  width: 100%;
  min-height: 40px;
  margin: 0 !important;
  border: 1px solid #51453d;
  border-radius: 7px;
  background: #302a26;
  color: #f2ebe5;
}

.oauth-button:hover {
  border-color: #766354;
  background: #39312c;
  color: #fff;
}

.auth-switch {
  margin-top: 14px;
  color: #b2a49a;
  font-size: 12px;
  text-align: center;
}

.auth-switch button {
  margin-left: 4px;
  padding: 0;
  background: none;
  color: #ff7b3d;
  cursor: pointer;
  font-weight: 600;
}

.register-turnstile {
  margin-bottom: 0;
}

.verify-error {
  color: #f87171;
  font-size: 12px;
}

.bind-container {
  display: grid;
  gap: 14px;
}

.bind-dialog :deep(.el-dialog) {
  border: 1px solid #403731;
  border-radius: 12px;
  background: #211e1b;
}

.bind-dialog :deep(.el-dialog__title),
.bind-dialog :deep(.el-dialog__body) {
  color: #f2ebe5;
}

.login-card.registering {
  overflow-y: auto;
}

@media (max-width: 720px) {
  .login-layout {
    padding: 12px;
  }

  .login-card {
    max-height: calc(100svh - 24px);
    padding: 20px;
  }
}
</style>

<style scoped>
#login-box {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100vh;
  height: 100svh;
  min-height: 0;
  overflow: hidden;
  background: #181614;
}

.login-layout {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  place-items: center;
  padding: 16px;
}

.login-panel {
  display: block;
  width: min(420px, 100%);
  padding: 0;
}

.login-card {
  width: 100%;
  max-width: none;
  max-height: calc(100svh - 32px);
  overflow: hidden;
  padding: 22px 26px;
  border-color: #403731;
  border-radius: 14px;
  background: #211e1b;
}

.login-logo {
  display: block;
  width: min(190px, 60%);
  height: 64px;
  margin: 0 auto 14px;
  object-fit: contain;
}

.login-card h2 {
  text-align: center;
}

.login-card-description {
  margin-top: 6px;
  text-align: center;
}

.auth-form {
  gap: 13px;
  margin-top: 18px;
}

.auth-switch {
  margin-top: 14px;
}

.login-card.registering {
  overflow-y: auto;
}

@media (max-width: 720px) {
  #login-box {
    overflow: hidden;
  }

  .login-layout {
    display: grid;
    min-height: 0;
    padding: 12px;
  }

  .login-card {
    max-height: calc(100svh - 24px);
    padding: 20px;
  }
}
</style>

<style scoped>
#login-box {
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #15171a;
  color: #f0f1f2;
}

.login-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
  align-items: center;
  gap: clamp(56px, 9vw, 132px);
  width: min(1120px, 100%);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding: 48px;
}

.login-brand {
  display: flex;
  min-width: 0;
  height: min(590px, 76vh);
  flex-direction: column;
  justify-content: space-between;
  padding: 4px 0;
}

.login-brand-logo {
  position: fixed;
  top: clamp(24px, 3.5vw, 48px);
  left: clamp(24px, 3.5vw, 48px);
  z-index: 3;
  width: 144px;
  height: 42px;
  object-fit: contain;
  object-position: left center;
}

.login-brand-copy {
  max-width: 460px;
}

.login-brand-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 22px;
  color: #c2c5ca;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.login-brand-kicker span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff5500;
}

.login-brand-copy h1 {
  margin: 0;
  color: #f0f1f2;
  font-size: clamp(40px, 5vw, 62px);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -.055em;
}

.login-brand-copy h1 em {
  color: #ff8751;
  font-style: normal;
}

.login-brand-copy p {
  max-width: 380px;
  margin: 20px 0 0;
  color: #9da2aa;
  font-size: 15px;
  line-height: 1.7;
}

.login-brand-footer {
  color: #737982;
  font-size: 12px;
}

.login-panel {
  width: 100%;
  padding: 0;
}

.login-card {
  max-height: min(760px, calc(100svh - 48px));
  padding: 32px;
  border: 1px solid #30343a;
  border-radius: 10px;
  background: #1c1f23;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .18);
}

.login-logo {
  display: none;
  width: 132px;
  height: 42px;
  margin: 0 0 24px;
}

.login-card h2 {
  color: #f0f1f2;
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -.025em;
  text-align: left;
}

.login-card-description {
  margin-top: 6px;
  color: #969ba3;
  font-size: 13px;
  text-align: left;
}

.auth-form {
  gap: 15px;
  margin-top: 26px;
}

.auth-field > label {
  color: #d7d9dc;
  font-size: 12px;
  font-weight: 600;
}

.auth-field :deep(.el-input__wrapper) {
  min-height: 43px;
  border-radius: 6px;
  background: #17191c;
  box-shadow: 0 0 0 1px #34383e inset;
}

.auth-field :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #ff5500 inset, 0 0 0 3px rgba(255, 85, 0, .12);
}

.auth-field :deep(.el-input__inner) {
  color: #f0f1f2;
}

.auth-field :deep(.el-input__inner::placeholder) {
  color: #696f78;
}

.auth-field :deep(.el-input-group__append) {
  border-left: 1px solid #34383e;
  border-radius: 0 6px 6px 0;
  background: #25282d;
  color: #c2c5ca;
}

.auth-submit {
  min-height: 43px;
  border: 1px solid #ff5500;
  border-radius: 6px;
  background: #ff5500;
  font-size: 13px;
  font-weight: 650;
  transition: background-color .15s ease, border-color .15s ease;
}

.auth-submit:hover,
.auth-submit:focus {
  border-color: #e94c00;
  background: #e94c00;
}

.oauth-list {
  gap: 9px;
}

.oauth-button {
  min-height: 41px;
  border: 1px solid #34383e;
  border-radius: 6px;
  background: #22252a;
  color: #e2e4e7;
}

.oauth-button:hover {
  border-color: #4a4f57;
  background: #282c31;
  color: #fff;
}

.auth-switch {
  margin-top: 18px;
  color: #9297a0;
  font-size: 12px;
}

.auth-switch button {
  color: #ff8751;
}

.login-card.registering {
  overflow-y: auto;
}

@media (max-width: 800px) {
  .login-layout {
    grid-template-columns: minmax(0, 420px);
    justify-content: center;
    padding: 24px;
  }

  .login-brand {
    display: none;
  }

  .login-logo {
    display: block;
    margin-left: auto;
    margin-right: auto;
  }

  .login-card h2,
  .login-card-description {
    text-align: center;
  }
}

@media (max-width: 480px) {
  .login-layout {
    padding: 12px;
  }

  .login-card {
    max-height: calc(100svh - 24px);
    padding: 24px 20px;
    border-radius: 8px;
  }
}
</style>

<style lang="scss" scoped>

.form-wrapper {
  position: fixed;
  right: 0;
  height: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  @media (max-width: 767px) {
    width: 100%;
  }
}

.container {
  background: rgba(33, 30, 27, .96);
  padding-left: 40px;
  padding-right: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 450px;
  height: 100%;
  border-left: 1px solid var(--login-border);
  box-shadow: var(--el-box-shadow-light);
  @media (max-width: 1024px) {
    padding: 20px 18px;
    width: 384px;
    margin-left: 18px;
  }
  @media (max-width: 767px) {
    border: 1px solid var(--login-border);
    padding: 20px 18px;
    border-radius: 6px;
    height: fit-content;
    width: 100%;
    margin-right: 18px;
    margin-left: 18px;
  }

  .btn {
    height: 36px;
    width: 100%;
    border-radius: 6px;
  }

  .form-desc {
    margin-top: 5px;
    margin-bottom: 18px;
    color: var(--form-desc-color);
  }

  .form-title {
    font-weight: bold;
    font-size: 22px !important;
  }

  .switch {
    margin-top: 20px;
    text-align: center;

    span {
      color: var(--login-switch-color);
      cursor: pointer;
    }
  }

  :deep(.el-input__wrapper) {
    border-radius: 6px;
    background: var(--el-bg-color);
  }

  .email-input :deep(.el-input__wrapper) {
    border-radius: 6px 0 0 6px;
    background: var(--el-bg-color);
  }

  .el-input {
    height: 38px;
    width: 100%;
    margin-bottom: 18px;

    :deep(.el-input__inner) {
      height: 36px;
    }
  }
}

:deep(.el-select-dropdown__item) {
  padding: 0 10px;
}

:deep(.bind-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.bind-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  padding-right: 4px !important;
  background: var(--el-bg-color);
  border-radius: 0 8px 8px 0;
}

:deep(.el-button+.el-button) {
  margin: 0;
}

.register-turnstile {
  margin-bottom: 18px;
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.custom-style {
  margin-bottom: 10px;
}

.custom-style .el-segmented {
  --el-border-radius-base: 6px;
  width: 180px;
}


#login-box {
  background: #15171a;
  font: 100% Arial, sans-serif;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr;
}

.login-background-image {
  position: fixed;
  inset: 0;
  opacity: .16;
  pointer-events: none;
}

#background-wrap {
  height: 100%;
  z-index: 0;
}

.cloud {
  background: linear-gradient(to bottom, #fff 5%, #f1f1f1 100%);
  border-radius: 100px;
  box-shadow: 0 8px 5px rgba(0, 0, 0, 0.1);
  height: 120px;
  width: 350px;
  position: relative;
}

.cloud:after,
.cloud:before {
  content: "";
  position: absolute;
  background: #fff;
  z-index: -1;
}

.cloud:after {
  border-radius: 100px;
  height: 100px;
  left: 50px;
  top: -50px;
  width: 100px;
}

.cloud:before {
  border-radius: 200px;
  height: 180px;
  width: 180px;
  right: 50px;
  top: -90px;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
  font: 800 22px/1 var(--font-display, 'Manrope', sans-serif);
  letter-spacing: -.7px;
}

.login-brand img {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: contain;
}

.login-brand em {
  color: #ff5500;
  font-style: normal;
}

#login-box {
  position: fixed;
  inset: 0;
  height: 100dvh;
  color: #f2ebe5;
  font-family: 'DM Sans', sans-serif;
  background:
    radial-gradient(ellipse at 18% 18%, rgba(255, 85, 0, .12), transparent 34%),
    radial-gradient(ellipse at 82% 84%, rgba(120, 75, 47, .11), transparent 32%),
    #181614;
}

#background-wrap,
.cloud {
  display: none;
}

.form-wrapper {
  inset: 0;
  width: 100%;
  padding: 24px;
}

.container {
  width: min(450px, 100%);
  height: auto;
  min-height: 0;
  margin: 0;
  padding: 36px;
  border: 1px solid #403731;
  border-radius: 18px;
  background: rgba(33, 30, 27, .96);
  box-shadow: 0 24px 80px rgba(0, 0, 0, .38);
}

.container .form-title {
  color: #f2ebe5;
  font: 800 27px/1.2 'Manrope', sans-serif;
  letter-spacing: -.7px;
}

.container .form-desc {
  margin-top: 8px;
  margin-bottom: 24px;
  color: #b2a49a;
}

.container .btn {
  min-height: 42px;
  height: auto;
  margin-top: 4px;
  border-color: #51453d;
  border-radius: 9px;
  background: #302a26;
  color: #f2ebe5;
}

.container :deep(.el-button--primary) {
  border-color: #ff5500;
  background: #ff5500;
  color: #fff;
  font-weight: 700;
}

.container :deep(.el-button--primary:hover) {
  border-color: #e94c00;
  background: #e94c00;
}

.container :deep(.el-input__wrapper),
.container :deep(.el-input-group__append) {
  border-color: #443a33;
  background: #282320;
  box-shadow: 0 0 0 1px #443a33 inset;
}

.container :deep(.el-input__inner),
.container :deep(.el-input-group__append) {
  color: #f2ebe5;
}

.container :deep(.el-input__inner::placeholder) {
  color: #a99b91;
}

.container .switch {
  color: #b2a49a;
}

.container .switch span {
  color: #ff7b3d;
}

@media (max-width: 480px) {
  .container {
    padding: 28px 22px;
  }

  .login-brand {
    margin-bottom: 26px;
  }
}

#login-box {
  position: relative;
  inset: auto;
  display: block;
  width: 100%;
  min-height: 100dvh;
  height: auto;
  overflow: hidden;
  color: #f2ebe5;
  background:
    radial-gradient(ellipse at 18% 18%, rgba(255, 85, 0, .12), transparent 34%),
    radial-gradient(ellipse at 82% 84%, rgba(120, 75, 47, .11), transparent 32%),
    #181614;
  font-family: 'DM Sans', Manrope, sans-serif;
}

.login-background-image {
  z-index: 0;
  background-size: cover !important;
  background-position: center !important;
  opacity: .14;
}

.login-top-actions {
  position: absolute;
  top: 24px;
  right: max(24px, calc((100vw - 1152px) / 2));
  z-index: 2;
}

.login-language {
  padding: 8px 12px;
  border: 1px solid #403731;
  border-radius: 8px;
  background: rgba(33, 30, 27, .85);
  color: #b2a49a;
  font-size: 12px;
}

.login-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(400px, .92fr);
  gap: 48px;
  width: min(1152px, 100%);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 72px 32px 88px;
}

.login-story {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 0;
}

.login-story-copy {
  max-width: 520px;
  margin: auto 0;
  padding: 76px 0;
}

.login-eyebrow {
  margin-bottom: 18px;
  color: #ff7b3d;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
}

.login-story-copy h1 {
  margin: 0;
  color: #f2ebe5;
  font: 700 clamp(38px, 5vw, 60px)/1.06 'Space Grotesk', Manrope, sans-serif;
  letter-spacing: -.045em;
}

.login-story-copy h1 span {
  color: #ff5500;
}

.login-story-description {
  max-width: 390px;
  margin: 24px 0 0;
  color: #b2a49a;
  font-size: 15px;
  line-height: 1.75;
}

.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px 0;
}

.login-brand-mobile {
  display: none;
}

.login-card {
  width: 100%;
  max-width: 430px;
  padding: 34px;
  border: 1px solid #403731;
  border-radius: 14px;
  background: rgba(33, 30, 27, .94);
  box-shadow: 0 24px 80px rgba(0, 0, 0, .38);
}

.login-card h2 {
  margin: 0;
  color: #f2ebe5;
  font: 700 26px/1.25 Manrope, sans-serif;
  letter-spacing: -.025em;
}

.login-card-description {
  margin: 9px 0 0;
  color: #b2a49a;
  font-size: 13px;
  line-height: 1.65;
}

.auth-form {
  display: grid;
  gap: 18px;
  margin-top: 26px;
}

.auth-field {
  display: grid;
  gap: 8px;
}

.auth-field > label {
  color: #e6ded7;
  font-size: 13px;
  font-weight: 600;
}

.auth-field :deep(.el-input__wrapper) {
  min-height: 44px;
  border-radius: 7px;
  background: #181614;
  box-shadow: 0 0 0 1px #443a33 inset;
}

.auth-field :deep(.el-input__inner) {
  color: #f2ebe5;
  font-size: 13px;
}

.auth-field :deep(.el-input__inner::placeholder) {
  color: #857970;
}

.auth-field :deep(.el-input-group__append) {
  border: 0;
  border-left: 1px solid #403731;
  border-radius: 0 7px 7px 0;
  background: #302a26;
  box-shadow: none;
}

.domain-picker {
  position: relative;
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 6px;
  color: #c1b4aa;
  cursor: pointer;
  font-size: 12px;
}

.domain-picker .select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}

.auth-submit {
  width: 100%;
  min-height: 44px;
  margin: 2px 0 0 !important;
  border-color: #ff5500;
  border-radius: 7px;
  background: #ff5500;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.auth-submit:hover,
.auth-submit:focus {
  border-color: #e94c00;
  background: #e94c00;
  color: #fff;
}

.oauth-list {
  display: grid;
  gap: 9px;
}

.oauth-button {
  width: 100%;
  min-height: 42px;
  margin: 0 !important;
  border: 1px solid #51453d;
  border-radius: 7px;
  background: #302a26;
  color: #f2ebe5;
  font-size: 13px;
}

.oauth-button:hover {
  border-color: #766354;
  background: #39312c;
  color: #fff;
}

.oauth-button :deep(.el-avatar) {
  margin-right: 2px;
}

.auth-switch {
  margin-top: 22px;
  color: #b2a49a;
  font-size: 12px;
  text-align: center;
}

.auth-switch button {
  margin-left: 4px;
  padding: 0;
  background: none;
  color: #ff7b3d;
  cursor: pointer;
  font-weight: 600;
}

.auth-switch button:hover {
  color: #ff9b6b;
}

.login-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 22px 24px;
  color: #857970;
  font-size: 11px;
  text-align: center;
}

.register-turnstile {
  margin-bottom: 0;
}

.verify-error {
  color: #f87171;
  font-size: 12px;
}

.bind-container {
  display: grid;
  gap: 14px;
}

.bind-dialog :deep(.el-dialog) {
  border: 1px solid #403731;
  border-radius: 12px;
  background: #211e1b;
}

.bind-dialog :deep(.el-dialog__title),
.bind-dialog :deep(.el-dialog__body) {
  color: #f2ebe5;
}

@media (max-width: 900px) {
  .login-layout {
    grid-template-columns: minmax(0, 1fr) minmax(360px, .9fr);
    gap: 28px;
    padding-right: 24px;
    padding-left: 24px;
  }

  .login-card {
    padding: 28px;
  }
}

@media (max-width: 720px) {
  #login-box {
    overflow: auto;
  }

  .login-top-actions {
    top: 18px;
    right: 18px;
  }

  .login-layout {
    display: flex;
    min-height: 100dvh;
    flex-direction: column;
    justify-content: center;
    padding: 64px 18px 72px;
  }

  .login-story {
    display: none;
  }

  .login-panel {
    display: block;
    padding: 0;
  }

  .login-brand-mobile {
    display: flex;
    justify-content: center;
    margin: 0 auto 24px;
  }

  .login-card {
    max-width: 440px;
    margin: 0 auto;
    padding: 28px 24px;
  }

  .login-footer {
    padding: 16px 20px;
  }
}

</style>

<style scoped>
#login-box {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100vh;
  height: 100svh;
  min-height: 0;
  overflow: hidden;
  background: #181614;
}

.login-layout {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  place-items: center;
  padding: 16px;
}

.login-panel {
  display: block;
  width: min(420px, 100%);
  padding: 0;
}

.login-card {
  max-height: calc(100svh - 32px);
  overflow: hidden;
  padding: 22px 26px;
}

.login-logo {
  height: 54px;
  margin-bottom: 12px;
}

.auth-form {
  gap: 13px;
  margin-top: 18px;
}

@media (max-width: 720px) {
  .login-layout {
    padding: 12px;
  }

  .login-card {
    max-height: calc(100svh - 24px);
    padding: 20px;
  }
}
</style>

<style scoped>
#login-box {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  background: #151311;
}

.login-layout {
  grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
  gap: clamp(32px, 6vw, 88px);
  width: min(1120px, 100%);
  height: 100%;
  min-height: 0;
  padding: 40px;
  box-sizing: border-box;
}

.login-brand {
  position: relative;
  display: flex;
  min-width: 0;
  height: min(590px, 76vh);
  flex-direction: column;
  justify-content: flex-end;
}

.login-brand-copy {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.login-brand-logo {
  width: 144px;
  height: 42px;
  object-fit: contain;
  object-position: left center;
}

.login-panel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  width: 100%;
  min-width: 0;
}

.login-brand-footer {
  text-align: center;
}

.login-card {
  width: 100%;
  max-width: none;
  max-height: calc(100svh - 48px);
  overflow: auto;
}

.login-logo {
  display: none;
}

@media (min-width: 801px) and (max-height: 700px) {
  .login-brand {
    height: auto;
    justify-content: center;
    gap: 24px;
  }

  .login-brand-copy {
    position: static;
    transform: none;
  }

  .login-brand-copy h1 {
    font-size: clamp(34px, 4vw, 48px);
  }

  .login-brand-copy p {
    margin-top: 14px;
  }
}

@media (max-width: 800px) {
  .login-layout {
    grid-template-columns: minmax(0, 420px);
    justify-content: center;
    padding: 24px;
  }

  .login-brand {
    display: none;
  }

  .login-panel {
    width: 100%;
  }

  .login-card h2,
  .login-card-description {
    text-align: center;
  }
}

@media (max-width: 480px) {
  .login-layout {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px;
  }

  .login-card {
    max-height: calc(100svh - 24px);
    padding: 22px 20px;
  }
}
</style>
