import { computed, onBeforeUnmount, onMounted } from 'vue';
import { createGuildStore, type GuildStoreOptions } from './guildStore';
import { buildBoard, buildFetchStatus, buildKingBubble, buildParty, sceneCue } from './guildView';

/** Binds the guild store to a component's lifetime and exposes what the windows render. */
export function useGuild(options: GuildStoreOptions = {}) {
  const store = createGuildStore(options);
  const { state } = store;
  onMounted(() => {
    store.start();
  });
  onBeforeUnmount(() => {
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
  // The canvas starts a scene when its message reaches the window (8 s apart, in queue order).
  const cue = computed(() => sceneCue(message.value));

  return {
    state,
    board,
    party,
    king,
    fetchStatus,
    message,
    cue,
    nextMessage: () => {
      store.nextMessage();
    },
    clearBaseline: () => {
      store.clearBaseline();
    },
  };
}
