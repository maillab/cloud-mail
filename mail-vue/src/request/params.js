/**
 * Normalize values before they cross the Web -> Worker API boundary.
 *
 * The Worker intentionally validates page numbers/sizes strictly. UI state can
 * temporarily contain zero, strings, NaN, or stale localStorage values, so all
 * paginated request functions normalize those values here rather than relying
 * on every view to do it perfectly.
 */
export function normalizeInteger(value, {
    defaultValue,
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
} = {}) {
    const number = Number(value)
    if (!Number.isSafeInteger(number) || number < min || number > max) {
        return defaultValue
    }
    return number
}

export function normalizePageNumber(value, max = 1_000_000) {
    return normalizeInteger(value, {defaultValue: 1, min: 1, max})
}

export function normalizePageSize(value, max, defaultValue = 20) {
    return normalizeInteger(value, {defaultValue, min: 1, max})
}

export function normalizePagination(params = {}, {sizeMax = 50, defaultSize = 20} = {}) {
    return {
        ...params,
        num: normalizePageNumber(params.num),
        size: normalizePageSize(params.size, sizeMax, defaultSize),
    }
}
