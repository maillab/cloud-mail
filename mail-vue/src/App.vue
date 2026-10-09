<template>
  <el-config-provider :locale="epLocale">
    <router-view />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { watch, computed } from "vue";
import {useSettingStore} from "@/store/setting.js";
const settingStore = useSettingStore()
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import zhTw from 'element-plus/es/locale/lang/zh-tw';
import en from 'element-plus/es/locale/lang/en';
import ja from 'element-plus/es/locale/lang/ja';
import ko from 'element-plus/es/locale/lang/ko';
import('@/icons/index.js')
const { locale } = useI18n()
locale.value = settingStore.lang
watch(() => settingStore.lang, () => locale.value = settingStore.lang)

const epLocale = computed(() => {
  switch (settingStore.lang) {
    case 'zh': return zhCn
    case 'zh-TW': return zhTw
    case 'en': return en
    case 'ja': return ja
    case 'ko': return ko
    default: return null
  }
})
</script>
