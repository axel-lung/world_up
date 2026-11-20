import { describe, expect, it, vi } from 'vitest';
import type { PushState } from './push-device';
import { needsPushPrompt, type PromptMemory, pushPromptKey } from './push-prompt';

function memory(stored: string | null = null) {
  const store = { key: stored };
  const mem: PromptMemory = {
    asked: (key) => store.key === key,
    remember: (key) => {
      store.key = key;
    },
  };
  return { store, mem };
}

const stateOf = (value: PushState) => vi.fn(async () => value);

describe('the prompt to turn notifications on', () => {
  it('changes with each sign-in and each update of the app', () => {
    const key = pushPromptKey(1_700_000_000_000, '41');
    expect(pushPromptKey(1_700_000_000_000, '41')).toBe(key);
    expect(pushPromptKey(1_700_000_500_000, '41')).not.toBe(key);
    expect(pushPromptKey(1_700_000_000_000, '42')).not.toBe(key);
    // An app too old to give its build still asks after each sign-in
    expect(pushPromptKey(1_700_000_000_000, null)).not.toBe(pushPromptKey(1_700_000_500_000, null));
  });

  it('asks when the notifications are off on the phone, once per key', async () => {
    const { store, mem } = memory();
    const state = stateOf('off');
    expect(await needsPushPrompt('a', mem, state)).toBe(true);
    expect(store.key).toBe('a');
    expect(await needsPushPrompt('a', mem, state)).toBe(false);
    // Asked once only: the phone's state isn't read again
    expect(state).toHaveBeenCalledTimes(1);
    // A new sign-in or update asks again
    expect(await needsPushPrompt('b', mem, state)).toBe(true);
  });

  it("doesn't ask when they are on, or blocked in the phone's settings, and remembers it", async () => {
    for (const value of ['on', 'denied', 'unsupported'] as const) {
      const { store, mem } = memory();
      expect(await needsPushPrompt('a', mem, stateOf(value))).toBe(false);
      expect(store.key).toBe('a');
    }
  });

  it('tries again later when the state is unknown', async () => {
    const { store, mem } = memory('old');
    const failing = vi.fn(async (): Promise<PushState> => {
      throw new Error('offline');
    });
    expect(await needsPushPrompt('a', mem, failing)).toBe(false);
    expect(store.key).toBe('old');
    expect(await needsPushPrompt('a', mem, stateOf('off'))).toBe(true);
  });
});
