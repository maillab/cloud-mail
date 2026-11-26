<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / AI</div>
          <h1>{{ $t('ai') }}</h1>
        </div>
        <el-button  @click="loadSuggestions" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
      </div>

      <el-alert type="info" :closable="false" show-icon class="note">
        <span>{{ $t('requiresApproval') }}</span>
      </el-alert>

      <el-card class="module-card">
        <el-table v-if="suggestions.length" :data="suggestions" style="width: 100%">
          <el-table-column prop="context_type" :label="$t('crmType')" min-width="110" />
          <el-table-column prop="suggestion" :label="$t('suggestions')" min-width="260" />
          <el-table-column prop="accepted" :label="$t('status')" min-width="90">
            <template #default="scope">
              <el-tag size="small" :type="scope.row.accepted ? 'success' : 'info'">{{ scope.row.accepted ? $t('accept') : $t('pending') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('actions')" min-width="100" fixed="right">
            <template #default="scope">
              <el-button v-perm="'ai:use'" v-if="!scope.row.accepted" size="small" @click="acceptSuggestion(scope.row.id)">{{ $t('accept') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>{{ $t('noSuggestions') }}</p>
        </div>
      </el-card>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { aiSuggestionsList, aiAccept } from '@/request/ai.js'

const suggestions = ref([])

async function loadSuggestions() {
  try {
    suggestions.value = (await aiSuggestionsList()).list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load.', type: 'error', plain: true })
  }
}

async function acceptSuggestion(id) {
  try {
    await aiAccept(id)
    loadSuggestions()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed.', type: 'error', plain: true })
  }
}

onMounted(loadSuggestions)
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.note { margin-bottom: 14px; }
.module-card { min-width: 0; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--hq-text-secondary); }
</style>