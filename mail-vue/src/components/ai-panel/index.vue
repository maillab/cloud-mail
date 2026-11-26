<template>
  <el-drawer
    v-model="visible"
    :title="content.name"
    direction="rtl"
    size="440px"
    append-to-body
    class="ai-panel"
  >
    <div class="cs-wrap">
      <div class="cs-icon">
        <Icon :icon="content.icon" width="28" height="28" />
      </div>
      <div class="cs-topline">
        <span class="cs-name">{{ content.name }}</span>
        <span class="cs-badge">Coming soon</span>
      </div>
      <p class="cs-tagline">{{ content.tagline }}</p>
      <p class="cs-body">{{ content.body }}</p>
      <ul class="cs-list">
        <li v-for="bullet in content.bullets" :key="bullet" class="cs-list-item">
          <Icon icon="fluent:checkmark-circle-16-regular" width="16" height="16" />
          <span>{{ bullet }}</span>
        </li>
      </ul>
      <div class="cs-foot">
        <span class="cs-foot-dot" aria-hidden="true"></span>
        <span>XPass AI is being built for an upcoming release. Nothing here is live yet.</span>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useAiStore } from '@/store/ai.js'
import { getComingSoon } from '@/features/coming-soon.js'

const ai = useAiStore()

const visible = computed({
  get: () => ai.visible,
  set: v => { if (!v) ai.close() }
})

const content = computed(() => getComingSoon('xpass-one'))
</script>

<style scoped>
.cs-wrap { display: flex; flex-direction: column; gap: 14px; height: 100%; padding: 4px 2px; }
.cs-icon { display: grid; width: 52px; height: 52px; place-items: center; border: 1px solid var(--hq-border); border-radius: 13px; background: var(--hq-hover); color: var(--hq-accent-strong); }
.cs-topline { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cs-name { font-size: 22px; font-weight: 700; letter-spacing: -.03em; }
.cs-badge { display: inline-flex; align-items: center; height: 23px; padding: 0 10px; border-radius: 999px; background: color-mix(in srgb, var(--hq-accent) 16%, transparent); color: var(--hq-accent-strong); font-size: 11.5px; font-weight: 650; }
.cs-tagline { margin: 2px 0 0; color: var(--hq-text); font-size: 14.5px; font-weight: 550; line-height: 1.45; }
.cs-body { margin: 0; color: var(--hq-muted); font-size: 13px; line-height: 1.6; }
.cs-list { display: grid; gap: 8px; margin: 6px 0 0; padding: 0; list-style: none; }
.cs-list-item { display: flex; align-items: flex-start; gap: 9px; color: var(--hq-text-secondary); font-size: 13px; line-height: 1.4; }
.cs-list-item svg { flex: 0 0 auto; margin-top: 1px; color: var(--hq-accent-strong); }
.cs-foot { display: flex; align-items: flex-start; gap: 8px; margin-top: auto; padding-top: 16px; border-top: 1px solid var(--hq-border); color: var(--hq-muted); font-size: 12px; line-height: 1.4; }
.cs-foot-dot { width: 7px; height: 7px; margin-top: 4px; border-radius: 50%; background: var(--hq-accent); flex: 0 0 auto; }
</style>