<template>
  <div class="theme-options" role="radiogroup" :aria-label="t('themeStyle')">
    <label
      v-for="option in themeOptions"
      :key="option.theme"
      class="theme-card"
      :class="{ 'is-selected': uiStore.theme === option.theme }"
    >
      <span class="theme-preview" :class="`preview-${option.theme}`" aria-hidden="true">
        <template v-if="option.theme === 'system'">
          <span class="preview-split-light">
            <span class="preview-sidebar"><i/><i/></span>
            <span class="preview-main"><i/><i/></span>
          </span>
          <span class="preview-split-dark">
            <span class="preview-sidebar"><i/><i/></span>
            <span class="preview-main"><i/><i/></span>
          </span>
        </template>
        <template v-else>
          <span class="preview-sidebar"><i/><i/><i/></span>
          <span class="preview-main"><i/><i/><i/></span>
        </template>
      </span>
      <span class="theme-caption">
        <span>{{ t(option.label) }}</span>
        <input
          type="radio"
          :name="groupName"
          :value="option.theme"
          :checked="uiStore.theme === option.theme"
          @change="selectTheme(option.theme, $event)"
        >
      </span>
    </label>
  </div>
</template>

<script setup>
import {useId} from 'vue'
import {useI18n} from 'vue-i18n'
import {useUiStore} from '@/store/ui.js'

const {t} = useI18n()
const uiStore = useUiStore()
const groupName = useId()
const themeOptions = [
  {label: 'lightTheme', theme: 'light'},
  {label: 'darkTheme', theme: 'dark'},
  {label: 'followSystem', theme: 'system'},
]

function selectTheme(theme, event) {
  const bounds = event.currentTarget.closest('.theme-card')?.getBoundingClientRect()
  const origin = {
    x: bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
    y: bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2,
  }

  const root = document.documentElement
  const applyThemeChange = () => {
    uiStore.setTheme(theme)
  }

  if (!document.startViewTransition) {
    applyThemeChange()
    return
  }

  const endRadius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y)
  )
  const willBeDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.setAttribute('data-theme-to', willBeDark ? 'dark' : 'light')
  root.style.setProperty('--vt-x', `${origin.x}px`)
  root.style.setProperty('--vt-y', `${origin.y}px`)
  root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)
  const transition = document.startViewTransition(applyThemeChange)
  transition.finished.finally(() => root.removeAttribute('data-theme-to'))
}
</script>

<style scoped lang="scss">
.theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 160px));
  gap: 14px;
  width: 100%;
  max-width: 520px;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.theme-card {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--hq-surface);
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease;

  &:hover,
  &.is-selected {
    border-color: var(--el-color-primary);
  }

  &.is-selected {
    box-shadow: 0 0 0 1px var(--el-color-primary);
  }

  &:has(input:focus-visible) {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 3px;
  }
}

.theme-preview {
  display: flex;
  aspect-ratio: 1.5;
  overflow: hidden;
  border: 1px solid var(--hq-border);
  border-radius: 5px;
  background: #f8f7f5;

  i {
    display: block;
    height: 5px;
    border-radius: 2px;
    background: #e2dbd5;
  }

  .preview-sidebar {
    display: grid;
    align-content: start;
    gap: 6px;
    width: 28%;
    padding: 8px 5px;
    background: #eee6df;

    i:first-child {
      background: #ff5500;
    }
  }

  .preview-main {
    display: grid;
    flex: 1;
    align-content: start;
    gap: 8px;
    padding: 8px;

    i:first-child {
      width: 55%;
    }
  }

  &.preview-dark {
    background: #14110e;
    border-color: #362e28;

    i {
      background: #362e28;
    }

    .preview-sidebar {
      background: #1c1814;

      i:first-child {
        background: #ff5500;
      }
    }
  }

  &.preview-system {
    display: flex;

    .preview-split-light,
    .preview-split-dark {
      display: flex;
      width: 50%;
      height: 100%;
      overflow: hidden;
    }

    .preview-split-light {
      background: #f8f7f5;
      border-right: 1px solid #d0c8c0;
    }

    .preview-split-dark {
      background: #14110e;

      i {
        background: #362e28;
      }

      .preview-sidebar {
        background: #1c1814;

        i:first-child {
          background: #ff5500;
        }
      }
    }
  }
}

.theme-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 28px;
  padding-top: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);

  input {
    flex-shrink: 0;
    margin: 0;
    accent-color: var(--el-color-primary);
    cursor: pointer;
  }
}
</style>
