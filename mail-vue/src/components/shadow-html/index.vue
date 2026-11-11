<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { sanitizeEmailHtml } from '@/utils/email-html.js'

const BLOCKED_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FRAME'])

const HOST_CSS = `
  :host {
    all: initial;
    width: 100%;
    height: 100%;
    font-family: Inter, 'Helvetica Neue', Helvetica, 'PingFang SC',
                'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #13181D;
    word-break: break-word;
  }

  h1, h2, h3, h4 {
    font-size: 18px;
    font-weight: 700;
  }

  p {
    margin: 0;
  }

  a {
    text-decoration: none;
    color: #0E70DF;
  }

  .shadow-content {
    background: #FFFFFF;
    width: fit-content;
    height: fit-content;
    min-width: 100%;
  }

  img:not(table img) {
    max-width: 100%;
    height: auto !important;
  }
`

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null

function updateContent() {
  if (!shadowRoot) return

  const style = document.createElement('style')
  style.textContent = HOST_CSS

  const content = document.createElement('div')
  content.className = 'shadow-content'

  const doc = new DOMParser().parseFromString(sanitizeEmailHtml(props.html) || '', 'text/html')
  // 只取 CSSOM 解析后的声明。属性值里的标签不会再被当成 HTML。
  if (doc.body?.style?.cssText) {
    content.style.cssText = doc.body.style.cssText
  }

  for (const node of doc.head.querySelectorAll('style')) {
    content.appendChild(document.importNode(node, true))
  }
  for (const node of [...doc.body.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCKED_TAGS.has(node.tagName)) continue
    content.appendChild(document.importNode(node, true))
  }
  content.querySelectorAll('script,iframe,object,embed,link,meta,base,frame').forEach((node) => node.remove())

  shadowRoot.replaceChildren(style, content)
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const childWidth = shadowContent.scrollWidth

  if (childWidth === 0) return

  const scale = parentWidth / childWidth

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: Inter, "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif;
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
