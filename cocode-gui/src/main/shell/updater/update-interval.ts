export function resolveUpdateIntervalMilliseconds(value: string): number {
	const match = value.match(/^(\d+)\s+(minute|minutes|hour|hours|day|days)$/i)
	if (!match) throw new Error(`Unsupported update interval: ${value}`)
	const amount = Number(match[1])
	if (amount <= 0) throw new Error(`Unsupported update interval: ${value}`)
	const unit = match[2].toLowerCase()
	const multiplier = unit.startsWith("minute")
		? 60_000
		: unit.startsWith("hour")
		? 3_600_000
		: 86_400_000
	return amount * multiplier
}
