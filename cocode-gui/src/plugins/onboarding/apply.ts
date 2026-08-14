import type { Context } from '@deepseek-ai/cordis'
import { OnboardingStore } from '../../runtime/onboarding/store.ts'
import { OnboardingHost } from './host.tsx'
import { OnboardingSettingsHost } from './settings-host.tsx'

export const name = 'onboarding'
export const inject = ['slots', 'account', 'providers', 'connection']

export function apply(ctx: Context) {
  const store = new OnboardingStore(
    () => ctx.root.get('connection')?.activeTransport,
    () => ctx.root.get('connection')?.state.get().baseUrl ?? '',
    ctx.get('account')!,
    ctx.get('providers')!,
  )
  ctx.reflect.provide('onboarding', store)
  ctx.on('connection/ready', () => { store.onConnectionReady() })
  ctx.on('connection/lost', () => { store.onConnectionLost() })

  ctx.slots.register({ name: 'shell.overlay', order: 20 }, OnboardingHost)
  ctx.slots.register({
    name: 'shell.palette',
    order: 80,
    inject: () => ({
      id: 'onboarding.replay',
      label: '再走一遍设置',
      group: '动作',
      icon: 'replay',
      run: () => { store.replay() },
    }),
  }, Empty)
  ctx.slots.register({
    name: 'settings.section',
    order: 50,
    inject: () => ({
      id: 'onboarding',
      group: '个人',
      label: '首次引导',
      description: '再走一遍模型来源设置。',
      icon: 'replay',
      onReplay: () => { store.replay() },
    }),
  }, OnboardingSettingsHost)
}

function Empty() {
  return null
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    onboarding: OnboardingStore
  }
}
