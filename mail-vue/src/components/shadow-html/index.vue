<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null

/**
 * 邮件正文清洗配置。
 * 威胁模型：邮件正文由发件人完全控制，而渲染它的页面持有用户 token。
 * 不清洗时 <img onerror> / <svg onload> 会在 Shadow DOM 内执行，
 * 等同"来一封邮件就能盗号"。
 *
 * 保留 <style>：邮件普遍依赖它做排版，剥掉会大面积错版；
 * 代价是保留了一点 CSS 注入面，因此在下面额外中和 :host 选择器与 @import。
 */
const PURIFY_CONFIG = {
  ADD_TAGS: ['style', 'center', 'font'],
  ADD_ATTR: ['target', 'bgcolor', 'background', 'align', 'valign', 'border', 'cellpadding', 'cellspacing'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link', 'frame', 'frameset', 'input', 'button', 'textarea', 'select', 'option'],
  FORBID_ATTR: ['srcdoc', 'formaction', 'xlink:href'],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // 返回完整文档：典型邮件把 <style> 放在 <head> 里，默认只取 body 会丢样式
  WHOLE_DOCUMENT: true
}

// 中和 <style> 块内能影响宿主页面的写法：:host 可选中影子宿主做 UI 伪装，@import 可外联
function neutralizeStyleBlocks(html) {
  return html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (m, css) => {
    const safe = css
      .replace(/:host\b/gi, ':host-neutralized')
      .replace(/@import[^;]+;/gi, '')
    return `<style>${safe}</style>`
  })
}

// 清洗从 <body style="..."> 提取出的样式：正则 [^"]* 保证无引号，
// 再去掉 </style 即可确保拼进 <style> 模板时无法逃逸
function sanitizeBodyStyle(style) {
  return (style || '')
    .replace(/<\/style/gi, '')
    .replace(/@import/gi, '')
}

function updateContent() {
  if (!shadowRoot) return;

  // 1. 提取 <body> 的 style 属性（先提取，DOMPurify 会丢掉 <body> 标签本身）
  const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
  const bodyStyleMatch = props.html.match(bodyStyleRegex);
  const bodyStyle = sanitizeBodyStyle(bodyStyleMatch ? bodyStyleMatch[1] : '');

  // 2. DOMPurify 清洗正文：去掉事件处理器、javascript: 等可执行内容
  //    注意从清洗后的结果里提 body style（WHOLE_DOCUMENT 模式保留 <body> 标签）
  const sanitized = DOMPurify.sanitize(props.html, PURIFY_CONFIG);
  const cleanedHtml = neutralizeStyleBlocks(sanitized)
    .replace(/<\/?(html|head|body)[^>]*>/gi, '');

  // 3. 将 body 的 style 应用到 .shadow-content
  shadowRoot.innerHTML = `
    <style>
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
        ${bodyStyle ? bodyStyle : ''} /* 注入 body 的 style */
      }

      img:not(table img) {
        max-width: 100%;
        height: auto !important;
      }

    </style>
    <div class="shadow-content">
      ${cleanedHtml}
    </div>
  `;
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
