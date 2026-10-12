import { effectScope, nextTick, ref, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issue, T0 } from '../domain/fixtures.test-util';
import type { GuildEvent } from '../domain/events';
import { MEMBERS, type MemberId } from '../guild.config';
import type { PartyRow } from './guildView';
import type { GuildMessage } from './messageQueue';
import { NARRATION_INTERVAL_MS } from './narrator';
import { globalScheduler } from './scheduler';
import { bindNarration } from './useNarration';

const IDS: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'];

function rows(): PartyRow[] {
  return IDS.map((id) => ({
    id,
    name: MEMBERS[id].name,
    role: MEMBERS[id].role,
    color: MEMBERS[id].color,
    state: 'working',
    stateLabel: '作業中',
    tooltip: null,
    rewards: null,
  }));
}

const snapshot = { issues: [issue(1, { title: 'ひみつの題名' })], prs: [] };
const closed: GuildEvent = {
  id: 'issue-closed#1',
  kind: 'issue-closed',
  number: 1,
  department: null,
};

function setup() {
  const message = shallowRef<GuildMessage | null>(null);
  const party = ref<PartyRow[]>([]);
  const loaded = ref(false);
  const nextMessage = vi.fn();
  let n = 0;
  const scope = effectScope();
  const binding = scope.run(() =>
    bindNarration(
      { message, party, snapshot: () => (loaded.value ? snapshot : null), nextMessage },
      {
        scheduler: globalScheduler,
        // Walks through the lines, so every draw differs.
        random: () => (n++ * 0.37) % 1,
        now: () => Date.parse(T0),
        hour: () => 12,
      },
    ),
  );
  if (binding === undefined) throw new Error('no binding');
  binding.start();
  const load = async () => {
    loaded.value = true;
    party.value = rows();
    await nextTick();
  };
  return { message, binding, load, nextMessage, scope };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bindNarration', () => {
  it('tells nothing before the first snapshot, then a line at once', async () => {
    const { binding, load, scope } = setup();
    expect(binding.narration.value).toBeNull();
    await load();
    expect(binding.narration.value?.text).toBeTruthy();
    binding.stop();
    scope.stop();
  });

  it('changes the line every interval, never the same twice in a row', async () => {
    const { binding, load, scope } = setup();
    await load();
    const seen = [binding.narration.value?.text];
    for (let i = 0; i < 6; i += 1) {
      await vi.advanceTimersByTimeAsync(NARRATION_INTERVAL_MS);
      seen.push(binding.narration.value?.text);
    }
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(seen.join('\n')).not.toContain('ひみつの題名');
    binding.stop();
    scope.stop();
  });

  it('▼ goes to the next narration while no event message is shown', async () => {
    const { binding, load, nextMessage, scope } = setup();
    await load();
    const before = binding.narration.value;
    binding.next();
    expect(binding.narration.value?.id).not.toBe(before?.id);
    expect(nextMessage).not.toHaveBeenCalled();
    binding.stop();
    scope.stop();
  });

  it('▼ goes to the event queue while an event message is shown, and back after it', async () => {
    const { binding, load, message, nextMessage, scope } = setup();
    await load();
    message.value = { id: 1, text: 'event', event: closed };
    await nextTick();
    const during = binding.narration.value?.id;
    binding.next();
    expect(nextMessage).toHaveBeenCalledTimes(1);
    expect(binding.narration.value?.id).toBe(during);
    // The queue is empty again: a fresh line at once.
    message.value = null;
    await nextTick();
    expect(binding.narration.value?.id).not.toBe(during);
    binding.stop();
    scope.stop();
  });

  it('tells nothing after stop()', async () => {
    const { binding, load, scope } = setup();
    await load();
    const last = binding.narration.value?.id;
    binding.stop();
    await vi.advanceTimersByTimeAsync(NARRATION_INTERVAL_MS * 3);
    expect(binding.narration.value?.id).toBe(last);
    scope.stop();
  });
});
