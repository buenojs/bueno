// Ported from WPT
const { test } = Bueno.testing;

// https://github.com/web-platform-tests/wpt/blob/master/url/url-tojson.any.js
test((ctx) => {
	const a = new URL("https://example.com/");
	ctx.equals(JSON.stringify(a), '"https://example.com/"');
});

// https://github.com/web-platform-tests/wpt/blob/master/url/url-statics-canparse.any.js
[
	{
		url: undefined,
		base: undefined,
		expected: false,
	},
	{
		url: "a:b",
		base: undefined,
		expected: true,
	},
	{
		url: undefined,
		base: "a:b",
		expected: false,
	},
	{
		url: "a:/b",
		base: undefined,
		expected: true,
	},
	{
		url: undefined,
		base: "a:/b",
		expected: true,
	},
	{
		url: "https://test:test",
		base: undefined,
		expected: false,
	},
	{
		url: "a",
		base: "https://b/",
		expected: true,
	},
].forEach(({ url, base, expected }) => {
	test((ctx) => {
		ctx.equals(URL.canParse(url, base), expected);
	}, `URL.canParse(${url}, ${base})`);
});
