import { computed, onBeforeUnmount, onMounted } from 'vue';
import { createGuildStore, type GuildStoreOptions } from './guildStore';
import { buildBoard, buildFetchStatus, buildParty } from './guildView';

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
  const king = computed(() => party.value.find((row) => row.id === 'yukihiro') ?? null);
  const fetchStatus = computed(() =>
    buildFetchStatus(state.snapshot, state.failure, checkedAt.value),
  );
  const message = computed(() => state.messages[0] ?? null);

  return {
    state,
    board,
    party,
    king,
    fetchStatus,
    message,
    nextMessage: () => {
      store.nextMessage();
    },
    clearBaseline: () => {
      store.clearBaseline();
    },
  };
}
