<template>
  <el-container class="layout">
    <el-aside
        id="workspace-sidebar"
        class="aside"
        :class="[
          uiStore.asideShow ? 'aside-show' : 'el-aside-hide',
          {'aside-collapsed': uiStore.asideCollapsed && !isMobile}
        ]">
      <Aside />
    </el-aside>
    <div
        :class="(uiStore.asideShow && isMobile)? 'overlay-show':'overlay-hide'"
        @click="uiStore.asideShow = false"
    ></div>
    <el-container class="main-container">
      <el-main>
        <el-header>
            <Header />
        </el-header>
        <Main />
      </el-main>
    </el-container>
  </el-container>
  <writer ref="writerRef" />
  <AiPanel />
  <MobileBottomNav />
</template>
<script setup>
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import AiPanel from '@/components/ai-panel/index.vue'
import MobileBottomNav from '@/components/mobile-bottom-nav/index.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {useUiStore} from "@/store/ui.js";
import writer from '@/layout/write/index.vue'

const uiStore = useUiStore();
const writerRef = ref({})
const isMobile = ref(window.innerWidth < 700)
function handleComposeShortcut(event) {
  const target = event.target
  const isTyping = target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select, [contenteditable="true"]'))
  if (event.key.toLowerCase() !== 'c' || event.altKey || event.ctrlKey || event.metaKey || isTyping) return
  event.preventDefault()
  uiStore.openCompose()
}
const handleResize = () => {
  const nextIsMobile = window.innerWidth < 700
  if (nextIsMobile === isMobile.value) return
  isMobile.value = nextIsMobile
  uiStore.asideShow = !nextIsMobile
}

onMounted(() => {
  uiStore.writerRef = writerRef

  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleComposeShortcut)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleComposeShortcut)
})
</script>
<style lang="scss" scoped>
.el-aside.aside-collapsed {
  width: 64px !important;
  flex: 0 0 64px !important;
}

.aside-collapsed :deep(.sidebar-header) {
  justify-content: center;
  padding: 0 8px;
}

.aside-collapsed :deep(.workspace-navigation) {
  padding: 8px 8px 12px;
}

.aside-collapsed :deep(.navigation-label),
.aside-collapsed :deep(.navigation-item > span),
.aside-collapsed :deep(.future-modules),
.aside-collapsed :deep(.admin-navigation),
.aside-collapsed :deep(.sidebar-content-scroll),
.aside-collapsed :deep(.account-switcher-copy),
.aside-collapsed :deep(.account-switcher-arrow),
.aside-collapsed :deep(.compose-cta span),
.aside-collapsed :deep(.compose-cta kbd) {
  display: none;
}

.aside-collapsed :deep(.navigation-item) {
  justify-content: center;
  padding: 0;
}

.aside-collapsed :deep(.nav-group-main) {
  justify-content: center;
  padding: 0;
}

.aside-collapsed :deep(.nav-group-main span) {
  display: none;
}

.aside-collapsed :deep(.mail-controls) {
  padding: 10px 8px;
}

.aside-collapsed :deep(.account-switcher),
.aside-collapsed :deep(.compose-cta) {
  width: 38px;
  min-height: 38px;
  justify-content: center;
  margin: 0 auto;
  padding: 0;
}

.aside-collapsed :deep(.account-avatar) {
  width: 28px;
  height: 28px;
}

.el-aside-hide {
  position: fixed;
  left: 0;
  height: 100%;
  z-index: 100;
  transform: translateX(-100%);
  transition: transform 220ms ease;
}

.aside-show {
  -webkit-box-shadow: var(--aside-right-border);
  box-shadow: var(--aside-right-border);
  transform: translateX(0);
  transition: transform 220ms ease;
  z-index: 101;
  @media (max-width: 700px) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 101;
    height: 100%;
    background: var(--el-bg-color);
  }
}

.el-aside {
  width: 256px !important;
  flex: 0 0 256px;
  transition: width 100ms ease, transform 220ms ease;
}

.layout {
  --el-bg-color: var(--hq-surface);
  --el-bg-color-page: var(--hq-page);
  --el-bg-color-overlay: var(--hq-surface);
  --el-fill-color-light: var(--hq-hover);
  --el-fill-color-blank: var(--hq-surface);
  --el-text-color-primary: var(--hq-text);
  --el-text-color-regular: var(--hq-text-secondary);
  --el-text-color-secondary: var(--hq-muted);
  --el-border-color: var(--hq-border);
  --el-border-color-light: var(--hq-border);
  --el-border-color-lighter: var(--hq-border);
  --extra-light-fill: var(--hq-hover);
  --settings-page-background: var(--hq-page);
  --light-ill: var(--hq-hover);
  --light-border: var(--hq-border);
  --aside-backgound: var(--hq-sidebar);
  --aside-menu-active-background: var(--hq-selected);
  --header-actions-border: inset 0 -1px 0 0 var(--hq-border);
  --dark-border: var(--hq-border);
  --base-fill: var(--hq-hover);
  --regular-text-color: var(--hq-text-secondary);
  --light-border-color: var(--hq-border);
  --aside-right-border: 1px 0 0 var(--hq-border);
  --choose-account-background: var(--hq-selected);
  --email-scroll-content-color: var(--hq-muted);
  --email-hover-background: var(--hq-hover);
  --email-right-click-background: var(--hq-selected);
  --scrollbar-track-color: var(--hq-border);
  --base-border-color: var(--hq-border);
  --secondary-text-color: var(--hq-muted);
  --message-block-color: rgba(0, 0, 0, 0);
  height: 100vh;
  height: 100svh;
  min-height: 0;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  overflow: hidden;
}

.main-container {
  min-height: 0;
  height: 100%;
  background: var(--el-bg-color);
  overflow: hidden;
  -webkit-overflow-scrolling: touch;
}

.el-main {
  min-height: 0;
  height: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.el-header {
  flex: 0 0 60px;
  background: var(--el-bg-color);
  border-bottom: solid 1px var(--el-border-color);
  padding: 0;
  @media (max-width: 767px) {
    height: 50px;
    flex-basis: 50px;
  }
}

@media (max-width: 700px) {
  .el-aside {
    width: min(330px, calc(100vw - 42px)) !important;
    flex-basis: min(330px, calc(100vw - 42px));
  }

  /* Reserve space for the fixed mobile bottom nav so content is not hidden. */
  .main-container {
    padding-bottom: 56px;
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  }
}

@media (min-width: 701px) and (max-width: 900px) {
  .el-aside {
    width: 248px !important;
    flex-basis: 248px;
  }
}

.overlay-show {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  transition: all 0.3s;
}

.overlay-hide {
  display: flex;
  pointer-events: none;
  opacity: 0;
}
</style>
