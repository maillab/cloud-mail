import { ref } from 'vue'
import { directoryList } from '@/request/profile.js'

// Shared source of assignable team members for ownership pickers.
// Options carry the display name plus @handle so a picker never shows a raw id.
export function useTeamMembers() {
	const members = ref([])
	const loading = ref(false)

	async function loadMembers() {
		loading.value = true
		try {
			const resp = await directoryList({ pageSize: 200 })
			members.value = (resp.list || []).map((m) => ({
				userId: m.userId,
				label: m.username ? `${m.displayName || m.email} (@${m.username})` : (m.displayName || m.email),
				displayName: m.displayName || m.email,
				username: m.username,
				avatarUrl: m.avatarUrl,
				jobTitle: m.jobTitle,
				isOnline: m.isOnline
			}))
		} catch {
			members.value = []
		} finally {
			loading.value = false
		}
	}

	return { members, loading, loadMembers }
}