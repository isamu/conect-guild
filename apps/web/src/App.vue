<script setup lang="ts">
// The concept art (repository file, bundled by Vite) is the M1 background; M2 replaces it with Canvas.
import conceptArt from '../../../assets/concept/rpg-company-ui.png';
import { useGuild } from './app/useGuild';
import FetchStatus from './ui/FetchStatus.vue';
import KingBubble from './ui/KingBubble.vue';
import MessageWindow from './ui/MessageWindow.vue';
import PartyStatus from './ui/PartyStatus.vue';
import QuestBoard from './ui/QuestBoard.vue';

const { state, board, party, king, fetchStatus, message, nextMessage, clearBaseline } = useGuild();
</script>

<template>
  <main class="guild">
    <div class="stage" :class="{ 'stage--halted': state.halted }">
      <img class="stage__art" :src="conceptArt" alt="ギルドの社屋" />
      <section v-if="state.halted" class="rpg-window stage__halt" role="alert">
        <h2 class="rpg-window__title">収集スクリプトを更新してください</h2>
        <p>snapshot.json の形（schemaVersion）が画面の想定と違うため、表示を止めています。</p>
      </section>
      <template v-else>
        <QuestBoard class="stage__board" :groups="board" :loaded="state.snapshot !== null" />
        <KingBubble
          class="stage__king"
          :waiting="king?.state === 'awaiting-president'"
          :detail="king?.stateLabel ?? null"
        />
        <MessageWindow
          class="stage__message"
          :message="message"
          :remaining="Math.max(state.messages.length - 1, 0)"
          @next="nextMessage"
        />
      </template>
      <div class="stage__side">
        <PartyStatus v-if="!state.halted" class="stage__party" :rows="party" />
        <FetchStatus
          :status="fetchStatus"
          :effects-available="state.effectsAvailable"
          :baseline-notice="state.baselineNotice"
          @clear-baseline="clearBaseline"
        />
      </div>
    </div>
  </main>
</template>

<style scoped>
.guild {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
}

/*
 * The windows sit where the concept art paints its mock windows (1672 x 940 px), so they cover
 * the painted text. Sizes follow the stage width through container query units.
 */
.stage {
  position: relative;
  width: min(100%, 1672px, calc(100vh * 1672 / 940));
  min-width: 320px;
  container-type: inline-size;
  font-size: clamp(9px, 1.15cqw, 19px);
}

.stage__art {
  display: block;
  width: 100%;
  height: auto;
  image-rendering: pixelated;
  user-select: none;
}

/* Halted: the painted mock windows must not pass for real data. */
.stage--halted .stage__art {
  filter: blur(4px) brightness(0.35);
}

.stage__board,
.stage__side,
.stage__message,
.stage__king,
.stage__halt {
  position: absolute;
}

.stage__board {
  left: 1.2%;
  top: 1.6%;
  width: 29%;
  /* Heights in cqw (stage width) because the stage height is 940/1672 of it. */
  min-height: 17.7cqw;
  max-height: 34cqw;
}

/* Party and fetch status share the right column so they never overlap. */
.stage__side {
  right: 1.1%;
  top: 1.6%;
  width: 24.6%;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}

.stage__party {
  min-height: 21.1cqw;
}

.stage__king {
  left: 51.5%;
  top: 3%;
  width: 9.6%;
  height: 7%;
}

.stage__message {
  left: 9.8%;
  bottom: 1.9%;
  width: 80.4%;
  height: 17.4%;
}

.stage__halt {
  left: 25%;
  top: 35%;
  width: 50%;
  font-size: 1.2em;
}

/*
 * Narrow screens: stack the windows. The art is hidden because its painted mock windows (fake
 * quests and messages) would no longer be covered; the king's row still shows 承認まち.
 */
@container (max-width: 760px) {
  .stage__art,
  .stage__king {
    display: none;
  }

  .stage__board,
  .stage__side,
  .stage__message,
  .stage__halt {
    position: static;
    width: auto;
    min-height: 0;
    max-height: none;
    height: auto;
    margin: 0.6em;
    font-size: 14px;
  }
}

@media (max-width: 760px) {
  .stage {
    width: 100%;
  }
}
</style>
