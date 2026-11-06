<template>
  <div class="aside-inner" :class="{ 'is-collapsed': collapsed }">
    <el-scrollbar class="scroll">
      <div class="aside-body">
        <div class="brand">
          <img class="logo" :src="logoUrl" alt=""/>
          <span class="brand-name" :class="{ 'title-display': titleUsesDisplayFont }">
            {{ settingStore.settings.title }}
          </span>
        </div>

        <el-tooltip v-if="canSend" :disabled="!collapsed" :content="$t('compose')" placement="right">
          <button type="button" class="compose-btn" @click="openWrite">
            <Icon icon="material-symbols:edit-outline-sharp" width="20" height="20"/>
            <span class="compose-text">{{ $t('compose') }}</span>
          </button>
        </el-tooltip>

        <nav class="nav">
          <el-tooltip v-for="item in navItems" :key="item.name"
                      :disabled="!collapsed" :content="$t(item.label)" placement="right">
            <button type="button" class="nav-item"
                    :class="{ active: route.meta.name === item.name }"
                    @click="router.push({name: item.name})">
              <Icon class="nav-icon" :icon="item.icon" width="20" height="20"/>
              <span class="nav-label">{{ $t(item.label) }}</span>
            </button>
          </el-tooltip>
        </nav>
      </div>
    </el-scrollbar>

    <div class="aside-footer">
      <el-tooltip :disabled="!collapsed" :content="currentEmail" placement="right">
        <button type="button" class="account-trigger" @click="uiStore.toggleAccountPanel()">
          <span class="account-avatar">{{ accountInitial }}</span>
          <span class="account-meta">
            <span class="account-mail">{{ currentEmail }}</span>
            <span class="account-label">{{ $t('account') }}</span>
          </span>
          <Icon class="account-caret" icon="fluent:chevron-up-16-regular" width="16" height="16"/>
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
import router from "@/router/index.js";
import { useRoute } from "vue-router";
import {Icon} from "@iconify/vue";
import {computed} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {useWriterStore} from "@/store/writer.js";

defineProps({
  collapsed: {
    type: Boolean,
    default: false
  }
})

const settingStore = useSettingStore();
const uiStore = useUiStore();
const accountStore = useAccountStore();
const userStore = useUserStore();
const writerStore = useWriterStore();
const route = useRoute();

const logoUrl = `${import.meta.env.BASE_URL}mail.png`
// 中文标题用系统字体，纯西文标题用上游带的展示字体
const titleUsesDisplayFont = computed(() => !/\p{Script=Han}/u.test(settingStore.settings.title || ''))

const NAV_ITEMS = [
  {name: 'email', icon: 'hugeicons:mailbox-01', label: 'inbox'},
  {name: 'send', icon: 'cil:send', label: 'sent', perm: 'email:send'},
  {name: 'draft', icon: 'ep:document', label: 'drafts', perm: 'email:send'},
  {name: 'star', icon: 'solar:star-line-duotone', label: 'starred'},
  {name: 'setting', icon: 'fluent:settings-48-regular', label: 'settings'}
]

const permKeys = computed(() => userStore.user?.permKeys || [])

const has = (perm) => permKeys.value.includes('*') || permKeys.value.includes(perm)

const navItems = computed(() => NAV_ITEMS.filter(item => !item.perm || has(item.perm)))

const canSend = computed(() => has('email:send'))

const currentEmail = computed(() => {
  return accountStore.currentAccount?.email || userStore.user?.email || ''
})

const accountInitial = computed(() => {
  return (currentEmail.value[0] || '?').toUpperCase()
})

function openWrite() {
  writerStore.startNew()
}

</script>

<style lang="scss" scoped>
@font-face {
  font-family: "BAHAMASB";
  src: url("/fonts/BAHAMASB.woff") format("woff");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

.aside-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--mail-canvas);
  overflow: hidden;

  .scroll {
    flex: 1;
    min-height: 0;
  }
}

.aside-body {
  padding: 12px 8px 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 16px;
  color: var(--el-text-color-primary);

  .logo {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    object-fit: contain;
  }

  .brand-name {
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.01em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.title-display {
  font-family: "BAHAMASB", Inter, "Helvetica Neue", Helvetica, sans-serif;
  font-size: 20px;
  font-weight: normal;
}

.compose-btn {
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  margin-bottom: 14px;
  border-radius: 999px;
  background: var(--el-color-primary);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08), 0 1px 3px rgba(16, 24, 40, 0.06);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.compose-btn:hover {
  background: var(--el-color-primary-dark-2);
  box-shadow: 0 2px 6px rgba(16, 24, 40, 0.16);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-top: 6px;
  border-top: 1px solid var(--mail-hairline);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  color: var(--el-text-color-regular);
  font-size: 13.5px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;

  .nav-icon {
    flex-shrink: 0;
    color: var(--mail-icon);
    transition: color 0.12s ease;
  }

  .nav-label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.nav-item:hover {
  background: var(--mail-nav-hover);
}

.nav-item.active {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-weight: 500;

  .nav-icon {
    color: var(--el-color-primary);
  }
}

/* 收起为图标栏 */
.is-collapsed {
  .aside-body {
    padding: 12px 6px 16px;
  }

  .brand {
    justify-content: center;
    padding: 4px 0 16px;

    .brand-name {
      display: none;
    }
  }

  .compose-btn {
    justify-content: center;
    padding: 0;

    .compose-text {
      display: none;
    }
  }

  .nav-item {
    justify-content: center;
    gap: 0;
    padding: 0;

    .nav-label {
      display: none;
    }
  }

  .account-trigger {
    justify-content: center;
    padding: 6px 0;
  }

  .account-meta,
  .account-caret {
    display: none;
  }
}

/* 左下角：多邮箱入口 */
.aside-footer {
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--mail-hairline);
}

.account-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.account-trigger:hover {
  background: var(--mail-nav-hover);
}

.account-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
  user-select: none;
}

.account-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.account-mail {
  font-size: 12.5px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.account-label {
  font-size: 11px;
  color: var(--secondary-text-color);
}

.account-caret {
  flex-shrink: 0;
  color: var(--secondary-text-color);
}
</style>
