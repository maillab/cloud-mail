<template>
  <el-config-provider>
    <router-view />
    <TutorialCoachmark />
    <WorkspaceGuidePrompt />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useUiStore } from "@/store/ui.js";
import { usePresence } from "@/composables/use-presence.js";
import { useTutorialStore } from "@/store/tutorial.js";
import { useUserStore } from "@/store/user.js";
import TutorialCoachmark from "@/components/tutorial-coachmark/index.vue";
import WorkspaceGuidePrompt from "@/components/workspace-guide-prompt/index.vue";
const uiStore = useUiStore()
const tutorialStore = useTutorialStore()
const userStore = useUserStore()
const route = useRoute()
import('@/icons/index.js')
const { locale } = useI18n()
locale.value = 'en'

uiStore.applyTheme();
usePresence();

watch(() => [uiStore.theme, uiStore.isDark], () => {
  uiStore.applyTheme();
}, {immediate: true})

let mediaQuery = null;
const handleSystemThemeChange = () => {
  if (uiStore.theme === 'system') {
    uiStore.applyTheme();
  }
};

// The XPass HQ Guide must never appear on the login page, before onboarding is
// complete, or over a tour that is already running. It is evaluated only once
// the member is authenticated and has reached their real Overview dashboard.
function isAuthenticated() {
  const token = localStorage.getItem('token')
  const perms = userStore.user?.permKeys
  return !!token && Array.isArray(perms) && perms.length > 0
}

let evaluated = false
function maybeEvaluate() {
  if (evaluated) return
  if (route.name !== 'overview') return
  if (!isAuthenticated()) return
  if (tutorialStore.activeTour || tutorialStore.intro) return
  evaluated = true
  tutorialStore.evaluate({ onOverview: true })
}

onMounted(async () => {
  if (window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemThemeChange);
    }
  }
  // Load saved guide state up front; the prompt itself waits until the member
  // reaches Overview (see maybeEvaluate). No tour auto-starts on login.
  await tutorialStore.load();
  maybeEvaluate();
});

watch(() => route.name, () => maybeEvaluate());
// Session restore: the user identity loads asynchronously after a refresh, so
// re-check once permissions arrive while sitting on the Overview.
watch(() => userStore.user?.permKeys?.length, () => maybeEvaluate());

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

html.dark {
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