<script setup lang="ts">
import { useGuild } from './app/useGuild';
import { useNarration } from './app/useNarration';
import { useSound } from './app/useSound';
import FetchStatus from './ui/FetchStatus.vue';
import GuildCanvas from './ui/GuildCanvas.vue';
import KingBubble from './ui/KingBubble.vue';
import MessageWindow from './ui/MessageWindow.vue';
import PartyStatus from './ui/PartyStatus.vue';
import QuestBoard from './ui/QuestBoard.vue';
import SoundControl from './ui/SoundControl.vue';

const {
  state,
  board,
  party,
  king,
  fetchStatus,
  message,
  cue,
  summons,
  nextMessage,
  clearBaseline,
  setStageShown,
} = useGuild();
const {
  settings: soundSettings,
  toggleSound,
  cycleVolume,
} = useSound({ message, party, summons, halted: () => state.halted });
const { narration, next, idleSeeds, setIdleSince } = useNarration({
  message,
  party,
  snapshot: () => state.snapshot,
  nextMessage,
  halted: () => state.halted,
});
</script>

<template>
  <main class="guild">
    <div class="stage" :class="{ 'stage--halted': state.halted }">
      <GuildCanvas
        class="stage__art"
        :party="party"
        :cue="cue"
        :idle-seeds="idleSeeds"
        :summons="summons"
        @stage-shown="setStageShown"
        @idle-since="setIdleSince"
      />
      <section v-if="state.halted" class="rpg-window stage__halt" role="alert">
        <template v-if="state.haltReason === 'repo-mismatch'">
          <h2 class="rpg-window__title">収集の対象と設定が違います</h2>
          <p>
            snapshot.json のリポジトリが guild.settings.ts の repo
            と違うため、表示を止めています。collector
            を起動し直して、新しいリポジトリの収集が終わるのを待ってください。
          </p>
        </template>
        <template v-else>
          <h2 class="rpg-window__title">収集スクリプトを更新してください</h2>
          <p>snapshot.json の形（schemaVersion）が画面の想定と違うため、表示を止めています。</p>
        </template>
      </section>
      <template v-else>
        <QuestBoard class="stage__board" :groups="board" :loaded="state.snapshot !== null" />
        <KingBubble class="stage__king" :waiting="king.waiting" :detail="king.detail" />
        <MessageWindow
          class="stage__message"
          :message="message"
          :remaining="Math.max(state.messages.length - 1, 0)"
          :narration="narration"
          @next="next"
        />
      </template>
      <div class="stage__side">
        <PartyStatus v-if="!state.halted" class="stage__party" :rows="party" />
        <FetchStatus
          :status="fetchStatus"
          :effects-available="state.effectsAvailable"
          :baseline-notice="state.baselineNotice"
          @clear-baseline="clearBaseline"
        >
          <SoundControl
            :settings="soundSettings"
            @toggle="toggleSound"
            @cycle-volume="cycleVolume"
          />
        </FetchStatus>
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
 * The windows sit over the canvas (logical 1024 x 576, 16:9) where the map keeps nobody
 * (render/map.ts WINDOW_EXTENTS). Sizes follow the stage width through container query units.
 */
.stage {
  position: relative;
  width: min(100%, 1672px, calc(100vh * 16 / 9));
  min-width: 320px;
  container-type: inline-size;
  font-size: clamp(9px, 1.15cqw, 19px);
}

.stage__art {
  display: block;
}

/* Halted: the stage must not pass for live data. */
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
  /* Heights in cqw (stage width) because the stage height is 9/16 of it. */
  min-height: 17.7cqw;
  /* render/map.ts WINDOW_EXTENTS: ends above ひらめ's bubble (seat row 12) even mid-stretch. */
  max-height: 31cqw;
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

/* Above the king on the throne (render/map.ts: seat col 16, row 4), tail towards him. */
.stage__king {
  left: 52.5%;
  top: 0.8%;
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
 * Narrow screens: stack the windows. The canvas is hidden because the windows no longer leave
 * its stage free; the king's row still shows 承認まち.
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
