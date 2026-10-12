import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue';
import { createKeyValueStore } from '../adapters/storage';
import { documentVisibility } from '../adapters/visibility';
import { createSoundController } from '../audio/controller';
import type { PartyMember } from '../audio/judge';
import { createTonePlayer } from '../audio/player';
import type { Summons } from './guildStore';
import type { GuildMessage } from './messageQueue';

export interface SoundSources {
  /** The head of the message queue (useGuild). */
  readonly message: Readonly<Ref<GuildMessage | null>>;
  readonly party: Readonly<Ref<readonly PartyMember[]>>;
  /** The president's latest order (useGuild): the king's call rings once per order. */
  readonly summons: Readonly<Ref<Summons | null>>;
  /** Whether the canvas is on screen; the king's call rings only with its scene. */
  readonly stageShown: Readonly<Ref<boolean>>;
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

  // One watcher for the halt, the party, the message and the summons: a fetch that changes several of them is
  // handed over whole, so the controller judges them in its own order, not the watchers'.
  watch(
    () => ({
      halted: sources.halted(),
      party: sources.party.value,
      message: sources.message.value,
      summons: sources.summons.value,
      stageShown: sources.stageShown.value,
    }),
    (screen) => {
      controller.screenChanged(screen);
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
