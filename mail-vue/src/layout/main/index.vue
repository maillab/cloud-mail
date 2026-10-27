<template>
  <div :class="accountShow && hasPerm('account:query') ? 'main-box-show' : 'main-box-hide'">
    <div :class="accountShow && hasPerm('account:query') ? 'block-show' : 'block-hide'" @click="uiStore.accountShow = false"></div>
    <account  :class="accountShow && hasPerm('account:query') ? 'show' : 'hide'" />
    <router-view class="main-view" v-slot="{ Component,route }">
      <keep-alive :include="['email','all-email','send','sys-setting','star','user','role','analysis','reg-key','draft']">
        <component :is="Component" :key="route.name"/>
      </keep-alive>
    </router-view>
  </div>
</template>
<script setup>
import account from '@/layout/account/index.vue'
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {computed, onBeforeUnmount, onMounted, watch} from "vue";
import { useRoute } from 'vue-router'
import { hasPerm } from "@/perm/perm.js"

const settingStore = useSettingStore()
const uiStore = useUiStore();
const route = useRoute()
let  innerWidth =  window.innerWidth

let elNotification = null

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

watch(() => uiStore.changeNotice, () => {

  const settings = settingStore.settings

  let data = {
    notice: settings.notice,
    noticeWidth: settings.noticeWidth,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    noticeType: settings.noticeType,
    noticeDuration: settings.noticeDuration,
    noticePosition: settings.noticePosition,
    noticeOffset: settings.noticeOffset
  }

  showNotice(data)
})

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
})

function showNotice(data) {

  if (data.notice === 1) {
    return;
  }

  if (elNotification) {
    elNotification.close()
  }

  const style = document.createElement('style');
  style.innerHTML = `
  .custom-notice.el-notification {
    --el-notification-width: min(${data.noticeWidth}px,calc(100% - 30px)) !important;
  }
  `;

  document.head.appendChild(style);

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width: 100%;height: 100%;">${data.noticeContent}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration,
    position: data.noticePosition,
    offset: data.noticeOffset,
    dangerouslyUseHTMLString: true,
    customClass: 'custom-notice'
  })
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})

const handleResize = () => {
  if (['content','email','send'].includes(route.meta.name)) {
    if (innerWidth !==  window.innerWidth) {
      innerWidth = window.innerWidth;
      uiStore.accountShow = false;
    }
  }
}

</script>
<style lang="scss" scoped>

.block-show {
  position: fixed;
  inset: 60px 0 0 260px;
  z-index: 89;
  background: rgba(0, 0, 0, .28);
  @media (max-width: 767px) {
    inset: 50px 0 0;
  }
  @media (max-width: 767px) {
    border: 0;
  }
}

.block-hide {
  position: fixed;
  pointer-events: none;
  transition: all 300ms;
}

.show {
  position: fixed;
  top: 60px;
  bottom: 0;
  left: 260px;
  z-index: 90;
  width: 280px;
  transition: transform 160ms ease, opacity 160ms ease;
  box-shadow: 12px 0 24px rgba(0, 0, 0, .2);
  @media (max-width: 767px) {
    top: 50px;
    left: 0;
    width: min(320px, calc(100vw - 42px));
  }
}

.hide {
  transition: transform 160ms ease, opacity 160ms ease;
  position: fixed;
  top: 60px;
  bottom: 0;
  left: 260px;
  z-index: 90;
  width: 280px;
  transform: translateX(calc(-100% - 260px));
  opacity: 0;
  @media (max-width: 1024px) {
    left: 0;
    top: 50px;
    width: min(320px, calc(100vw - 42px));
    transform: translateX(-110%);
  }
}


.main-box-show {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
  height: calc(100% - 60px);
}

.main-box-hide {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
  height: calc(100% - 60px);
}


.main-view {
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
}


.navigation {
  height: 30px;
  border-bottom: solid 1px var(--el-menu-border-color);
  display: inline-flex;
  justify-items: center;
  align-items: center;
  width: 100%;
  .tag {
    background: var(--el-bg-color);
    margin-left: 5px;
  }
}
</style>
