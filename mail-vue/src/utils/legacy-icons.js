import { defineComponent, h } from 'vue'
import { Icon } from '@iconify/vue'

// Element Plus buttons accept a *component* in their `icon` prop. This code
// base passes the legacy string names instead (`icon="plus"`), and
// `@element-plus/icons-vue` is not installed, so every one of those buttons
// resolved to nothing and left an empty icon slot beside its label.
//
// Registering one tiny component per legacy name fixes all of them at once,
// without editing dozens of views, and renders the same icon family as the
// rest of the shell.
export const legacyIconMap = {
    plus: 'fluent:add-20-regular',
    refresh: 'fluent:arrow-clockwise-20-regular',
    delete: 'fluent:delete-20-regular',
    edit: 'fluent:edit-20-regular',
    'arrow-left': 'fluent:arrow-left-20-regular',
    'arrow-right': 'fluent:arrow-right-20-regular',
    upload: 'fluent:arrow-upload-20-regular',
    'folder-add': 'fluent:folder-add-20-regular',
    folder: 'fluent:folder-20-regular',
}

const made = new Map()

function componentFor(name, icon) {
    if (made.has(name)) return made.get(name)
    const component = defineComponent({
        name: `LegacyIcon_${name.replace(/-/g, '_')}`,
        inheritAttrs: false,
        setup() {
            return () => h(Icon, { icon, 'aria-hidden': 'true' })
        },
    })
    made.set(name, component)
    return component
}

export function installLegacyIcons(app) {
    for (const [name, icon] of Object.entries(legacyIconMap)) {
        app.component(name, componentFor(name, icon))
    }
}