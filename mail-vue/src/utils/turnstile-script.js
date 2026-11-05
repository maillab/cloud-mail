const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let reloadPromise = null

export function reloadTurnstileScript() {
  if (reloadPromise) return reloadPromise

  reloadPromise = new Promise((resolve, reject) => {
    document
      .querySelectorAll('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]')
      .forEach(script => script.remove())

    // The SDK checks property existence, even when its value is undefined.
    delete window.turnstile

    const script = document.createElement('script')
    const timeout = setTimeout(() => {
      script.remove()
      reject(new Error('Turnstile script reload timed out'))
    }, 15000)

    script.src = `${SCRIPT_URL}&retry=${Date.now()}`
    script.async = true
    script.defer = true
    script.onload = () => {
      clearTimeout(timeout)
      if (window.turnstile?.render) {
        resolve(window.turnstile)
        return
      }
      script.remove()
      reject(new Error('Turnstile API is unavailable after reload'))
    }
    script.onerror = () => {
      clearTimeout(timeout)
      script.remove()
      reject(new Error('Turnstile script reload failed'))
    }
    document.head.appendChild(script)
  }).finally(() => {
    reloadPromise = null
  })

  return reloadPromise
}
