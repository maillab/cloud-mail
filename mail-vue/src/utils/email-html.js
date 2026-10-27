import DOMPurify from 'dompurify'

export function sanitizeEmailHtml(html) {
    if (!html) return html
    return DOMPurify.sanitize(html, {
        WHOLE_DOCUMENT: true,
        ADD_ATTR: ['target'],
    })
}

export function sanitizeSignatureHtml(html) {
    if (!html) return ''
    return DOMPurify.sanitize(html)
}
