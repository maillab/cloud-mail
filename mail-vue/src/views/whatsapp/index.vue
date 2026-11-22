<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / WHATSAPP</div>
          <h1>{{ $t('whatsapp') }}</h1>
        </div>
        <el-button  @click="loadConversations" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
      </div>

      <el-alert type="info" :closable="false" show-icon class="approval-note">
        <span>{{ $t('requiresApproval') }}</span>
      </el-alert>

      <div class="wa-layout">
        <aside class="conv-panel">
          <button
            v-for="conv in conversations"
            :key="conv.id"
            class="conv-item"
            :class="{ 'is-active': activeConv === conv.id }"
            type="button"
            @click="selectConversation(conv.id)"
          >
            <span class="conv-name">{{ conv.contact_name || conv.contact_phone || 'Contact' }}</span>
            <span class="conv-last">{{ conv.last_message }}</span>
          </button>
          <p v-if="!conversations.length" class="conv-empty">{{ $t('noConversations') }}</p>
        </aside>

        <section class="message-panel">
          <div v-if="!activeConv" class="message-empty">{{ $t('noConversations') }}</div>
          <template v-else>
            <div class="message-list">
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="message-row"
                :class="{ 'is-outbound': msg.direction === 'outbound', 'is-suggested': msg.ai_suggested && !msg.human_approved }"
              >
                <span class="msg-body">{{ msg.body }}</span>
                <span v-if="msg.ai_suggested && !msg.human_approved" class="msg-tag">{{ $t('suggest') }}</span>
              </div>
            </div>
            <div class="composer">
              <el-input
                v-model="draft"
                type="textarea"
                :rows="2"
                :placeholder="$t('typeMessage')"
                @keyup.ctrl.enter="sendMessage"
              />
              <div class="composer-actions">
                <el-button v-perm="'whatsapp:send'" :disabled="!draft.trim()" @click="sendMessage">{{ $t('sendApproved') }}</el-button>
              </div>
            </div>
          </template>
        </section>
      </div>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  whatsappConversationsList, whatsappMessagesList, whatsappSend
} from '@/request/whatsapp.js'

const conversations = ref([])
const messages = ref([])
const activeConv = ref(null)
const draft = ref('')

async function loadConversations() {
  try {
    const resp = await whatsappConversationsList({ page: 1, pageSize: 100 })
    conversations.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load conversations.', type: 'error', plain: true })
  }
}

async function selectConversation(id) {
  activeConv.value = id
  try {
    const resp = await whatsappMessagesList(id, { page: 1, pageSize: 50 })
    messages.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load messages.', type: 'error', plain: true })
  }
}

async function sendMessage() {
  if (!draft.value.trim() || !activeConv.value) return
  try {
    await whatsappSend({
      conversation_id: activeConv.value,
      message: draft.value,
      human_approved: true
    })
    draft.value = ''
    await selectConversation(activeConv.value)
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to send.', type: 'error', plain: true })
  }
}

onMounted(loadConversations)
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.approval-note { margin-bottom: 14px; }
.wa-layout { display: grid; grid-template-columns: 260px 1fr; gap: 14px; min-height: 420px; }
.conv-panel { padding: 8px; border: 1px solid var(--hq-border); border-radius: 10px; background: var(--hq-surface); }
.conv-item { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; text-align: left; cursor: pointer; }
.conv-item:hover { background: var(--hq-hover); }
.conv-item.is-active { background: var(--hq-selected); }
.conv-name { font-size: 13px; font-weight: 600; color: var(--hq-text); }
.conv-last { overflow: hidden; color: var(--hq-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.conv-empty { padding: 20px 10px; color: var(--hq-muted); font-size: 13px; }
.message-panel { display: flex; flex-direction: column; border: 1px solid var(--hq-border); border-radius: 10px; background: var(--hq-surface); }
.message-empty { display: flex; flex: 1; align-items: center; justify-content: center; color: var(--hq-muted); }
.message-list { display: flex; flex: 1; flex-direction: column; gap: 8px; padding: 14px; overflow-y: auto; }
.message-row { display: flex; align-items: center; gap: 6px; align-self: flex-start; max-width: 75%; padding: 8px 12px; border-radius: 10px; background: var(--hq-hover); font-size: 13px; }
.message-row.is-outbound { align-self: flex-end; background: var(--hq-selected); }
.message-row.is-suggested { opacity: .7; border: 1px dashed var(--hq-border-strong); }
.msg-body { white-space: pre-wrap; }
.msg-tag { font-size: 10px; color: var(--hq-muted); }
.composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--hq-border); }
.composer-actions { display: flex; align-items: center; }
@media (max-width: 767px) { .wa-layout { grid-template-columns: 1fr; } }
</style>