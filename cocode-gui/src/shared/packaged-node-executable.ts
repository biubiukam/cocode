export function packagedNodeExecutableName(platform: string): string {
	return platform === "win32" ? "cocode-node.exe" : "cocode-node"
}
