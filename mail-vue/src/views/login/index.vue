<template>
  <div id="login-box" class="login-surface" v-loading="oauthLoading" element-loading-text="Signing in...">
    <span class="login-arc" aria-hidden="true"></span>
    <main class="login-layout">
      <img class="login-brand-logo" src="/xpass-wordmark-inverted.png" alt="XPass HQ" width="188" height="47" />
      <section class="login-brand">
        <div class="login-brand-copy">
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

          <form v-if="!mfaChallenge" class="auth-form" @submit.prevent="submit">
            <div class="auth-field">
              <label for="login-username">{{ hideLoginDomain ? $t('emailAccount') : 'Username' }}</label>
              <div class="company-account-field" :class="{ 'is-single-domain': !hideLoginDomain && domainList.length <= 1, 'is-full-account': hideLoginDomain }">
                <input
                  id="login-username"
                  v-model="form.email"
                  class="company-account-input"
                  type="text"
                  :placeholder="hideLoginDomain ? 'name@company.com' : 'your.name'"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                  @keyup.enter="submit"
                />
                <template v-if="!hideLoginDomain && domainList.length === 1">
                  <span class="company-account-domain is-fixed">@{{ domainList[0] }}</span>
                </template>
                <template v-else-if="!hideLoginDomain">
                  <div class="company-account-domain is-picker">
                    <el-select
                      ref="mySelect"
                      v-model="suffix"
                      class="company-account-select"
                      :teleported="false"
                    >
                      <el-option v-for="item in domainList" :key="item" :label="`@${item}`" :value="item" />
                    </el-select>
                    <span class="company-account-domain-text">@{{ suffix }}</span>
                    <Icon icon="mingcute:down-small-fill" width="14" height="14" />
                  </div>
                </template>
              </div>
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

          <form v-else class="auth-form" @submit.prevent="submitMfa">
            <div class="auth-field">
              <div class="mfa-identity-hint" v-if="emailHint">Signing in as <strong>{{ emailHint }}</strong></div>
              <label for="login-code">{{ mfaMode === 'recovery' ? 'Recovery code' : 'Authenticator code' }}</label>
              <el-input
                v-if="mfaMode === 'recovery'"
                id="login-recovery"
                ref="mfaInput"
                v-model="mfaRecovery"
                maxlength="11"
                class="mfa-recovery-input"
                placeholder="XXXXX-XXXXX"
                autocomplete="off"
                @keyup.enter="submitMfa"
              />
              <el-input
                v-else
                id="login-code"
                ref="mfaInput"
                v-model="mfaCode"
                maxlength="6"
                class="mfa-code-input"
                placeholder="000000"
                autocomplete="one-time-code"
                inputmode="numeric"
                @keyup.enter="submitMfa"
              />
              <p v-if="mfaMode === 'totp'" class="mfa-help">
                Open your authenticator app and enter the six-digit code for XPass HQ.
              </p>
              <p v-else class="mfa-help">
                Enter one of the recovery codes you saved when you secured your account.
              </p>
              <p v-if="mfaError" class="inline-error">{{ mfaError }}</p>
            </div>
            <el-button class="auth-submit" type="primary" native-type="submit" :loading="loginLoading">
              {{ loginLoading ? 'Verifying…' : (mfaMode === 'recovery' ? 'Continue' : 'Verify') }}
            </el-button>
            <div class="auth-switch">
              <el-button
                v-if="mfaMode === 'totp'"
                class="auth-link"
                @click="switchMfaMode('recovery')"
              >
                Can't access your authenticator? Use a recovery code
              </el-button>
              <el-button
                v-else
                class="auth-link"
                @click="switchMfaMode('totp')"
              >
                Back to authenticator code
              </el-button>
            </div>
            <div class="oauth-list">
              <el-button class="oauth-button" @click="cancelMfa">Sign in with a different account</el-button>
            </div>
          </form>

        </div>
        <div class="login-brand-footer">Confidential system. Access limited to authorized personnel.</div>
      </section>
    </main>
    <el-dialog class="bind-dialog" v-model="showBindForm" title="Connect your email">
      <div class="bind-container">
        <div class="auth-field">
          <label for="bind-username">{{ $t('emailAccount') }}</label>
          <div class="company-account-field" :class="{ 'is-single-domain': !hideLoginDomain && domainList.length <= 1, 'is-full-account': hideLoginDomain }">
            <input
              id="bind-username"
              v-model="bindForm.email"
              class="company-account-input"
              type="text"
              :placeholder="hideLoginDomain ? 'name@company.com' : 'your.name'"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              @keyup.enter="bind"
            />
            <template v-if="!hideLoginDomain && domainList.length === 1">
              <span class="company-account-domain is-fixed">@{{ domainList[0] }}</span>
            </template>
            <template v-else-if="!hideLoginDomain">
              <div class="company-account-domain is-picker">
                <el-select
                  ref="bindSelect"
                  v-model="suffix"
                  class="company-account-select"
                  :teleported="false"
                >
                  <el-option v-for="item in domainList" :key="item" :label="`@${item}`" :value="item" />
                </el-select>
                <span class="company-account-domain-text">@{{ suffix }}</span>
                <Icon icon="mingcute:down-small-fill" width="14" height="14" />
              </div>
            </template>
          </div>
        </div>
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
import {computed, nextTick, reactive, ref} from "vue";
import {login, verifyMfa} from "@/request/login.js";
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

// Second factor. The password is verified first, then the member either enters
// A code or a recovery code; only then is a session issued.
const mfaChallenge = ref(false)
const mfaMode = ref('totp')
const mfaCode = ref('')
const mfaRecovery = ref('')
const mfaError = ref('')
const mfaInput = ref(null)
// The pre-auth challenge token issued after the password stage. The MFA
// verify endpoint derives the member's identity from this, so the client
// never re-sends the email or password.
const preAuthToken = ref('')
const emailHint = ref('')
const mySelect = ref()
const bindSelect = ref()
const suffix = ref('')

// The worker stores company domains with or without the leading @ depending on
// their age. Normalise once so the input always renders and submits one valid
// address: username + @ + domain. This avoids the old rodneygetxpass.net bug.
const domainName = (value) => String(value || '').trim().replace(/^@+/, '')

// The domain list comes from the server, but the login page must remain usable
// while the API is unreachable (worker cold start / network hiccup). Fall back
// to the build-time domain so the suffix field is never blank.
const domainList = computed(() => {
  const fromServer = settingStore.domainList
  if (Array.isArray(fromServer) && fromServer.length) {
    return fromServer.map(domainName).filter(Boolean)
  }
  const fallback = domainName(import.meta.env.VITE_LOGIN_DOMAIN || 'example.com')
  return [fallback]
})
if (!suffix.value) suffix.value = domainList.value[0]

const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)

const getFullEmail = (email) => {
  const value = String(email || '').trim()
  if (hideLoginDomain.value) return value
  const localPart = value.replace(/^@+/, '')
  const domain = domainName(suffix.value)
  return localPart && domain ? `${localPart}@${domain}` : value
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
    if (data?.onboardingRequired) {
      // A restricted session: it can reach the onboarding endpoints and nothing
      // else, so the member is taken straight to security setup.
      localStorage.setItem('token', data.token)
      await router.replace({name: 'onboarding'})
      return
    }
    // MFA is required: the server returned a pre-auth challenge instead of a
    // session. Show the MFA screen and carry the challenge token.
    if (data?.preAuthToken || data?.mfaRequired) {
      mfaChallenge.value = true
      mfaMode.value = 'totp'
      mfaCode.value = ''
      mfaRecovery.value = ''
      mfaError.value = ''
      preAuthToken.value = data.preAuthToken || ''
      emailHint.value = data.emailHint || ''
      return
    }
    await saveToken(data.token)
  }).catch(err => {
    // A 428 with a preAuthToken means the password was right but MFA is
    // still owed. The challenge token carries the identity forward.
    if (err?.code === 428 && (err?.data?.mfaRequired || err?.data?.preAuthToken)) {
      mfaChallenge.value = true
      mfaMode.value = 'totp'
      mfaCode.value = ''
      mfaRecovery.value = ''
      mfaError.value = ''
      preAuthToken.value = err.data?.preAuthToken || ''
      emailHint.value = err.data?.emailHint || ''
      return
    }
    throw err
  }).finally(() => {
    loginLoading.value = false
  })
}

function switchMfaMode(mode) {
  mfaMode.value = mode
  mfaCode.value = ''
  mfaRecovery.value = ''
  mfaError.value = ''
  nextTick(() => {
    const input = mfaInput.value
    if (input && typeof input.focus === 'function') input.focus()
  })
}

async function submitMfa() {
  // Mode-aware: authenticator OR recovery code, never both.
  const payload = mfaMode.value === 'recovery'
    ? {preAuthToken: preAuthToken.value, recoveryCode: mfaRecovery.value}
    : {preAuthToken: preAuthToken.value, code: mfaCode.value}

  if (mfaMode.value === 'recovery') {
    if (!mfaRecovery.value) {
      mfaError.value = 'Enter one of your recovery codes.'
      return
    }
  } else {
    if (!/^\d{6}$/.test(mfaCode.value)) {
      mfaError.value = 'Enter the six-digit code from your authenticator app.'
      return
    }
  }

  if (!preAuthToken.value) {
    // The challenge expired or was lost. Send the member back to login.
    mfaError.value = 'Your sign-in session expired. Please sign in again.'
    return
  }

  mfaError.value = ''
  loginLoading.value = true
  try {
    const data = await verifyMfa(payload)
    mfaChallenge.value = false
    mfaCode.value = ''
    mfaRecovery.value = ''
    mfaError.value = ''
    preAuthToken.value = ''
    if (data?.onboardingRequired) {
      localStorage.setItem('token', data.token)
      await router.replace({name: 'onboarding'})
      return
    }
    // A recovery code was used: the authenticator may be lost. Offer a
    // re-enrolment flow rather than letting the member keep spending codes.
    if (data?.reenrollRequired) {
      localStorage.setItem('token', data.token)
      sessionStorage.setItem('xpass:reenroll', '1')
      await saveToken(data.token)
      return
    }
    await saveToken(data.token)
  } catch (err) {
    // A 428 with a new preAuthToken means the code was wrong. The server
    // re-issues a challenge so the member can retry without re-entering the
    // password.
    if (err?.code === 428) {
      if (err?.data?.preAuthToken) {
        preAuthToken.value = err.data.preAuthToken
        if (err.data.emailHint) emailHint.value = err.data.emailHint
      }
      mfaError.value = mfaMode.value === 'recovery'
        ? "That recovery code isn't valid or has already been used."
        : "That authenticator code isn't valid. Try the newest code from your app."
    } else if (err?.code === 429) {
      mfaError.value = 'Too many attempts. Wait a moment and try again.'
    } else if (err?.code === 401 && err?.data?.preAuthExpired) {
      // The challenge expired. Send the member back to login.
      mfaError.value = 'Your sign-in session expired. Please sign in again.'
      mfaChallenge.value = false
      preAuthToken.value = ''
    } else {
      throw err
    }
  } finally {
    loginLoading.value = false
  }
}

function cancelMfa() {
  mfaChallenge.value = false
  mfaCode.value = ''
  mfaRecovery.value = ''
  mfaError.value = ''
  mfaMode.value = 'totp'
  preAuthToken.value = ''
  emailHint.value = ''
  form.password = ''
}

async function saveToken(token) {
  localStorage.setItem('token', token)
  refreshWebsiteConfig()
  // Sign-in has to end in one of three states: the shell, the sign-in page with
  // a reason, or a cleared token. It must not leave the button spinning.
  try {
    const user = await loginUserInfo({ timeout: 10000 });
    if (!user) throw new Error('No identity was returned for that token.')
    accountStore.currentAccountId = user.account ? user.account.accountId : null;
    accountStore.currentAccount = user.account || null;
    userStore.user = user;
    const routers = permsToRouter(user.permKeys || []);
    routers.forEach(routerData => {
      router.addRoute('layout', routerData);
    });
    await router.replace({ name: 'layout' })
  } catch (e) {
    // Fail closed: an unusable token must not survive a failed sign-in.
    localStorage.removeItem('token');
    userStore.user = {};
    ElMessage({
      message: e?.message || 'Could not complete sign-in.',
      type: 'error',
      plain: true,
    })
  } finally {
    oauthLoading.value = false;
    bindLoading.value = false;
  }
}

function refreshWebsiteConfig() {
  websiteConfig().then(setting => {
    settingStore.settings = setting
    settingStore.domainList = (setting.domainList || []).map(domainName).filter(Boolean)
    if (settingStore.domainList.length > 0) {
      // Adopt the server's first domain once it is known.
      suffix.value = settingStore.domainList[0]
    }
    document.title = 'Sign in | XPass HQ'
  }).catch(e => {
    // The worker may still be starting. Keep the fallback domain so the form
    // stays usable; the next attempt will pick up the real list.
    console.error(e)
  })
}


</script>

<style>
.el-select-dropdown__item {
  padding: 0 15px;
}
</style>

<style scoped>
#login-box {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  color: #f3ece5;
  font-family: 'Manrope', Inter, 'Segoe UI', sans-serif;
  background:
    radial-gradient(1100px 760px at 30% 28%, rgba(255, 85, 0, .20), transparent 58%),
    radial-gradient(900px 680px at 88% 108%, rgba(120, 63, 28, .16), transparent 55%),
    linear-gradient(180deg, #0a0806 0%, #060504 60%, #050403 100%);
}

/* faint grain so the near-black surface reads as textured, not flat */
#login-box::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: .05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* warm curved line entering from the top-right edge */
#login-box::after {
  content: '';
  position: absolute;
  top: -180px;
  right: -160px;
  width: 640px;
  height: 640px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 122, 61, .28);
  border-left-color: transparent;
  border-bottom-color: transparent;
  pointer-events: none;
  transform: rotate(12deg);
}

.login-arc {
  position: absolute;
  left: -220px;
  bottom: -320px;
  width: 820px;
  height: 820px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 122, 61, .20);
  border-top-color: transparent;
  border-right-color: transparent;
  pointer-events: none;
}

.login-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(380px, 460px);
  align-items: center;
  gap: clamp(48px, 8vw, 120px);
  width: min(1180px, 100%);
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  padding: clamp(28px, 4vw, 64px);
  box-sizing: border-box;
}

.login-brand {
  position: relative;
  display: flex;
  min-width: 0;
  height: min(560px, 78vh);
  flex-direction: column;
  justify-content: center;
}

.login-brand-logo {
  position: absolute;
  top: clamp(28px, 4vw, 56px);
  left: clamp(28px, 4vw, 64px);
  width: 188px !important;
  height: 47px !important;
  border-radius: 0;
  object-fit: contain;
  object-position: left top;
}

.login-brand-copy {
  max-width: 480px;
}

.login-brand-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
  color: #c8bab0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
}

.login-brand-kicker span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff5500;
  box-shadow: 0 0 0 4px rgba(255, 85, 0, .18);
}

.login-brand-copy h1 {
  margin: 0;
  color: #f3ece5;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: clamp(40px, 5.4vw, 66px);
  font-weight: 700;
  line-height: 1.06;
  letter-spacing: -.05em;
}

.login-brand-copy h1 em {
  color: #ff7a3d;
  font-style: normal;
}

.login-brand-copy p {
  max-width: 400px;
  margin: 24px 0 0;
  color: #b3a79d;
  font-size: 15px;
  line-height: 1.75;
}

.login-panel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
  width: 100%;
  min-width: 0;
}

.login-card {
  width: 100%;
  max-height: calc(100svh - 56px);
  overflow: auto;
  padding: clamp(32px, 3.4vw, 48px);
  border: 1px solid rgba(214, 140, 96, .22);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(28, 23, 19, .86), rgba(18, 15, 12, .92));
  box-shadow: 0 32px 90px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 173, 128, .06);
  backdrop-filter: blur(2px);
}

.login-card h2 {
  margin: 0;
  color: #f3ece5;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -.025em;
}

.login-card-description {
  margin: 8px 0 0;
  color: #b3a79d;
  font-size: 13.5px;
}

.auth-form {
  display: grid;
  gap: 18px;
  margin-top: 28px;
}

.auth-field {
  display: grid;
  gap: 8px;
}

.auth-field > label {
  color: #e7ddd5;
  font-size: 12.5px;
  font-weight: 600;
}

.auth-field :deep(.el-input__wrapper) {
  min-height: 48px;
  border-radius: 10px;
  background: #14100d;
  box-shadow: 0 0 0 1px rgba(194, 125, 79, .26) inset;
  transition: box-shadow .15s ease;
}

.auth-field :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #ff5500 inset, 0 0 0 3px rgba(255, 85, 0, .15);
}

.auth-field :deep(.el-input__inner) {
  color: #f3ece5;
  font-size: 14px;
}

.auth-field :deep(.el-input__inner::placeholder) {
  color: #8a7d73;
}

/* Unified company-account field: one rounded rectangle, one border, one focus
   ring. The username input and the domain segment live inside the same box so
   the field reads as your.name@example.com rather than an input next to a
   separate selector. */
.company-account-field {
  display: flex;
  align-items: center;
  min-height: 48px;
  border-radius: 10px;
  background: #14100d;
  box-shadow: 0 0 0 1px rgba(194, 125, 79, .26) inset;
  transition: box-shadow .15s ease;
  overflow: hidden;
}

.company-account-field:focus-within {
  box-shadow: 0 0 0 1px #ff5500 inset, 0 0 0 3px rgba(255, 85, 0, .15);
}

.company-account-prefix {
  flex: 0 0 auto;
  padding-left: 14px;
  color: #8a7d73;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  user-select: none;
}

.company-account-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 46px;
  padding: 0 6px 0 2px;
  border: 0;
  outline: none;
  background: transparent;
  color: #f3ece5;
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
}

.company-account-field.is-full-account .company-account-input {
  padding-left: 14px;
}

.company-account-input::placeholder {
  color: #8a7d73;
}

.company-account-domain {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  padding: 0 14px;
  border-left: 1px solid rgba(194, 125, 79, .22);
  background: #1c1611;
  color: #c8bab0;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.company-account-domain.is-fixed {
  color: #e7ddd5;
}

.company-account-domain.is-picker {
  position: relative;
  min-width: 120px;
  justify-content: flex-end;
  cursor: pointer;
}

.company-account-domain-text {
  pointer-events: none;
}

.company-account-select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.company-account-select :deep(.el-select__wrapper) {
  min-height: 100%;
  height: 100%;
  padding: 0;
  box-shadow: none !important;
  background: transparent;
}

.company-account-select :deep(.el-select__selected-item) {
  display: none;
}

.auth-submit {
  width: 100%;
  min-height: 50px;
  margin: 4px 0 0 !important;
  border: 1px solid #ff5500;
  border-radius: 10px;
  background: #ff5500;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  transition: background-color .15s ease, border-color .15s ease;
}

.auth-submit:hover,
.auth-submit:focus {
  border-color: #ff7a3d;
  background: #ff7a3d;
  color: #ffffff;
}

.auth-submit.is-disabled,
.auth-submit.is-disabled:hover {
  border-color: #7a4326;
  background: #7a4326;
  color: #e7d9cf;
}

.oauth-list {
  display: grid;
  gap: 9px;
}

.oauth-button {
  width: 100%;
  min-height: 46px;
  margin: 0 !important;
  border: 1px solid rgba(194, 125, 79, .24);
  border-radius: 10px;
  background: #1a1510;
  color: #f3ece5;
}

.oauth-button:hover {
  border-color: rgba(194, 125, 79, .44);
  background: #221b14;
  color: #fff;
}

.oauth-button :deep(.el-avatar) {
  margin-right: 2px;
}

.auth-switch {
  margin-top: 6px;
  color: #b3a79d;
  font-size: 12px;
  text-align: center;
}

.auth-switch button {
  margin-left: 4px;
  padding: 0;
  background: none;
  color: #ff7a3d;
  cursor: pointer;
  font-weight: 600;
}

.auth-switch button:hover { color: #ff9b6b; }

.auth-switch .auth-link {
  color: #ff7a3d;
  font-size: 12.5px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.mfa-identity-hint {
  margin-bottom: 4px;
  font-size: 12.5px;
  color: #b3a79d;
}

.mfa-identity-hint strong {
  color: #f3ece5;
  font-weight: 600;
}

.mfa-code-input :deep(input),
.mfa-recovery-input :deep(input) {
  font-size: 20px;
  letter-spacing: .35em;
  text-align: center;
  font-weight: 600;
}

.mfa-recovery-input :deep(input) {
  letter-spacing: .12em;
  font-weight: 500;
}

.mfa-help {
  margin: 8px 0 0;
  font-size: 12px;
  color: #b3a79d;
  line-height: 1.5;
}

.inline-error {
  margin-top: 10px;
  padding: 10px 13px;
  border: 1px solid rgba(255, 92, 92, .42);
  border-radius: 9px;
  background: rgba(255, 92, 92, .12);
  color: #ff9b9b;
  font-size: 13px;
  line-height: 1.5;
}

.login-brand-footer {
  color: #8a7d73;
  font-size: 12px;
  text-align: center;
}

.bind-dialog :deep(.el-dialog) {
  border: 1px solid rgba(194, 125, 79, .24);
  border-radius: 16px;
  background: #17120e;
}

.bind-dialog :deep(.el-dialog__title),
.bind-dialog :deep(.el-dialog__body) {
  color: #f3ece5;
}

.bind-container {
  display: grid;
  gap: 14px;
}

@media (max-width: 1080px) {
  .login-layout {
    display: grid;
    grid-template-columns: minmax(0, 460px);
    justify-content: center;
    align-content: center;
    gap: 20px;
    padding: 92px 28px 40px;
  }

  .login-brand {
    display: none;
  }

  .login-brand-logo {
    position: absolute;
    top: 30px;
    left: 50%;
    width: 172px !important;
    height: 43px !important;
    transform: translateX(-50%);
  }
}

@media (max-width: 760px) {
  .login-arc,
  #login-box::after {
    opacity: .35;
  }

  .login-layout {
    display: grid;
    min-height: 100dvh;
    grid-template-columns: minmax(0, 1fr);
    justify-content: center;
    align-content: center;
    gap: 16px;
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
    padding: 86px 16px 28px;
  }

  .login-brand-logo {
    top: 24px;
    width: 156px !important;
    height: 39px !important;
  }

  .login-panel {
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
  }

  .login-card {
    max-height: none;
    padding: 26px 20px;
    border-radius: 18px;
  }

  .login-brand-footer {
    padding: 0 4px;
    line-height: 1.45;
  }

  .company-account-domain {
    padding: 0 10px;
    font-size: 12.5px;
  }
}

@media (max-width: 380px) {
  .login-layout { padding-inline: 12px; }
  .login-card { padding: 24px 16px; }
  .company-account-prefix { padding-left: 11px; }
  .company-account-domain { padding: 0 8px; font-size: 12px; }
}

@media (max-height: 640px) and (min-width: 761px) {
  .login-layout { padding-top: 74px; padding-bottom: 24px; }
  .login-card { padding: 28px 32px; }
  .auth-form { gap: 14px; margin-top: 20px; }
}
</style>
