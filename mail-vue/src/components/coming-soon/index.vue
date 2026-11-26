<template>
  <el-scrollbar class="cs-scroll">
    <main class="cs-page">
      <article class="cs-card">
        <header class="cs-head">
          <div class="cs-icon">
            <Icon :icon="content.icon" width="30" height="30" />
          </div>
          <div class="cs-heading">
            <div class="cs-topline">
              <h1 class="cs-name">{{ content.name }}</h1>
              <span class="cs-badge">Coming soon</span>
            </div>
            <p class="cs-tagline">{{ content.tagline }}</p>
          </div>
        </header>

        <p class="cs-body">{{ content.body }}</p>
        <p v-for="(para, index) in content.intro || []" :key="`intro-${index}`" class="cs-body">
          {{ para }}
        </p>

        <template v-if="content.sections && content.sections.length">
          <h2 v-if="content.sectionsTitle" class="cs-sections-title">{{ content.sectionsTitle }}</h2>
          <div class="cs-sections">
            <section v-for="(section, index) in content.sections" :key="index" class="cs-section">
              <span class="cs-section-mark" aria-hidden="true">
                <Icon icon="fluent:arrow-right-16-regular" width="14" height="14" />
              </span>
              <div class="cs-section-copy">
                <h3>{{ section.title }}</h3>
                <p>{{ section.body }}</p>
              </div>
            </section>
          </div>
        </template>

        <ul v-if="content.bullets && content.bullets.length" class="cs-list">
          <li v-for="bullet in content.bullets" :key="bullet" class="cs-list-item">
            <Icon icon="fluent:checkmark-circle-16-regular" width="16" height="16" />
            <span>{{ bullet }}</span>
          </li>
        </ul>

        <div v-if="content.note" class="cs-note" role="note">
          <Icon icon="fluent:info-16-regular" width="18" height="18" />
          <span>{{ content.note }}</span>
        </div>

        <div class="cs-foot">
          <span class="cs-foot-dot" aria-hidden="true"></span>
          <span>This feature is being built for an upcoming release. Nothing here is live yet.</span>
        </div>
      </article>
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
  align-items: flex-start;
  justify-content: center;
  min-height: 100%;
  padding: 40px clamp(20px, 4vw, 56px);
}

.cs-card {
  width: min(760px, 100%);
  padding: clamp(26px, 4vw, 44px);
  border: 1px solid var(--hq-border);
  border-radius: 18px;
  background:
    radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--hq-accent) 10%, transparent), transparent 55%),
    var(--hq-surface, var(--el-bg-color));
  color: var(--hq-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
}

.cs-head {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 8px;
}

.cs-icon {
  display: grid;
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 1px solid var(--hq-border);
  border-radius: 14px;
  background: var(--hq-hover);
  color: var(--hq-accent-strong);
}

.cs-heading { min-width: 0; }

.cs-topline {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cs-name {
  margin: 0;
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 700;
  letter-spacing: -.03em;
  line-height: 1.15;
}

.cs-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 11px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--hq-accent) 16%, transparent);
  color: var(--hq-accent-strong);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .02em;
}

.cs-tagline {
  margin: 8px 0 0;
  color: var(--hq-text);
  font-size: 15px;
  font-weight: 550;
  line-height: 1.45;
}

.cs-body {
  margin: 14px 0 0;
  color: var(--hq-muted);
  font-size: 14px;
  line-height: 1.65;
}

.cs-sections-title {
  margin: 28px 0 14px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--hq-muted);
}

.cs-sections {
  display: grid;
  gap: 4px;
}

.cs-section {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--hq-border);
}

.cs-section:last-child { border-bottom: 0; }

.cs-section-mark {
  display: grid;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  margin-top: 1px;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--hq-accent) 12%, transparent);
  color: var(--hq-accent-strong);
}

.cs-section-copy { min-width: 0; }

.cs-section-copy h3 {
  margin: 0 0 4px;
  font-size: 14.5px;
  font-weight: 650;
  letter-spacing: -.01em;
  color: var(--hq-text);
}

.cs-section-copy p {
  margin: 0;
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
  font-size: 13.5px;
  line-height: 1.45;
}

.cs-list-item :deep(svg),
.cs-list-item svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--hq-accent-strong);
}

.cs-note {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin-top: 26px;
  padding: 15px 17px;
  border: 1px solid color-mix(in srgb, var(--hq-warning) 40%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--hq-warning) 12%, transparent);
  color: var(--hq-text);
  font-size: 13.5px;
  font-weight: 550;
  line-height: 1.55;
}

.cs-note :deep(svg),
.cs-note svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--hq-warning);
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
  .cs-card { padding: 26px 22px 24px; border-radius: 14px; }
  .cs-head { flex-direction: column; gap: 14px; }
}
</style>