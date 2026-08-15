import { startRenderer } from "./app/bootstrap/start-renderer"
import "./styles/index.css"

const rootElement = document.getElementById("root")

if (!rootElement) {
	throw new Error("Renderer root element was not found.")
}

void startRenderer(rootElement)
