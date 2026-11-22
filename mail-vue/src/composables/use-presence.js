import { onMounted, onUnmounted, ref, watch } from 'vue'
import { heartbeat } from '@/request/profile.js'
import { useUserStore } from '@/store/user.js'

// Presence heartbeat. One guarded write per minute per employee, paused while
// the tab is hidden so background tabs do not look active.
//
// Presence is not a startup dependency: the heartbeat must not fire before the
// identity is confirmed, otherwise an expired token produces a stream of
// authentication errors while the employee is still looking at the splash or
// the sign-in page.
//
// The heartbeat is a singleton with a reference count. App.vue and the header
// both ask for presence; without the count each would start its own interval
// and logout would stop only one of them.
const online = ref(false)
const lastSeenAt = ref(null)

let timer = null
let inFlight = false
let consumers = 0

function signedIn() {
    return Boolean(useUserStore().user?.permKeys)
}

async function ping() {
    if (inFlight || document.hidden) return
    if (!signedIn()) return
    inFlight = true
    try {
        const data = await heartbeat()
        lastSeenAt.value = data?.lastSeenAt || null
        online.value = true
    } catch {
        online.value = false
    } finally {
        inFlight = false
    }
}

function start() {
    if (timer) return
    ping()
    timer = setInterval(ping, 60000)
    document.addEventListener('visibilitychange', onVisible)
}

function stop() {
    if (timer) clearInterval(timer)
    timer = null
    document.removeEventListener('visibilitychange', onVisible)
    online.value = false
}

function onVisible() {
    if (!document.hidden) ping()
}

export function usePresence() {
    const userStore = useUserStore()
    let stopWatch = null

    onMounted(() => {
        consumers += 1
        // Late hydration: the identity is usually set during bootstrap, before
        // this mounts, but a timed-out bootstrap may set it afterwards.
        if (signedIn()) start()
        stopWatch = watch(signedIn, (isSignedIn) => {
            if (isSignedIn) start()
            else stop()
        })
    })

    onUnmounted(() => {
        if (stopWatch) stopWatch()
        consumers = Math.max(0, consumers - 1)
        // The last consumer leaving is the end of presence for this page.
        if (consumers === 0) stop()
    })

    return { online, lastSeenAt }
}

export default { usePresence }