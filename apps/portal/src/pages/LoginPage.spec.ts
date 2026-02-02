import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage.vue'
import { authLookup, authStart } from '../lib/api'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../lib/api', () => {
  const lookup = vi.fn()
  const start = vi.fn()
  const verify = vi.fn()
  const loginWithPassword = vi.fn()
  const onboard = vi.fn()
  const setPassword = vi.fn()

  return {
    __esModule: true,
    authLookup: lookup,
    authStart: start,
    authVerify: verify,
    authLoginWithPassword: loginWithPassword,
    authOnboard: onboard,
    authSetPassword: setPassword,
  }
})

vi.mock('../lib/auth', () => ({
  setUserAccessToken: vi.fn(),
}))

vi.mock('../lib/provision', () => ({
  writeProvisionFilter: vi.fn(),
}))

vi.mock('../lib/productVersion', () => ({
  writeProductVersionFilter: vi.fn(),
}))

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the staged busy label while lookup is running and clears after it resolves', async () => {
    const deferred = createDeferred<{
      isLiveCustomer: boolean
      auth: { hasPassword: boolean }
      hubspot: { properties: Record<string, unknown> }
      warning: string | null
    }>()

    vi.mocked(authLookup).mockReturnValue(deferred.promise as never)
    vi.mocked(authStart).mockResolvedValue({})

    const wrapper = mount(LoginPage)

    await wrapper.find('input#email').setValue('slow@example.com')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Checking your email…')

    deferred.resolve({
      isLiveCustomer: false,
      auth: { hasPassword: false },
      hubspot: { properties: {} },
      warning: 'slow hubspot disabled',
    })

    await flushPromises()

    expect(wrapper.text()).not.toContain('Checking your email…')
  })

  it('routes to password step for live customers without sending a code', async () => {
    vi.mocked(authLookup).mockResolvedValue({
      isLiveCustomer: true,
      auth: { hasPassword: true },
      hubspot: { properties: {} },
      warning: null,
    })
    const startSpy = vi.mocked(authStart)
    startSpy.mockResolvedValue({})

    const wrapper = mount(LoginPage)

    await wrapper.find('input#email').setValue('user@example.com')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.find('input#password').exists()).toBe(true)
    expect(wrapper.text()).toContain('Welcome back')
    expect(startSpy).not.toHaveBeenCalled()
  })
})
