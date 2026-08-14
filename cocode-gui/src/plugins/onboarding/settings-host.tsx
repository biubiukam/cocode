/**
 * Settings section host: the presentational card only takes an onReplay prop.
 */

import { useOnboarding } from '../../shell/runtime-context.tsx'
import { OnboardingSettings } from './ui/settings.tsx'

export function OnboardingSettingsHost() {
  const onboarding = useOnboarding()
  return <OnboardingSettings onReplay={() => { onboarding.replay() }} />
}
