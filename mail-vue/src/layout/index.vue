<template>
  <el-container class="layout">
    <el-aside class="aside" :class="asideClass">
      <Aside :collapsed="asideCollapsed" />
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

        <!-- 写信：铺满内容区，不用另开路由 -->
        <div v-if="writerStore.open" class="compose-layer">
          <writer />
        </div>
      </el-main>
    </el-container>

    <!-- 左下角展开的多邮箱面板 -->
    <div v-if="uiStore.accountPanel" class="account-layer" @click.self="uiStore.closeAccountPanel()">
      <div class="account-panel">
        <account panel />
      </div>
    </div>
  </el-container>
</template>

<script setup>
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import account from '@/layout/account/index.vue'
import writer from '@/layout/write/index.vue'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import {useUiStore} from "@/store/ui.js";
import {useWriterStore} from "@/store/writer.js";

const uiStore = useUiStore();
const writerStore = useWriterStore();
const isMobile = ref(window.innerWidth < 1025)
const handleResize = () => {
  isMobile.value = window.innerWidth < 1025
  uiStore.asideShow = window.innerWidth > 1024;
  if (!isMobile.value) {
    uiStore.closeAccountPanel()
  }
}

// 窄屏走抽屉，宽屏走「收起成图标栏」
const asideCollapsed = computed(() => !isMobile.value && uiStore.asideCollapse)

const asideClass = computed(() => {
  if (isMobile.value) {
    return uiStore.asideShow ? 'aside-show' : 'el-aside-hide'
  }
  return asideCollapsed.value ? 'aside-show aside-rail' : 'aside-show'
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.el-aside-hide {
  position: fixed;
  left: 0;
  height: 100%;
  z-index: 100;
  transform: translateX(-100%);
  transition: all 100ms ease;
}

.aside-show {
  -webkit-box-shadow: none;
  box-shadow: none;
  border-right: 1px solid var(--mail-hairline);
  transform: translateX(0);
  transition: all 100ms ease;
  z-index: 101;
  @media (max-width: 1025px) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 101;
    height: 100%;
    background: var(--el-bg-color);
  }
}

.el-aside {
  width: auto;
  transition: all 100ms ease;
}

.layout {
  --mail-header-height: 56px;
  @media (max-width: 767px) {
    --mail-header-height: 50px;
  }

  height: 100%;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  overflow: hidden;
}

.main-container {
  min-height: 100%;
  background: var(--el-bg-color);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.el-main {
  padding: 0;
  position: relative;
}

/* 写信面板：铺满主内容区（含顶栏），侧边栏保留 */
.compose-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  background: var(--el-bg-color);
  overflow: hidden;
}

.el-header {
  background: var(--el-bg-color);
  border-bottom: solid 1px var(--mail-hairline);
  height: var(--mail-header-height);
  padding: 0 16px 0 10px;
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

/* 收起为图标栏 */
.aside-rail {
  width: 64px;
}

/* 左下角的多邮箱浮层 */
.account-layer {
  position: fixed;
  inset: 0;
  z-index: 300;
}

.account-panel {
  position: absolute;
  left: 12px;
  bottom: 74px;
  width: 320px;
  padding: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--mail-hairline);
  border-radius: 12px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.06);
  overflow: hidden;
  animation: account-panel-in 140ms ease-out;
}

@keyframes account-panel-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
