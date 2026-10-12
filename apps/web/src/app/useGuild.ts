import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { documentVisibility } from '../adapters/visibility';
import { createGuildStore, type GuildStoreOptions } from './guildStore';
import { buildBoard, buildFetchStatus, buildKingBubble, buildParty, sceneCue } from './guildView';

/** Binds the guild store to a component's lifetime and exposes what the windows render. */
export function useGuild(options: GuildStoreOptions = {}) {
  const store = createGuildStore(options);
  const { state } = store;
  // The same signal stops the canvas (render/loop.ts): messages and scenes stop and go together.
  const syncHidden = () => {
    store.setHidden(documentVisibility.isHidden());
  };
  let unsubscribe: (() => void) | null = null;
  onMounted(() => {
    syncHidden();
    unsubscribe = documentVisibility.subscribe(syncHidden);
    store.start();
  });
  onBeforeUnmount(() => {
    unsubscribe?.();
    store.stop();
  });

  // Judged at the time of the latest fetch, so the view only changes when data does.
  const checkedAt = computed(() => state.checkedAt ?? 0);
  const board = computed(() => (state.snapshot === null ? [] : buildBoard(state.snapshot)));
  const party = computed(() =>
    state.snapshot === null ? [] : buildParty(state.snapshot, checkedAt.value),
  );
  const king = computed(() => buildKingBubble(state.snapshot));
  const fetchStatus = computed(() =>
    buildFetchStatus(state.snapshot, state.failure, checkedAt.value),
  );
  const message = computed(() => state.messages[0] ?? null);
  // The canvas starts a scene when its message reaches the window (in queue order; a message
  // waits until its scene's cast is free, so the scene starts with it).
  const cue = computed(() => sceneCue(message.value));
  // The president's latest order (Issue #28): the king calls on the canvas, with a sound.
  const summons = computed(() => state.summons);
  // Whether the canvas is on screen (narrow screens hide it); null until it first reports. The
  // king's call is not heard unseen.
  const stageShown = shallowRef<boolean | null>(null);

  return {
    state,
    board,
    party,
    king,
    fetchStatus,
    message,
    cue,
    summons,
    stageShown,
    nextMessage: () => {
      store.nextMessage();
    },
    setStageShown: (shown: boolean) => {
      stageShown.value = shown;
      store.setStageShown(shown);
    },
    clearBaseline: () => {
      store.clearBaseline();
    },
  };
}
