import { describe, it, expect } from 'vitest';
import { UI_THEMES, isUiTheme } from '../../src/lib/ui-theme.js';

describe('ui theme', () => {
	it('三个合法值', () => expect(UI_THEMES).toEqual(['postmark', 'workspace', 'palette']));
	it('合法值通过', () => UI_THEMES.forEach(v => expect(isUiTheme(v)).toBe(true)));
	it('非法值拒绝', () => ['', 'Workspace', 'dark', undefined, null, 1].forEach(v => expect(isUiTheme(v)).toBe(false)));
});
