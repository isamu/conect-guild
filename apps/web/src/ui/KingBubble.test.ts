import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import KingBubble from './KingBubble.vue';

function render(waiting: boolean, detail: string | null): Promise<string> {
  return renderToString(createSSRApp(KingBubble, { waiting, detail }));
}

describe('KingBubble', () => {
  it('renders one element carrying the class it is given', async () => {
    const html = await renderToString(
      createSSRApp(KingBubble, { waiting: true, detail: null, class: 'stage__king' }),
    );
    expect(html).toMatch(/^<div class="bubble bubble--waiting stage__king"/);
  });

  it('shows 承認まち with the detail as a tooltip while a PR waits for the king', async () => {
    const html = await render(true, '承認まち 1 件');
    expect(html).toContain('承認まち');
    expect(html).toContain('title="承認まち 1 件"');
  });

  it('shows nothing while nothing waits', async () => {
    const html = await render(false, '承認まちの PR はありません');
    expect(html).not.toContain('<div');
    expect(html).not.toContain('承認まち');
  });

  it('shows nothing before the first snapshot', async () => {
    expect(await render(false, null)).not.toContain('<div');
  });
});
