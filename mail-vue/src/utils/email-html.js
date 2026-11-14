import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName !== 'A' || node.getAttribute('target')?.toLowerCase() !== '_blank') return
    const rel = new Set((node.getAttribute('rel') || '').split(/\s+/).filter(Boolean))
    rel.add('noopener')
    rel.add('noreferrer')
    node.setAttribute('rel', [...rel].join(' '))
})

export function sanitizeEmailHtml(html) {
    if (!html) return html
    return DOMPurify.sanitize(html, {
        WHOLE_DOCUMENT: true,
        ADD_ATTR: ['target'],
    })
}
