// LinkeDOM's published declarations depend on browser DOM globals. Workers use
// its parser only; this surface describes the methods used by mail processing.
declare module 'linkedom' {
	export interface HtmlElement {
		innerText: string;
		innerHTML: string;
		outerHTML: string;
		remove(): void;
		getAttribute(name: string): string | null;
		hasAttribute(name: string): boolean;
		setAttribute(name: string, value: string): void;
	}
	export interface HtmlDocument {
		body: HtmlElement;
		querySelectorAll(selector: string): HtmlElement[];
		getElementById(id: string): HtmlElement | null;
		toString(): string;
	}
	export function parseHTML(html: string): { document: HtmlDocument };
}
