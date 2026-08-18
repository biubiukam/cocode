/**
 * Render the loopback authorization callback page in the cocode.agency style.
 *
 * The page is served by a throwaway localhost listener into whatever browser
 * handled the authorization, so it must stand on its own with zero network
 * access: fonts fall back to the stacks cocode.agency already declares, and the
 * whale artwork is replaced by the warm-glow gradient the site itself uses on
 * status pages. Nothing here loads an external asset.
 */

export type CallbackPageKind = "done" | "unknown"

/**
 * cocode.agency stores its wordmark as ASCII art and draws it as vector blocks
 * rather than text, so the mark stays identical to the site without shipping an
 * asset or depending on a monospace font being installed.
 */
const WORDMARK_LINES = [
	" ▄█████ ▄████▄ ▄█████ ▄████▄ █████▄ ▄█████",
	" ██     ██  ██ ██     ██  ██ ██  ██ ██▄▄",
	" ██     ██  ██ ██     ██  ██ ██  ██ ██▀▀",
	" ▀█████ ▀████▀ ▀█████ ▀████▀ █████▀ ▀█████",
]

/** Cell metrics of the site's AsciiLogo, so the mark keeps its exact ratio. */
const CELL_WIDTH = 10
const ROW_HEIGHT = 16

function block(column: number, y: number, height: number): string {
	return `<rect x="${String(column * CELL_WIDTH)}" y="${String(y)}" width="${String(
		CELL_WIDTH,
	)}" height="${String(height)}"/>`
}

/** `█` fills a cell, `▄` its bottom half, `▀` its top half; anything else is blank. */
function renderWordmark(): string {
	const half = ROW_HEIGHT / 2
	const blocks = WORDMARK_LINES.flatMap((line, row) =>
		[...line].flatMap((glyph, column) => {
			const y = row * ROW_HEIGHT
			if (glyph === "█") return [block(column, y, ROW_HEIGHT)]
			if (glyph === "▄") return [block(column, y + half, half)]
			if (glyph === "▀") return [block(column, y, half)]
			return []
		}),
	)
	const width = Math.max(...WORDMARK_LINES.map((line) => [...line].length)) * CELL_WIDTH
	const height = WORDMARK_LINES.length * ROW_HEIGHT
	return `<svg class="wordmark" viewBox="0 0 ${String(width)} ${String(
		height,
	)}" role="img" aria-label="Cocode" focusable="false" shape-rendering="crispEdges"><g fill="currentColor">${blocks.join(
		"",
	)}</g></svg>`
}

const WORDMARK = renderWordmark()

/**
 * Kickers keep the site's `PRODUCT / DESCRIPTION` shape, where the uppercase
 * product segment stays English in both locales.
 */
const COPY = {
	zh: {
		lang: "zh-CN",
		done: {
			kicker: "COCODE DESKTOP / 登录",
			title: "登录完成",
			lead: "可以关掉这个标签页，回到 Cocode 继续。",
		},
		unknown: {
			kicker: "COCODE DESKTOP / 无此页面",
			title: "这里没有内容",
			lead: "这个地址只用于接收一次登录回调，现在已经失效。",
		},
	},
	en: {
		lang: "en",
		done: {
			kicker: "COCODE DESKTOP / SIGN IN",
			title: "You're signed in",
			lead: "Close this tab and pick up where you left off in Cocode.",
		},
		unknown: {
			kicker: "COCODE DESKTOP / NOT FOUND",
			title: "Nothing lives here",
			lead: "This address only receives a single sign-in callback, and it has expired.",
		},
	},
} as const

/**
 * Follow the browser's normal language negotiation rules. `Accept-Language`
 * is ordered by preference and may attach a q-weight to each range; do not
 * let a lower-priority Chinese fallback override a browser whose primary
 * language is English.
 */
export function pickLocale(
	acceptLanguage: string | readonly string[] | undefined,
): keyof typeof COPY {
	if (acceptLanguage === undefined) return "en"
	const header = typeof acceptLanguage === "string" ? acceptLanguage : acceptLanguage.join(",")
	const candidates = header
		.split(",")
		.map((part, index) => {
			const [range, ...parameters] = part.trim().split(";")
			const qParameter = parameters.find((parameter) => /^\s*q\s*=/i.test(parameter))
			const parsedWeight = qParameter === undefined ? 1 : Number(qParameter.split("=")[1])
			return {
				range: range.toLowerCase().split("-")[0],
				weight: Number.isFinite(parsedWeight) ? Math.max(0, Math.min(1, parsedWeight)) : 0,
				index,
			}
		})
		.filter((candidate) => candidate.weight > 0)
		.sort((left, right) => right.weight - left.weight || left.index - right.index)
	for (const candidate of candidates) {
		if (candidate.range === "zh") return "zh"
		if (candidate.range === "en") return "en"
	}
	return "en"
}

const STYLE = `
:root {
	color-scheme: dark;
	--ink: #0b1514;
	--surface-glass: rgb(25 31 27 / 78%);
	--flame: #d37b1f;
	--cream: #f4ecdf;
	--cream-dim: #b5b8ad;
	--cream-faint: #8f9489;
	--line: rgb(244 236 223 / 16%);
	--shadow-panel: 0 18px 48px rgb(0 0 0 / 28%);
	--font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
	--font-display: Georgia, "Times New Roman", serif;
	--font-code: ui-monospace, "SF Mono", Monaco, Consolas, "Liberation Mono", monospace;
}
* { box-sizing: border-box; }
body {
	display: grid;
	place-items: center;
	min-height: 100vh;
	min-height: 100dvh;
	margin: 0;
	padding: 32px 20px;
	background: var(--ink);
	color: var(--cream);
	font-family: var(--font-body);
	font-size: 16px;
	line-height: 1.5;
	-webkit-font-smoothing: antialiased;
}
body::before {
	content: "";
	position: fixed;
	z-index: 0;
	inset: 0 0 auto;
	height: clamp(480px, 58vw, 640px);
	background: radial-gradient(
		124% 88% at 12% -8%,
		rgb(211 123 31 / 15%) 0%,
		rgb(211 123 31 / 7%) 28%,
		rgb(211 123 31 / 2%) 46%,
		transparent 64%
	);
	pointer-events: none;
}
.panel {
	position: relative;
	z-index: 1;
	width: 100%;
	max-width: 460px;
	padding: 40px 36px 36px;
	border: 1px solid var(--line);
	border-radius: 8px;
	background: var(--surface-glass);
	box-shadow: var(--shadow-panel);
	backdrop-filter: blur(16px);
	animation: rise 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.wordmark {
	display: block;
	width: 152px;
	height: auto;
	margin: 0 0 30px;
	color: var(--cream);
}
.kicker {
	display: flex;
	align-items: center;
	gap: 10px;
	margin: 0 0 12px;
	color: var(--flame);
	font-family: var(--font-code);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}
.dot {
	flex: none;
	width: 6px;
	height: 6px;
	border-radius: 9999px;
	background: currentcolor;
	box-shadow: 0 0 0 4px rgb(211 123 31 / 20%);
}
h1 {
	margin: 0 0 12px;
	font-family: var(--font-display);
	font-size: clamp(1.7rem, 3vw, 2.1rem);
	font-weight: 700;
	letter-spacing: -0.04em;
	line-height: 1.15;
}
.lead {
	margin: 0;
	color: var(--cream-dim);
}
/* A dead address should not borrow the brand's success accent. */
[data-kind="unknown"] .kicker {
	color: var(--cream-faint);
}
[data-kind="unknown"] .dot {
	box-shadow: none;
}
@keyframes rise {
	from {
		opacity: 0;
		transform: translateY(8px);
	}
}
@media (prefers-reduced-motion: reduce) {
	.panel { animation: none; }
}
`

export function renderCallbackPage(
	kind: CallbackPageKind,
	acceptLanguage: string | undefined,
): string {
	const copy = COPY[pickLocale(acceptLanguage)]
	const text = copy[kind]
	return `<!doctype html>
<html lang="${copy.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${text.title} · Cocode</title>
<style>${STYLE}</style>
</head>
<body>
<main class="panel" data-kind="${kind}">
${WORDMARK}
<p class="kicker"><span class="dot" aria-hidden="true"></span>${text.kicker}</p>
<h1>${text.title}</h1>
<p class="lead">${text.lead}</p>
</main>
</body>
</html>
`
}
