import { pathToFileURL } from "node:url"

const [entry, ...args] = process.argv.slice(2)
if (!entry) throw new Error("Missing DSH runtime entry.")

if (!process.execArgv.includes("--expose-internals")) {
	process.execArgv.push("--expose-internals")
}

process.argv = [process.argv[0], entry, ...args]
await import(pathToFileURL(entry).href)
