<template>
  <div class="fin-stat" :class="`is-${tone}`">
    <div class="fin-stat-label">{{ label }}</div>
    <div class="fin-stat-value">{{ value }}</div>
    <div v-if="hint || $slots.hint" class="fin-stat-hint">
      <slot name="hint">{{ hint }}</slot>
    </div>
  </div>
</template>

<script setup>
// One tile shape for every finance KPI, so the overview and the section headers
// read as one product rather than a collection of ad-hoc cards.
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '—' },
  hint: { type: String, default: '' },
  tone: { type: String, default: 'default' },
})
</script>

<style scoped>
.fin-stat {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--hq-border, rgba(148, 163, 184, .2));
  border-radius: 11px;
  background: var(--hq-surface, transparent);
}

.fin-stat-label {
  color: var(--hq-muted);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: .01em;
  text-transform: uppercase;
}

.fin-stat-value {
  overflow: hidden;
  color: var(--hq-text);
  font-size: 19px;
  font-weight: 650;
  letter-spacing: -.02em;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.fin-stat-hint {
  color: var(--hq-muted);
  font-size: 11.5px;
}

.fin-stat.is-positive .fin-stat-value {
  color: var(--hq-success, #2f9e6f);
}

.fin-stat.is-negative .fin-stat-value {
  color: var(--hq-danger, #e5484d);
}

.fin-stat.is-warning .fin-stat-value {
  color: var(--hq-warning, #d98a1c);
}
</style>