import { startRenderer } from "./app/bootstrap/start-renderer"
import { installRendererErrorObservers } from "./shared/logging/renderer-error-observers"
import { RendererLogger } from "./shared/logging/renderer-logger"
import "./styles/index.css"

const rendererLogger = new RendererLogger()
const disposeRendererErrorObservers = installRendererErrorObservers(rendererLogger)

const rootElement = document.getElementById("root")

if (!rootElement) {
	rendererLogger.error("renderer.root-missing")
	disposeRendererErrorObservers()
	throw new Error("Renderer root element was not found.")
}

void startRenderer(rootElement)
