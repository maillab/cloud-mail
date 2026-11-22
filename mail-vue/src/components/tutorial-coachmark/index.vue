<template>
  <Teleport to="body">
    <div v-if="activeTour && currentStep" class="coachmark-root">
      <!-- spotlight overlay -->
      <div class="coachmark-backdrop" @click="onBackdropClick" />

      <!-- spotlight cutout -->
      <div
        v-if="spotlightRect"
        class="coachmark-spotlight"
        :style="spotlightStyle"
      />

      <!-- coachmark card -->
      <div
        ref="cardRef"
        class="coachmark-card"
        :class="`placement-${currentStep.placement || 'center'}`"
        :style="cardStyle"
      >
        <div class="coachmark-chapter">{{ activeTour.title }}</div>
        <div class="coachmark-head">
          <span class="coachmark-step">{{ activeStep + 1 }} / {{ activeTour.steps.length }}</span>
          <span class="coachmark-title">{{ currentStep.title }}</span>
        </div>
        <p class="coachmark-body">{{ currentStep.body }}</p>
        <div class="coachmark-progress" aria-hidden="true">
          <span
            v-for="(step, index) in activeTour.steps"
            :key="index"
            class="coachmark-dot"
            :class="{ 'is-active': index === activeStep }"
          ></span>
        </div>
        <div class="coachmark-actions">
          <button
            v-if="activeStep > 0"
            class="coachmark-btn coachmark-btn-ghost"
            @click="prev"
          >Back</button>
          <button
            class="coachmark-btn coachmark-btn-ghost"
            @click="pause"
          >Pause</button>
          <button
            class="coachmark-btn coachmark-btn-primary"
            @click="next"
          >{{ isLastStep ? 'Finish' : 'Next' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
import { useTutorialStore } from '@/store/tutorial.js'
import router from '@/router/index.js'

const tutorialStore = useTutorialStore()
const activeTour = computed(() => tutorialStore.activeTour)
const activeStep = computed(() => tutorialStore.activeStep)
const currentStep = computed(() => tutorialStore.currentStep)
const isLastStep = computed(() => {
  if (!activeTour.value) return false
  return tutorialStore.activeStep >= activeTour.value.steps.length - 1
})

const spotlightRect = ref(null)
const cardRef = ref(null)
const cardRect = ref(null)

const spotlightStyle = computed(() => {
  if (!spotlightRect.value) return {}
  const { top, left, width, height } = spotlightRect.value
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
})

const cardStyle = computed(() => {
  if (!cardRect.value || !spotlightRect.value) {
    // center fallback
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const s = spotlightRect.value
  const placement = currentStep.value?.placement || 'center'
  const gap = 12
  let top, left
  if (placement === 'top') {
    top = s.top - cardRect.value.height - gap
    left = s.top + s.left + s.width / 2 - cardRect.value.width / 2
  } else if (placement === 'bottom') {
    top = s.top + s.height + gap
    left = s.left + s.width / 2 - cardRect.value.width / 2
  } else if (placement === 'left') {
    top = s.top + s.height / 2 - cardRect.value.height / 2
    left = s.left - cardRect.value.width - gap
  } else if (placement === 'right') {
    top = s.top + s.height / 2 - cardRect.value.height / 2
    left = s.left + s.width + gap
  } else {
    top = s.top + s.height / 2 - cardRect.value.height / 2
    left = s.left + s.width / 2 - cardRect.value.width / 2
  }
  // clamp to viewport
  top = Math.max(12, Math.min(top, window.innerHeight - cardRect.value.height - 12))
  left = Math.max(12, Math.min(left, window.innerWidth - cardRect.value.width - 12))
  return { top: `${top}px`, left: `${left}px` }
})

function measure() {
  const step = currentStep.value
  if (!step || !step.target) {
    spotlightRect.value = null
    return
  }
  const el = document.querySelector(step.target)
  if (!el) {
    spotlightRect.value = null
    return
  }
  const rect = el.getBoundingClientRect()
  spotlightRect.value = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
  // measure card after render
  nextTick(() => {
    if (cardRef.value) {
      cardRect.value = {
        width: cardRef.value.offsetWidth,
        height: cardRef.value.offsetHeight,
      }
    }
  })
}

function onResize() { measure() }

function onBackdropClick() {
  // clicking the backdrop does not skip; only the buttons do
}

async function goToStep() {
  const step = currentStep.value
  // Navigate to the tour's home route on the first step if needed, then to any
  // per-step route. This lets module tours open their module before spotlighting.
  const tourRoute = tutorialStore.activeTour?.route
  const targetRoute = step?.route || tourRoute
  if (targetRoute && activeStep.value === 0) {
    const currentRoute = router.currentRoute.value
    if (currentRoute.name !== targetRoute) {
      await router.push({ name: targetRoute }).catch(() => {})
      await new Promise(r => setTimeout(r, 350))
    }
  } else if (step?.route) {
    const currentRoute = router.currentRoute.value
    if (currentRoute.name !== step.route) {
      await router.push({ name: step.route }).catch(() => {})
      await new Promise(r => setTimeout(r, 300))
    }
  }
  await nextTick()
  measure()
}

function next() { tutorialStore.nextStep().then(goToStep) }
function prev() { tutorialStore.prevStep().then(goToStep) }
function pause() { tutorialStore.dismissTour() }
function dismiss() { tutorialStore.dismissTour() }

watch(() => tutorialStore.activeStep, () => { goToStep() })
watch(() => tutorialStore.activeTour, (t) => {
  if (t) goToStep()
  else spotlightRect.value = null
})

onMounted(() => {
  window.addEventListener('resize', onResize)
  tutorialStore.load()
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.coachmark-root {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}

.coachmark-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: auto;
}

.coachmark-spotlight {
  position: fixed;
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  pointer-events: none;
  transition: top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease;
}

.coachmark-card {
  position: fixed;
  z-index: 100000;
  width: 320px;
  max-width: calc(100vw - 32px);
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-primary, #1a1a1a);
  border: 1px solid var(--hq-border, #e7e2dc);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  padding: 18px 20px;
  pointer-events: auto;
}

.coachmark-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.coachmark-chapter {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--hq-accent, #ff5500);
  opacity: .85;
}

.coachmark-progress {
  display: flex;
  gap: 5px;
  margin: 0 0 14px;
}

.coachmark-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--hq-border, #e7e2dc);
}

.coachmark-dot.is-active {
  width: 16px;
  border-radius: 3px;
  background: var(--hq-accent, #ff5500);
}

.coachmark-step {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--hq-accent, #ff5500);
  background: var(--hq-selected, #fff1e8);
  padding: 2px 8px;
  border-radius: 10px;
}

.coachmark-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--el-text-color-primary, #1a1a1a);
}

.coachmark-body {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--hq-muted, #6b6b6b);
}

.coachmark-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.coachmark-btn {
  padding: 6px 14px;
  border: 0;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
  transition: background 0.15s;
}

.coachmark-btn-ghost {
  background: transparent;
  color: var(--hq-muted, #6b6b6b);
}
.coachmark-btn-ghost:hover { background: var(--hq-hover, #f0f0f0); }

.coachmark-btn-primary {
  background: var(--hq-accent, #ff5500);
  color: #fff;
}
.coachmark-btn-primary:hover { background: var(--hq-accent-strong, #d94700); }
</style>