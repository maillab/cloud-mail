<template>
  <el-container class="layout">
    <el-aside
        class="aside"
        :class="uiStore.asideShow ? 'aside-show' : 'el-aside-hide'">
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
</template>
<script setup>
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {useUiStore} from "@/store/ui.js";
import {hasPerm} from "@/perm/perm.js";
import writer from '@/layout/write/index.vue'

const uiStore = useUiStore();
const writerRef = ref({})
const isMobile = ref(window.innerWidth < 700)
function handleComposeShortcut(event) {
  const target = event.target
  const isTyping = target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select, [contenteditable="true"]'))
  if (event.key.toLowerCase() !== 'c' || event.altKey || event.ctrlKey || event.metaKey || isTyping) return
  if (!hasPerm('email:send')) return
  event.preventDefault()
  uiStore.writerRef?.open()
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
  width: 294px !important;
  flex: 0 0 294px;
  transition: width 100ms ease, transform 220ms ease;
}

.layout {
  --el-bg-color: #fff;
  --el-bg-color-page: #f6f3f2;
  --el-bg-color-overlay: #fff;
  --el-fill-color-light: #f5f2f0;
  --el-fill-color-blank: #fff;
  --el-text-color-primary: #252321;
  --el-text-color-regular: #504b47;
  --el-text-color-secondary: #817a75;
  --el-border-color: #e7e2de;
  --el-border-color-light: #ece8e5;
  --el-border-color-lighter: #f1eeeb;
  --extra-light-fill: #fff;
  --settings-page-background: #f6f3f2;
  --light-ill: #f7f4f2;
  --light-border: #e7e2de;
  --aside-backgound: #fff;
  --aside-menu-active-background: #fff2eb;
  --header-actions-border: inset 0 -1px 0 0 #ece8e5;
  --dark-border: #e1dcd8;
  --base-fill: #f4f1ef;
  --regular-text-color: #716a66;
  --light-border-color: #e7e2de;
  --aside-right-border: 1px 0 0 rgba(40, 30, 20, .08);
  --choose-account-background: #fff2eb;
  --email-scroll-content-color: #817a75;
  --email-hover-background: #faf7f5;
  --email-right-click-background: #fff4ed;
  --scrollbar-track-color: #c8c1bc;
  --base-border-color: #e7e2de;
  --secondary-text-color: #8c8580;
  --message-block-color: rgba(255, 255, 255, 0);
  color-scheme: light;
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
