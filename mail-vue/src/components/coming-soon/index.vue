<template>
  <el-scrollbar class="cs-scroll">
    <main class="cs-page">
      <div class="cs-card">
        <div class="cs-icon">
          <Icon :icon="content.icon" width="30" height="30" />
        </div>
        <div class="cs-topline">
          <span class="cs-name">{{ content.name }}</span>
          <span class="cs-badge">Coming soon</span>
        </div>
        <p class="cs-tagline">{{ content.tagline }}</p>
        <p class="cs-body">{{ content.body }}</p>
        <ul v-if="content.bullets.length" class="cs-list">
          <li v-for="bullet in content.bullets" :key="bullet" class="cs-list-item">
            <Icon icon="fluent:checkmark-circle-16-regular" width="16" height="16" />
            <span>{{ bullet }}</span>
          </li>
        </ul>
        <div class="cs-foot">
          <span class="cs-foot-dot" aria-hidden="true"></span>
          <span>This feature is being built for an upcoming release. Nothing here is live yet.</span>
        </div>
      </div>
    </main>
  </el-scrollbar>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { getComingSoon } from '@/features/coming-soon.js'

const route = useRoute()

const content = computed(() => getComingSoon(String(route.params.feature || '')))
</script>

<style scoped>
.cs-scroll { height: 100%; background: var(--hq-page); }

.cs-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 40px clamp(20px, 4vw, 56px);
}

.cs-card {
  width: min(640px, 100%);
  padding: 34px clamp(24px, 4vw, 44px) 30px;
  border: 1px solid var(--hq-border);
  border-radius: 16px;
  background:
    radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--hq-accent) 10%, transparent), transparent 60%),
    var(--hq-surface, var(--el-bg-color));
  color: var(--hq-text);
}

.cs-icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  margin-bottom: 18px;
  border: 1px solid var(--hq-border);
  border-radius: 14px;
  background: var(--hq-hover);
  color: var(--hq-accent-strong);
}

.cs-topline {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cs-name {
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  letter-spacing: -.03em;
  line-height: 1.15;
}

.cs-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--hq-accent) 16%, transparent);
  color: var(--hq-accent-strong);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .02em;
}

.cs-tagline {
  margin: 16px 0 0;
  color: var(--hq-text);
  font-size: 15px;
  font-weight: 550;
  line-height: 1.45;
}

.cs-body {
  margin: 10px 0 0;
  color: var(--hq-muted);
  font-size: 13.5px;
  line-height: 1.6;
}

.cs-list {
  display: grid;
  gap: 8px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}

.cs-list-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--hq-text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.cs-list-item :deep(svg),
.cs-list-item svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--hq-accent-strong);
}

.cs-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 26px;
  padding-top: 16px;
  border-top: 1px solid var(--hq-border);
  color: var(--hq-muted);
  font-size: 12px;
  line-height: 1.4;
}

.cs-foot-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--hq-accent);
  flex: 0 0 auto;
}

@media (max-width: 700px) {
  .cs-page { padding: 24px 16px; }
  .cs-card { padding: 26px 22px 24px; }
}
</style>