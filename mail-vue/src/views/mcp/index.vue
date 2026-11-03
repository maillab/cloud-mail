<template>
  <div class="mcp-page">
    <el-scrollbar height="100%">
      <div class="box">
        <div class="container">
          <div class="title">{{ $t('mcpSkill') }}</div>
          <p class="desc">{{ $t('mcpIntro') }}</p>

          <div class="item setting-row">
            <div>{{ $t('mcpEndpoint') }}</div>
            <div class="endpoint-row">
              <span class="endpoint">{{ endpoint }}</span>
              <el-button size="small" @click="copyText(endpoint, 'endpoint')">
                {{ copied.endpoint ? $t('mcpCopied') : $t('mcpCopy') }}
              </el-button>
            </div>
          </div>

          <div class="title">{{ $t('mcpStepsTitle') }}</div>
          <ol class="steps">
            <li>{{ $t('mcpStep1') }}</li>
            <li>{{ $t('mcpStep2') }}</li>
            <li>{{ $t('mcpStep3') }}</li>
            <li>{{ $t('mcpStep4') }}</li>
          </ol>

          <div class="title">{{ $t('mcpPromptTitle') }}</div>
          <div class="prompt-box">
            <pre>{{ deployPrompt }}</pre>
            <div class="prompt-actions">
              <el-button type="primary" @click="copyText(deployPrompt, 'prompt')">
                {{ copied.prompt ? $t('mcpCopied') : $t('mcpCopyPrompt') }}
              </el-button>
            </div>
          </div>

          <p class="note">{{ $t('mcpSecurityNote') }}</p>
          <p class="note">{{ $t('mcpWriteNote') }}</p>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { reactive } from 'vue';
import { MCP_DEPLOY_PROMPT } from './deploy-prompt.js';

const endpoint = 'https://mail.zgatri.com/mcp/';
const deployPrompt = MCP_DEPLOY_PROMPT;
const copied = reactive({ endpoint: false, prompt: false });

async function copyText(text, key) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
  }
  copied[key] = true;
  setTimeout(() => {
    copied[key] = false;
  }, 2000);
}
</script>

<style scoped>
.mcp-page {
  height: 100%;
}

.box {
  max-width: 860px;
  margin: 0 auto;
  padding: 20px;
}

.container {
  padding: 8px 4px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  margin: 20px 0 10px;
}

.title:first-child {
  margin-top: 0;
}

.desc {
  line-height: 1.7;
  margin: 0 0 8px;
}

.item {
  margin: 12px 0;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.endpoint-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.endpoint {
  font-family: monospace;
  word-break: break-all;
}

.steps {
  line-height: 1.9;
  padding-left: 20px;
  margin: 0 0 8px;
}

.prompt-box {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 14px;
  background: var(--el-fill-color-light);
}

.prompt-box pre {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  margin: 0 0 12px;
  max-height: 420px;
  overflow: auto;
  font-size: 13px;
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
}

.note {
  line-height: 1.7;
  margin: 14px 0 0;
}
</style>
