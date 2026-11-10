<template>
  <el-config-provider>
    <router-view />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { onMounted, onUnmounted, watch } from "vue";
import {useUiStore} from "@/store/ui.js";
const uiStore = useUiStore()
import('@/icons/index.js')
const { locale } = useI18n()
locale.value = 'en'

uiStore.applyTheme();

watch(() => [uiStore.theme, uiStore.isDark], () => {
  uiStore.applyTheme();
}, {immediate: true})

let mediaQuery = null;
const handleSystemThemeChange = () => {
  if (uiStore.theme === 'system') {
    uiStore.applyTheme();
  }
};

onMounted(() => {
  if (window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemThemeChange);
    }
  }
});

onUnmounted(() => {
  if (mediaQuery) {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else if (mediaQuery.removeListener) {
      mediaQuery.removeListener(handleSystemThemeChange);
    }
  }
});
</script>

<style>
:root {
  --el-color-primary: #ff5500;
  --el-color-primary-dark-2: #d94700;
  --el-color-primary-light-3: #ff7b3d;
  --el-color-primary-light-5: #ff9b6b;
  --el-color-primary-light-7: #ffbd9e;
  --el-color-primary-light-9: #fff1e8;
  --xpass-shell: #f8f7f5;
  --xpass-surface: #ffffff;
  --xpass-raised: #ffffff;
  --xpass-border: #e7e2dc;
  --xpass-accent: #ff5500;
}

.dark {
  --xpass-shell: #050403;
  --xpass-surface: #100e0c;
  --xpass-raised: #18110d;
  --xpass-border: rgba(194, 125, 79, .2);
  --xpass-accent: #ff5500;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

::selection {
  background: rgba(255, 85, 0, .28);
  color: var(--el-text-color-primary);
}
</style>
