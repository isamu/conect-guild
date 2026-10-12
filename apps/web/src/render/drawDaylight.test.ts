import { describe, expect, it } from 'vitest';
import { daylightAt, type LampLight } from './daylight';
import { drawShade, type ShadeContext } from './drawDaylight';

/** A 2D context that records what is drawn and keeps save/restore state like a real one. */
function fakeContext(name: string, log: string[]): ShadeContext & { depth: () => number } {
  const stack: { composite: GlobalCompositeOperation }[] = [];
  let composite: GlobalCompositeOperation = 'source-over';
  return {
    get globalCompositeOperation() {
      return composite;
    },
    set globalCompositeOperation(value) {
      composite = value;
    },
    fillStyle: '#000000',
    save() {
      stack.push({ composite });
      log.push(`${name}.save`);
    },
    restore() {
      composite = stack.pop()?.composite ?? composite;
      log.push(`${name}.restore`);
    },
    fillRect() {
      log.push(`${name}.fill ${composite}`);
    },
    drawImage() {
      log.push(`${name}.image ${composite}`);
    },
    createRadialGradient() {
      return { addColorStop: () => undefined };
    },
    depth: () => stack.length,
  };
}

const IMAGE: ImageBitmap = { width: 1024, height: 576, close: () => undefined };
const LAMPS: readonly LampLight[] = [
  { x: 100, y: 100, r: 60 },
  { x: 500, y: 300, r: 84 },
];

function shade(hour: number) {
  const log: string[] = [];
  const ctx = fakeContext('room', log);
  const scratch = fakeContext('shade', log);
  scratch.globalCompositeOperation = 'lighter';
  drawShade(ctx, { ctx: scratch, image: IMAGE }, daylightAt(hour), LAMPS);
  return { log, ctx };
}

describe('drawShade', () => {
  it('draws nothing by day', () => {
    expect(shade(12).log).toEqual([]);
  });

  it('fills the shade, cuts a hole per lamp, multiplies it over the room, then adds warm light', () => {
    expect(shade(22).log).toEqual([
      'shade.fill source-over',
      'shade.fill destination-out',
      'shade.fill destination-out',
      'room.save',
      'room.image multiply',
      'room.fill lighter',
      'room.fill lighter',
      'room.restore',
    ]);
  });

  it('leaves the room’s context as it was', () => {
    const { ctx } = shade(22);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.depth()).toBe(0);
  });

  it('shades with no hole when there are no lamps', () => {
    const log: string[] = [];
    const scratch = fakeContext('shade', log);
    drawShade(fakeContext('room', log), { ctx: scratch, image: IMAGE }, daylightAt(22), []);
    expect(log).toEqual([
      'shade.fill source-over',
      'room.save',
      'room.image multiply',
      'room.restore',
    ]);
  });
});
