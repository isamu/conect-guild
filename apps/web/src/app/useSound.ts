import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue';
import { createKeyValueStore } from '../adapters/storage';
import { documentVisibility } from '../adapters/visibility';
import { createSoundController } from '../audio/controller';
import type { PartyMember } from '../audio/judge';
import { createTonePlayer } from '../audio/player';
import type { GuildMessage } from './messageQueue';

export interface SoundSources {
  /** The head of the message queue (useGuild). */
  readonly message: Readonly<Ref<GuildMessage | null>>;
  readonly party: Readonly<Ref<readonly PartyMember[]>>;
  readonly halted: () => boolean;
}

/** Events that count as the viewer acting, which lets the browser start audio. */
const UNLOCK_EVENTS = ['pointerdown', 'keydown'] as const;

/** Binds the sound effects to what the guild screen shows, for a component's lifetime. */
export function useSound(sources: SoundSources) {
  const controller = createSoundController({
    player: createTonePlayer(),
    storage: createKeyValueStore(),
  });
  const settings = shallowRef(controller.settings());
  const syncHidden = () => {
    controller.setHidden(documentVisibility.isHidden());
  };
  const unlock = () => {
    controller.unlock();
  };
  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    syncHidden();
    unsubscribe = documentVisibility.subscribe(syncHidden);
    for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, { capture: true });
  });
  onBeforeUnmount(() => {
    unsubscribe?.();
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlock, { capture: true });
  });

  // Registered first, so a halt and a message of the same fetch see the halt first.
  watch(
    sources.halted,
    (halted) => {
      controller.setHalted(halted);
    },
    { immediate: true },
  );
  // Once per message: the id changes when a new message reaches the window.
  watch(
    () => sources.message.value?.id,
    () => {
      const message = sources.message.value;
      if (message !== null) controller.messageShown(message);
    },
  );
  watch(
    sources.party,
    (rows) => {
      controller.partyChanged(rows);
    },
    { immediate: true },
  );

  return {
    settings,
    toggleSound: () => {
      controller.toggle();
      settings.value = controller.settings();
    },
    cycleVolume: () => {
      controller.cycleVolume();
      settings.value = controller.settings();
    },
  };
}
