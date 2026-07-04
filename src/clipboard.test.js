import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyText, shareMessage } from './clipboard.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('shareMessage', () => {
  it('embeds the code and a prefilled join link in the invite text', () => {
    vi.stubEnv('VITE_CLIENT_URL', 'https://play.rotcev.com')
    expect(shareMessage('4821')).toBe(
      'Join my QuipNotes game! Code: 4821\nhttps://play.rotcev.com/?code=4821'
    )
  })
})

describe('copyText', () => {
  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const ok = await copyText('hello')
    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when the clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {})
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    const ok = await copyText('hello')
    expect(ok).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })
})
