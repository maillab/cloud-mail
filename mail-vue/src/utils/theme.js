export const UI_THEMES = ['postmark', 'workspace', 'palette'];

const DEFAULT_UI_THEME = 'workspace';

export function normalizeUiTheme(value) {
    return UI_THEMES.includes(value) ? value : DEFAULT_UI_THEME;
}

export function updateThemeColorMeta() {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--theme-color-meta').trim();
    if (!color) return;
    document.getElementById('theme-color-meta')?.setAttribute('content', color);
}

export function applyUiTheme(value) {
    const theme = normalizeUiTheme(value);
    if (typeof document === 'undefined') return theme;
    document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem('ui-theme', theme);
    } catch (e) {
        console.error(e);
    }
    updateThemeColorMeta();
    return theme;
}
