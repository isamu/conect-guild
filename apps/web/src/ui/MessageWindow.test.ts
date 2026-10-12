import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import type { GuildMessage } from '../app/messageQueue';
import MessageWindow from './MessageWindow.vue';

const message: GuildMessage = { id: 1, text: 'テスト', event: null };

function render(msg: GuildMessage | null, remaining: number): Promise<string> {
  return renderToString(createSSRApp(MessageWindow, { message: msg, remaining }));
}

describe('MessageWindow', () => {
  it('has one button covering the window, not nested, labelled for assistive tech', async () => {
    const html = await render(message, 2);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('aria-label="つぎへ（あと 2 件）"');
    expect(html).toContain('class="message__next"');
    // The mark is plain text inside the button, so a click on it cannot emit twice.
    expect(html).toMatch(/<button[^>]*><span[^>]*aria-hidden="true"[^>]*>▼/);
    expect(html).not.toMatch(/<button[^>]*>[\s\S]*<button/);
  });

  it('says とじる on the last message', async () => {
    expect(await render(message, 0)).toContain('aria-label="とじる"');
  });

  it('has no button while nothing happened', async () => {
    const html = await render(null, 0);
    expect(html).not.toContain('<button');
    expect(html).toContain('あたらしい できごとは まだ ない。');
  });
});
