<template>
  <Teleport to="body">
    <Transition name="wgp-fade">
      <div v-if="intro" class="wgp-root" role="dialog" aria-modal="true" :aria-label="title">
        <div class="wgp-backdrop" @click="onLater" />
        <div class="wgp-card">
          <div class="wgp-icon" aria-hidden="true">
            <Icon :icon="icon" width="26" height="26" />
          </div>

          <template v-if="intro.type === 'access-removed'">
            <h2 class="wgp-title">{{ title }}</h2>
            <p class="wgp-body">{{ body }}</p>
            <div class="wgp-actions">
              <button class="wgp-btn wgp-btn-primary" type="button" @click="onLater">Got it</button>
            </div>
          </template>

          <template v-else>
            <h2 class="wgp-title">{{ title }}</h2>
            <p class="wgp-body">{{ body }}</p>
            <ul v-if="intro.type === 'access-change' && addedPhrases.length" class="wgp-list">
              <li v-for="phrase in addedPhrases" :key="phrase">
                <Icon icon="fluent:checkmark-circle-16-regular" width="16" height="16" />
                <span>{{ phrase }}</span>
              </li>
            </ul>
            <div class="wgp-actions">
              <button class="wgp-btn wgp-btn-primary" type="button" @click="onAccept">
                {{ intro.type === 'first' ? 'Take a quick tour' : 'Take the tour' }}
              </button>
              <button
                v-if="intro.type === 'access-change'"
                class="wgp-btn wgp-btn-ghost"
                type="button"
                @click="onLater"
              >Show me later</button>
              <button class="wgp-btn wgp-btn-ghost" type="button" @click="onSkip">Not now</button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useTutorialStore } from '@/store/tutorial.js'

const store = useTutorialStore()
const intro = computed(() => store.intro)

const icon = computed(() => {
  if (intro.value?.type === 'access-removed') return 'fluent:lock-closed-20-regular'
  if (intro.value?.type === 'access-change') return 'fluent:sparkle-20-regular'
  return 'fluent:rocket-20-regular'
})

const title = computed(() => {
  if (intro.value?.type === 'access-removed') return 'Your workspace access was updated.'
  if (intro.value?.type === 'access-change') return 'Your workspace has been updated'
  return 'Your XPass HQ workspace is ready'
})

const body = computed(() => {
  if (intro.value?.type === 'access-removed') {
    return 'Some areas may no longer be available. Contact an administrator if you need help.'
  }
  if (intro.value?.type === 'access-change') {
    return 'Want a two-minute walkthrough of what you can see and do?'
  }
  return 'We’ve set up your workspace around the tools you can use. Take a short guided walk-through, or explore at your own pace.'
})

const addedPhrases = computed(() => {
  if (intro.value?.type !== 'access-change') return []
  return [...new Set((intro.value.added || []).map(k => store.describeAdded([k])).map(s => s.replace(/^You can now /, '').replace(/\.$/, '')))]
})

function onAccept() { store.acceptIntro() }
function onLater() { store.dismissIntro() }
function onSkip() { store.dismissIntro() }
</script>

<style scoped>
.wgp-root {
  position: fixed;
  inset: 0;
  z-index: 100001;
  display: grid;
  place-items: center;
  padding: 20px;
}

.wgp-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .5);
  backdrop-filter: blur(2px);
}

.wgp-card {
  position: relative;
  width: min(480px, 100%);
  padding: 30px 30px 26px;
  border: 1px solid var(--hq-border);
  border-radius: 18px;
  background:
    radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--hq-accent) 12%, transparent), transparent 55%),
    var(--hq-surface, #fff);
  color: var(--hq-text);
  box-shadow: 0 24px 70px rgba(0, 0, 0, .35);
}

.wgp-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  margin-bottom: 16px;
  border-radius: 13px;
  background: color-mix(in srgb, var(--hq-accent) 16%, transparent);
  color: var(--hq-accent-strong);
}

.wgp-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -.02em;
}

.wgp-body {
  margin: 10px 0 0;
  color: var(--hq-muted);
  font-size: 14px;
  line-height: 1.6;
}

.wgp-list {
  display: grid;
  gap: 7px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.wgp-list li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--hq-text-secondary);
  font-size: 13.5px;
  line-height: 1.45;
}

.wgp-list svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--hq-success);
}

.wgp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.wgp-btn {
  min-height: 42px;
  padding: 0 18px;
  border-radius: 9px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}

.wgp-btn-primary {
  border: 1px solid var(--hq-accent, #ff5500);
  background: var(--hq-accent, #ff5500);
  color: #fff;
}

.wgp-btn-primary:hover { background: var(--hq-accent-strong, #d94700); }

.wgp-btn-ghost {
  border: 1px solid var(--hq-border);
  background: transparent;
  color: var(--hq-muted);
}

.wgp-btn-ghost:hover { background: var(--hq-hover); }

.wgp-fade-enter-active,
.wgp-fade-leave-active { transition: opacity .18s ease; }
.wgp-fade-enter-from,
.wgp-fade-leave-to { opacity: 0; }

@media (max-width: 560px) {
  .wgp-card { padding: 24px 22px 20px; }
  .wgp-actions { flex-direction: column; }
  .wgp-btn { width: 100%; }
}
</style>