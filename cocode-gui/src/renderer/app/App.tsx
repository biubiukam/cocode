import { Button } from "@/components/ui/button"

export function App(): JSX.Element {
	return (
		<main className="flex min-h-screen items-center justify-center p-6">
			<section className="w-full max-w-xl space-y-6 rounded-lg border bg-card p-8 shadow-sm">
				<div className="space-y-2">
					<p className="text-sm font-medium text-muted-foreground">Electron Renderer</p>
					<h1 className="text-3xl font-semibold tracking-tight">
						React + Tailwind + shadcn/ui
					</h1>
					<p className="text-muted-foreground">
						Renderer 基础设施已初始化，可以按业务限界上下文继续演进。
					</p>
				</div>
				<Button>开始构建</Button>
			</section>
		</main>
	)
}
