import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Lets the global Quick Create menu open a module's creation form by navigating
// with ?create=<type>. The view calls this with its own open-dialog function.
export function useCreateIntent(open) {
	const route = useRoute()
	const router = useRouter()

	const run = () => {
		if (!route.query.create) return
		try {
			open(route.query)
		} catch (e) {
			// A missing form should not break the page.
		}
		const query = { ...route.query }
		delete query.create
		router.replace({ query })
	}

	onMounted(run)
	watch(() => route.query.create, value => { if (value) run() })
}