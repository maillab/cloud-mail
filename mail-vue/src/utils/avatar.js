// 发件人首字母头像：按名字稳定地取一个配色序号，避免每次渲染变色
const TONE_COUNT = 6

export function avatarTone(text) {
  const source = String(text || '')
  let hash = 0
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % TONE_COUNT
}

export function avatarInitial(text) {
  const source = String(text || '').trim()
  if (!source) return '?'
  const first = source[0]
  return /[a-z]/i.test(first) ? first.toUpperCase() : first
}
