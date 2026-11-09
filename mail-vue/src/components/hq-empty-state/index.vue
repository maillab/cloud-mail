<template>
  <div class="hq-empty-state" role="status">
    <span class="empty-icon">
      <Icon :icon="icon" width="21" height="21" />
    </span>
    <div class="empty-copy">
      <strong>{{ title }}</strong>
      <span>{{ description }}</span>
    </div>
    <el-button v-if="actionLabel" text type="primary" @click="$emit('action')">
      {{ actionLabel }}
    </el-button>
  </div>
</template>

<script setup>
import {Icon} from '@iconify/vue'

defineProps({
  icon: {type: String, default: 'fluent:info-20-regular'},
  title: {type: String, required: true},
  description: {type: String, required: true},
  actionLabel: {type: String, default: ''},
})

defineEmits(['action'])
</script>

<style scoped>
.hq-empty-state {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 18px 16px;
  border: 1px dashed #e7e2de;
  border-radius: 12px;
  background: #fbfaf9;
}

.empty-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 11px;
  background: #fff0e8;
  color: #d94b00;
}

.empty-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.empty-copy strong {
  color: #302b28;
  font-size: 13px;
  font-weight: 650;
}

.empty-copy span {
  color: #817a75;
  font-size: 12px;
  line-height: 1.5;
}

.hq-empty-state :deep(.el-button) {
  flex: 0 0 auto;
  margin-left: auto;
}

@media (max-width: 520px) {
  .hq-empty-state {
    align-items: flex-start;
  }
}
</style>
