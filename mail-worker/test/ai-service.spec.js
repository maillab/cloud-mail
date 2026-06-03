import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import aiService, {
	TRANSLATION_SEPARATOR,
	collectTextNodes,
	estimateLanguage,
	parseBatchTranslationResult
} from '../src/service/ai-service';

function splitBatch(input) {
	return input.split(`\n\n${TRANSLATION_SEPARATOR}\n\n`);
}

function createMockContext(translate) {
	const calls = [];
	return {
		c: {
			env: {
				ai_model: '@test/model',
				ai: {
					async run(model, payload) {
						calls.push({ model, payload });
						const input = payload.messages.at(-1).content;
						const result = translate(input);
						return result && typeof result === 'object' ? result : { response: result };
					}
				}
			}
		},
		calls
	};
}

function zhTranslate(input) {
	const dict = new Map([
		['Welcome to our newsletter!', '欢迎订阅我们的新闻邮件！'],
		['Hello', '你好'],
		['Turbo0', 'Turbo0'],
		['team', '团队'],
		['Thanks for joining us today.', '感谢你今天加入我们。']
	]);

	const translateOne = text => dict.get(text.trim()) || `译文：${text.trim()}`;
	if (input.includes(TRANSLATION_SEPARATOR)) {
		return splitBatch(input).map(translateOne).join(`\n\n${TRANSLATION_SEPARATOR}\n\n`);
	}
	return translateOne(input);
}

describe('email translation helpers', () => {
	it('detects Chinese and English locally without AI', () => {
		expect(estimateLanguage('Welcome to our newsletter! We are thrilled to have you join us.')).toBe('en');
		expect(estimateLanguage('欢迎加入我们的社区，我们很高兴你今天来到这里。')).toBe('zh');
	});

	it('parses only standalone batch separators', () => {
		const text = `译文 A mentions ${TRANSLATION_SEPARATOR} inline.\n\n${TRANSLATION_SEPARATOR}\n\n译文 B`;
		expect(parseBatchTranslationResult(text, 2)).toEqual([
			`译文 A mentions ${TRANSLATION_SEPARATOR} inline.`,
			'译文 B'
		]);
		expect(parseBatchTranslationResult('译文 A\n译文 B', 2)).toBeNull();
	});

	it('collects visible HTML text nodes and skips non-translatable nodes', () => {
		const { document } = parseHTML(`
			<!DOCTYPE html>
			<html>
				<body>
					<div>
						Hello
						<script>Should not translate</script>
						<p hidden>Hidden text</p>
						<p aria-hidden="true">Aria hidden text</p>
						<p style="display:none">Invisible text</p>
						<p>Visible <code>code</code><img alt="image text"></p>
					</div>
				</body>
			</html>
		`);
		const { nodes, truncated } = collectTextNodes(document.body);

		expect(truncated).toBe(false);
		expect(nodes.map(item => item.text)).toEqual(['Hello', 'Visible']);
	});

	it('translates HTML by replacing only visible text nodes', async () => {
		const { c } = createMockContext(zhTranslate);
		const result = await aiService.translateHtmlEmail(
			c,
			'Welcome to our newsletter!',
			'<div><p>Hello <a href="https://example.com">Turbo0</a> team</p><script>Welcome to our newsletter!</script><img src="logo.png"></div>',
			'zh'
		);

		expect(result.subject).toBe('欢迎订阅我们的新闻邮件！');
		expect(result.content).toContain('href="https://example.com"');
		expect(result.content).toContain('src="logo.png"');
		expect(result.content).toContain('<script>Welcome to our newsletter!</script>');
		expect(result.content).toContain('你好');
		expect(result.content).toContain('Turbo0');
		expect(result.content).toContain('团队');
		expect(result.text).toContain('你好');
	});

	it('rejects unchanged plain-text translations instead of caching original text', async () => {
		const { c } = createMockContext(input => input);

		await expect(
			aiService.translatePlainEmail(c, 'Welcome', 'Thanks for joining us today.', 'zh')
		).rejects.toThrow('纯文本翻译结果不可用');
	});

	it('keeps the original segment when AI returns an empty fragment', async () => {
		const { c } = createMockContext(() => '');

		await expect(aiService.translateText(c, 'Turbo0', 'zh')).resolves.toBe('Turbo0');
	});

	it('reads translated text from Cloudflare chat choices content', async () => {
		const { c } = createMockContext(() => ({
			choices: [
				{
					message: {
						content: '查看最新文章'
					}
				}
			]
		}));

		await expect(aiService.translateText(c, 'View Latest Posts', 'zh')).resolves.toBe('查看最新文章');
	});

	it('uses enough output tokens for short reasoning-prone translations', async () => {
		const { c, calls } = createMockContext(() => '查看最新文章');

		await aiService.translateText(c, 'View Latest Posts', 'zh');

		expect(calls[0].payload.max_tokens).toBeGreaterThanOrEqual(1024);
	});

	it('translates small batches individually instead of using separator batch', async () => {
		const dict = new Map([
			['First item', '第一项'],
			['Second item', '第二项']
		]);
		const { c, calls } = createMockContext(input => dict.get(input));

		await expect(aiService.translateTextBatch(c, ['First item', 'Second item'], 'zh')).resolves.toEqual([
			'第一项',
			'第二项'
		]);
		expect(calls).toHaveLength(2);
		expect(calls.every(call => !call.payload.messages.at(-1).content.includes(TRANSLATION_SEPARATOR))).toBe(true);
	});

	it('does not count URLs as English translated body text', () => {
		expect(aiService.isTranslationUsable(
			{ subject: '通知', text: '请访问 https://turbo0.com 查看详情' },
			{ subject: 'Notice', text: '请访问 https://turbo0.com 查看详情' },
			'en'
		)).toBe(false);
	});
});
