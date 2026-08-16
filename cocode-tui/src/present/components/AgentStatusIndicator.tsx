import { Text } from 'ink'
import { useEffect, useState } from 'react'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { agentAnimation, agentColor } from './agent-status.ts'

export function AgentStatusIndicator(props: { agent: TuiSnapshot['agent'] }) {
  const animation = agentAnimation(props.agent)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    setFrame(0)
    if (animation.frames.length < 2) return
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % animation.frames.length)
    }, animation.interval)
    return () => clearInterval(timer)
  }, [animation])

  return <Text color={agentColor(props.agent)}>{animation.frames[frame] ?? animation.frames[0]}</Text>
}
