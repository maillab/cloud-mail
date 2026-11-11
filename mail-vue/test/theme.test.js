import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUiTheme, UI_THEMES } from '../src/utils/theme.js';

test('三个合法值原样返回', () => UI_THEMES.forEach(v => assert.equal(normalizeUiTheme(v), v)));
test('非法值回退到 workspace', () => ['', 'dark', undefined, null, 'Postmark'].forEach(v => assert.equal(normalizeUiTheme(v), 'workspace')));
