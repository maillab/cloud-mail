<template>
  <span
    class="hq-avatar"
    :class="[`is-${size}`, { 'is-clickable': clickable, 'is-square': square }]"
    :style="sizeStyle"
    role="img"
    :aria-label="ariaLabel"
    :title="tooltip ? label : null"
    @click="$emit('click', $event)"
  >
    <img
      v-if="src && !failed"
      class="avatar-image"
      :src="src"
      :alt="ariaLabel"
      :loading="lazy ? 'lazy' : 'eager'"
      decoding="async"
      @error="failed = true"
    />
    <span v-else class="avatar-initials" aria-hidden="true">{{ initials }}</span>
    <span v-if="showPresence && presence" class="avatar-presence" :class="`presence-${presence}`" :title="presenceLabel"></span>
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  username: { type: String, default: '' },
  size: { type: Number, default: 32 },
  square: { type: Boolean, default: false },
  tooltip: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false },
  lazy: { type: Boolean, default: true },
  showPresence: { type: Boolean, default: false },
  presence: { type: String, default: '' }
})

defineEmits(['click'])

const failed = ref(false)

watch(() => props.src, () => { failed.value = false })

const label = computed(() => props.name || props.username || 'Unnamed team member')

const initials = computed(() => {
  const source = String(props.name || props.username || '?').trim()
  const parts = source.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
})

const sizeStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.max(Math.round(props.size * 0.36), 10)}px`
}))

const ariaLabel = computed(() => props.username ? `${label.value} (@${props.username})` : label.value)

const presenceLabel = computed(() => ({
  online: 'Online',
  away: 'Away',
  offline: 'Offline'
}[props.presence] || ''))
</script>

<style scoped>
.hq-avatar {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: visible;
  border-radius: 50%;
  background: color-mix(in srgb, var(--hq-accent) 14%, var(--hq-surface));
  color: var(--hq-accent-strong);
  font-weight: 650;
  letter-spacing: .01em;
  line-height: 1;
  user-select: none;
}

.hq-avatar.is-square {
  border-radius: 10px;
}

.hq-avatar.is-clickable {
  cursor: pointer;
}

.avatar-image {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.avatar-initials {
  display: block;
  transform: translateY(.5px);
}

.avatar-presence {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 27%;
  height: 27%;
  min-width: 7px;
  min-height: 7px;
  border: 2px solid var(--hq-surface);
  border-radius: 50%;
  background: var(--hq-muted);
}

.avatar-presence.presence-online {
  background: #35c07f;
}

.avatar-presence.presence-away {
  background: #f0a92e;
}
</style>
