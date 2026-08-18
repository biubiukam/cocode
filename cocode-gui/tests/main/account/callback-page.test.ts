import assert from "node:assert/strict"
import test from "node:test"
import {
	pickLocale,
	renderCallbackPage,
} from "../../../src/main/contexts/account/infrastructure/callback-page"

test("negotiates the callback page language from Accept-Language priority", () => {
	assert.equal(pickLocale("en-US,en;q=0.9,zh-CN;q=0.1"), "en")
	assert.equal(pickLocale("zh-CN,zh;q=0.9,en;q=0.8"), "zh")
	assert.equal(pickLocale("fr-FR,ja;q=0.8"), "en")
	assert.equal(pickLocale(undefined), "en")
})

test("renders the negotiated language on the standalone callback page", () => {
	const english = renderCallbackPage("done", "en-US,en;q=0.9,zh;q=0.1")
	assert.match(english, /<html lang="en">/)
	assert.match(english, /You're signed in/)
	assert.doesNotMatch(english, /登录完成/)

	const chinese = renderCallbackPage("done", "zh-CN,zh;q=0.9,en;q=0.8")
	assert.match(chinese, /<html lang="zh-CN">/)
	assert.match(chinese, /登录完成/)
})
