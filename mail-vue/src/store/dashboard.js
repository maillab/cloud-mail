import {defineStore} from 'pinia'
import {ref} from 'vue'
import {getPreferences, savePreferences, resetPreferences, markOnboarded} from '@/request/dashboard.js'

const SIZE_WIDTH = {sm: 4, md: 6, lg: 12}

function clone(list) {
    return (list || []).map(w => ({...w, config: {...(w.config || {})}}))
}

export const useDashboardStore = defineStore('dashboard', () => {
    const layout = ref([])      // currently applied (rendered)
    const saved = ref([])       // last persisted layout
    const draft = ref([])       // editing copy
    const density = ref('comfortable')
    const savedDensity = ref('comfortable')
    const catalog = ref([])
    const role = ref('')
    const onboarded = ref(false)
    const loading = ref(false)
    const saving = ref(false)
    const loaded = ref(false)

    async function load() {
        loading.value = true
        try {
            const r = await getPreferences()
            layout.value = clone(r.layout)
            saved.value = clone(r.layout)
            draft.value = clone(r.layout)
            density.value = r.density || 'comfortable'
            savedDensity.value = density.value
            catalog.value = r.catalog || []
            role.value = r.role || ''
            onboarded.value = !!r.onboarded
            loaded.value = true
        } finally {
            loading.value = false
        }
    }

    function startCustomize() {
        draft.value = clone(layout.value)
        savedDensity.value = density.value
    }

    function addWidget(id) {
        if (draft.value.some(w => w.id === id)) return
        const def = catalog.value.find(c => c.id === id)
        draft.value = [...draft.value, {
            id,
            x: 0,
            y: 0,
            w: def?.defaultW || 6,
            h: def?.defaultH || 3,
            config: {}
        }]
    }

    function removeWidget(id) {
        if (id === 'attention') return
        draft.value = draft.value.filter(w => w.id !== id)
    }

    function moveWidget(id, dir) {
        const i = draft.value.findIndex(w => w.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= draft.value.length) return
        const arr = [...draft.value]
        const [item] = arr.splice(i, 1)
        arr.splice(j, 0, item)
        draft.value = arr
    }

    function resizeWidget(id, size) {
        const w = SIZE_WIDTH[size] || 6
        draft.value = draft.value.map(x => x.id === id ? {...x, w} : x)
    }

    function setDraftDensity(d) {
        savedDensity.value = density.value
        density.value = d === 'compact' ? 'compact' : 'comfortable'
    }

    function preview() {
        layout.value = clone(draft.value)
    }

    function cancel() {
        draft.value = clone(saved.value)
        density.value = savedDensity.value
        layout.value = clone(saved.value)
    }

    async function save() {
        saving.value = true
        try {
            const r = await savePreferences({layout: draft.value, density: density.value})
            saved.value = clone(r.layout)
            layout.value = clone(r.layout)
            draft.value = clone(r.layout)
            density.value = r.density
            savedDensity.value = r.density
        } finally {
            saving.value = false
        }
    }

    async function restoreDefault() {
        const r = await resetPreferences()
        saved.value = clone(r.layout)
        layout.value = clone(r.layout)
        draft.value = clone(r.layout)
        density.value = r.density
        savedDensity.value = r.density
    }

    async function completeOnboarding() {
        await markOnboarded()
        onboarded.value = true
    }

    return {
        layout, saved, draft, density, catalog, role, onboarded,
        loading, saving, loaded,
        load, startCustomize, addWidget, removeWidget, moveWidget, resizeWidget,
        setDraftDensity, preview, cancel, save, restoreDefault, completeOnboarding
    }
})