<template>
  <div class="ui-theme-options" role="radiogroup" :aria-label="t('uiTheme')">
    <label
      v-for="option in themeOptions"
      :key="option.value"
      class="ui-theme-card"
      :class="{ 'is-selected': modelValue === option.value }"
    >
      <span class="ui-theme-preview" :class="'preview-' + option.value" aria-hidden="true">
        <span class="preview-sidebar"><i/><i/><i/></span>
        <span class="preview-main"><i/><i/><i/></span>
      </span>
      <span class="ui-theme-caption">
        <span>{{ t(option.label) }}</span>
        <input
          type="radio"
          :name="groupName"
          :value="option.value"
          :checked="modelValue === option.value"
          @change="emit('update:modelValue', option.value)"
        >
      </span>
    </label>
  </div>
</template>

<script setup>
import {useId} from 'vue'
import {useI18n} from 'vue-i18n'

defineProps({
  modelValue: {
    type: String,
    default: 'workspace'
  }
})

const emit = defineEmits(['update:modelValue'])
const {t} = useI18n()
const groupName = useId()
const themeOptions = [
  {value: 'postmark', label: 'themePostmark'},
  {value: 'workspace', label: 'themeWorkspace'},
  {value: 'palette', label: 'themePalette'},
]
</script>

<style scoped lang="scss">
.ui-theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.ui-theme-card {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;

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

/* Preview colors depict each style's own light mode, not the current one. */
.ui-theme-preview {
  display: flex;
  aspect-ratio: 1.6;
  overflow: hidden;
  border: 1px solid #dfe1e5;
  border-radius: 4px;
  background: #ffffff;

  i {
    display: block;
    height: 6px;
    border-radius: 2px;
    background: #e2e4e8;
  }

  .preview-sidebar {
    position: relative;
    display: grid;
    align-content: start;
    gap: 8px;
    width: 28%;
    padding: 12px 6px;
  }

  .preview-main {
    display: grid;
    flex: 1;
    align-content: start;
    gap: 12px;
    padding: 12px 10px;

    i:first-child {
      width: 55%;
    }
  }

  &.preview-postmark {
    border-radius: 2px;

    i {
      border-radius: 1px;
    }

    .preview-sidebar {
      background: #16213A;

      i {
        background: rgba(255, 255, 255, 0.18);
      }

      i:first-child {
        background: #1D4ED8;
      }
    }

    .preview-main i:first-child {
      box-shadow: -4px 0 0 #D7263D;
    }
  }

  &.preview-workspace {
    border-radius: 6px;

    i {
      border-radius: 3px;
    }

    .preview-sidebar {
      background: #F4F6F8;

      i:first-child {
        background: #0E7C74;
      }
    }
  }

  &.preview-palette {
    border-radius: 8px;

    i {
      border-radius: 3px;
    }

    .preview-sidebar {
      background: #FFFFFF;
      border-right: 1px solid #EFEFF1;

      i:first-child {
        background: #18181B;
      }

      i:nth-child(2),
      i:nth-child(3) {
        display: flex;
        background: none;

        &::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
      }

      i:nth-child(2)::before {
        background: var(--avatar-2-text);
        box-shadow: 9px 0 0 var(--avatar-3-text);
      }

      i:nth-child(3)::before {
        background: var(--avatar-4-text);
      }
    }
  }
}

.ui-theme-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding-top: 4px;
  font-size: 14px;
  color: var(--el-text-color-primary);

  span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  input {
    flex-shrink: 0;
    margin: 0;
    accent-color: var(--el-color-primary);
    cursor: pointer;
  }
}
</style>
