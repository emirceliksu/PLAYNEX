import { el, panel, setText, show, teamText, type Translate } from './dom';

const FEED_LIMIT = 5;
const FEED_MS = 6_000;
const CHAT_LIMIT = 7;
const CHAT_MS = 9_000;
const HITMARK_MS = 160;
const HURT_MS = 900;

export interface HudView {
  hp: number;
  armor: number;
  helmet: boolean;
  money: number | null;
  ammo: string;
  weapon: string;
  grenades: string;
  timer: string;
  score: string;
  round: string;
  bomb: string | null;
  use: { label: string; progress: number } | null;
  crosshairGap: number;
  crosshair: boolean;
  scoped: boolean;
  dead: { title: string; detail: string } | null;
  spectating: string | null;
  ping: number;
  fps: number;
  level: string | null;
  buyHint: boolean;
  urgent: boolean;
}

export interface FeedEntry {
  killer: string | null;
  killerTeam: number;
  victim: string;
  victimTeam: number;
  weapon: string;
  headshot: boolean;
  mine: boolean;
}

export interface Label {
  x: number;
  y: number;
  text: string;
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly vitals: HTMLParagraphElement;
  private readonly armor: HTMLParagraphElement;
  private readonly ammo: HTMLParagraphElement;
  private readonly weapon: HTMLParagraphElement;
  private readonly grenades: HTMLParagraphElement;
  private readonly money: HTMLParagraphElement;
  private readonly timer: HTMLParagraphElement;
  private readonly score: HTMLParagraphElement;
  private readonly round: HTMLParagraphElement;
  private readonly bomb: HTMLParagraphElement;
  private readonly feed: HTMLOListElement;
  private readonly crosshair: HTMLDivElement;
  private readonly hitmark: HTMLDivElement;
  private readonly scope: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly bannerText: HTMLParagraphElement;
  private readonly bannerSub: HTMLParagraphElement;
  private readonly center: HTMLParagraphElement;
  private readonly chatLog: HTMLOListElement;
  private readonly chatForm: HTMLFormElement;
  private readonly chatInput: HTMLInputElement;
  private readonly chatScope: HTMLSpanElement;
  private readonly useBar: HTMLDivElement;
  private readonly useFill: HTMLDivElement;
  private readonly useLabel: HTMLParagraphElement;
  private readonly death: HTMLDivElement;
  private readonly deathTitle: HTMLParagraphElement;
  private readonly deathDetail: HTMLParagraphElement;
  private readonly spectate: HTMLParagraphElement;
  private readonly net: HTMLParagraphElement;
  private readonly level: HTMLParagraphElement;
  private readonly buyHint: HTMLParagraphElement;
  private readonly hurt: HTMLDivElement;
  private readonly labels: HTMLDivElement;
  private readonly crossLines: HTMLSpanElement[] = [];
  private hitUntil = 0;
  private hurtUntil = 0;
  private bannerUntil = 0;
  private centerUntil = 0;
  private chatTeam = false;
  private onChat: ((text: string, team: boolean) => void) | null = null;
  private onChatClose: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly t: Translate,
  ) {
    this.root = el(
      'div',
      'pointer-events-none absolute inset-0 select-none overflow-hidden font-body text-fg-primary',
    );
    const stat = 'font-display text-title-md tabular-nums leading-none';

    const top = el('div', 'absolute inset-x-0 top-2 flex justify-center');
    const scoreBox = el('div', `${panel} flex items-center gap-3 px-3 py-1.5`);
    this.score = el('p', stat);
    this.timer = el('p', `${stat} min-w-14 text-center`);
    this.round = el('p', 'text-label-sm text-fg-muted');
    this.bomb = el('p', 'text-label-sm font-semibold text-coral-text');
    scoreBox.append(this.score, this.timer, this.round, this.bomb);
    top.append(scoreBox);

    this.net = el(
      'p',
      'absolute left-2 top-2 rounded-md bg-surface-overlay/80 px-2 py-0.5 text-label-sm tabular-nums text-fg-muted',
    );
    this.level = el('p', `absolute left-2 top-9 ${panel} px-2 py-1 text-label-md`);

    this.feed = el('ol', 'absolute right-2 top-2 flex w-72 max-w-[45vw] flex-col items-end gap-1');

    const bottom = el('div', 'absolute inset-x-2 bottom-2 flex items-end justify-between gap-2');
    const left = el('div', `${panel} flex items-baseline gap-4 px-3 py-2`);
    this.vitals = el('p', `${stat} text-title-lg`);
    this.armor = el('p', 'text-label-md text-fg-secondary tabular-nums');
    left.append(this.vitals, this.armor);
    const middle = el('div', 'flex flex-col items-center gap-1');
    this.money = el(
      'p',
      `${panel} px-3 py-1 font-display text-title-sm tabular-nums text-mint-text`,
    );
    this.buyHint = el('p', 'text-label-sm text-fg-muted');
    middle.append(this.money, this.buyHint);
    const right = el('div', `${panel} flex flex-col items-end px-3 py-2`);
    this.ammo = el('p', `${stat} text-title-lg`);
    this.weapon = el('p', 'text-label-sm text-fg-secondary');
    this.grenades = el('p', 'text-label-sm text-fg-muted');
    right.append(this.ammo, this.weapon, this.grenades);
    bottom.append(left, middle, right);

    this.crosshair = el('div', 'absolute left-1/2 top-1/2 size-0');
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const vertical = side === 'top' || side === 'bottom';
      const line = el(
        'span',
        `absolute bg-fg-primary outline outline-1 outline-(--pn-shadow-ink) ${vertical ? 'h-2 w-0.5 -translate-x-1/2' : 'h-0.5 w-2 -translate-y-1/2'}`,
      );
      this.crossLines.push(line);
      this.crosshair.append(line);
    }
    this.hitmark = el(
      'div',
      'absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rotate-45',
    );
    this.hitmark.append(
      el('span', 'absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-current'),
      el('span', 'absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-current'),
    );
    this.scope = el(
      'div',
      'absolute left-1/2 top-1/2 aspect-square h-[92vh] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-950',
    );
    this.scope.style.boxShadow = '0 0 0 200vmax var(--color-ink-950)';
    this.scope.append(
      el('span', 'absolute left-1/2 top-0 h-full w-px bg-ink-950'),
      el('span', 'absolute left-0 top-1/2 h-px w-full bg-ink-950'),
    );

    this.hurt = el('div', 'absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2');
    const arc = el(
      'span',
      'absolute left-1/2 top-0 h-3 w-16 -translate-x-1/2 rounded-full bg-coral-solid',
    );
    this.hurt.append(arc);

    this.banner = el(
      'div',
      'absolute inset-x-0 top-[18%] flex flex-col items-center gap-1 text-center',
    );
    this.bannerText = el(
      'p',
      'font-display text-display-md uppercase tracking-wide text-yellow-text [text-shadow:3px_3px_0_var(--pn-shadow-ink)] md:text-display-lg',
    );
    this.bannerSub = el(
      'p',
      'text-title-sm text-fg-primary [text-shadow:2px_2px_0_var(--pn-shadow-ink)]',
    );
    this.banner.append(this.bannerText, this.bannerSub);
    this.banner.setAttribute('role', 'status');
    this.center = el(
      'p',
      `absolute left-1/2 top-[34%] -translate-x-1/2 ${panel} px-5 py-2 font-display text-title-lg`,
    );

    this.useBar = el(
      'div',
      'absolute left-1/2 top-[60%] flex w-64 -translate-x-1/2 flex-col items-center gap-1',
    );
    this.useLabel = el('p', 'text-label-md');
    const track = el(
      'div',
      'h-3 w-full overflow-hidden rounded-full border-2 border-(--pn-shadow-ink) bg-surface-sunken',
    );
    this.useFill = el('div', 'h-full bg-yellow-solid');
    track.append(this.useFill);
    this.useBar.append(this.useLabel, track);

    this.death = el(
      'div',
      `absolute left-1/2 top-[66%] -translate-x-1/2 ${panel} flex flex-col items-center px-5 py-2 text-center`,
    );
    this.deathTitle = el('p', 'font-display text-title-md');
    this.deathDetail = el('p', 'text-body-sm text-fg-secondary');
    this.death.append(this.deathTitle, this.deathDetail);
    this.spectate = el(
      'p',
      `absolute bottom-24 left-1/2 -translate-x-1/2 ${panel} px-3 py-1 text-label-md`,
    );

    this.chatLog = el(
      'ol',
      'absolute bottom-24 left-2 flex w-96 max-w-[60vw] flex-col gap-0.5 text-body-sm',
    );
    this.chatForm = el(
      'form',
      'pointer-events-auto absolute bottom-16 left-2 flex w-96 max-w-[70vw] items-center gap-2',
    );
    this.chatScope = el('span', 'shrink-0 text-label-sm font-semibold uppercase');
    this.chatInput = el(
      'input',
      'min-w-0 flex-1 rounded-md border-2 border-(--pn-shadow-ink) bg-surface-overlay px-2 py-1 text-body-sm text-fg-primary outline-none focus-visible:border-border-focus',
    );
    this.chatInput.maxLength = 160;
    this.chatInput.setAttribute('aria-label', t('chatPlaceholder'));
    this.chatInput.placeholder = t('chatPlaceholder');
    this.chatForm.append(this.chatScope, this.chatInput);
    this.chatForm.hidden = true;
    this.chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = this.chatInput.value.trim();
      if (text) this.onChat?.(text, this.chatTeam);
      this.closeChat();
    });
    this.chatInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') this.closeChat();
    });

    this.labels = el('div', 'absolute inset-0');

    this.root.append(
      this.labels,
      this.scope,
      top,
      this.net,
      this.level,
      this.feed,
      this.hurt,
      this.crosshair,
      this.hitmark,
      this.banner,
      this.center,
      this.useBar,
      this.death,
      this.spectate,
      this.chatLog,
      this.chatForm,
      bottom,
    );
    for (const node of [
      this.hurt,
      this.hitmark,
      this.banner,
      this.center,
      this.useBar,
      this.death,
      this.spectate,
      this.scope,
    ]) {
      node.hidden = true;
    }
    container.append(this.root);
  }

  update(view: HudView, now: number): void {
    setText(this.vitals, `+${Math.max(0, view.hp)}`);
    this.vitals.classList.toggle('text-coral-text', view.hp <= 25);
    setText(
      this.armor,
      view.armor > 0
        ? this.t(view.helmet ? 'armorHelmetValue' : 'armorValue', { n: view.armor })
        : '',
    );
    setText(this.ammo, view.ammo);
    setText(this.weapon, view.weapon);
    setText(this.grenades, view.grenades);
    show(this.money, view.money !== null);
    if (view.money !== null) setText(this.money, this.t('moneyValue', { n: view.money }));
    show(this.buyHint, view.buyHint);
    setText(this.buyHint, this.t('buyHint'));
    setText(this.timer, view.timer);
    this.timer.classList.toggle('text-coral-text', view.urgent);
    setText(this.score, view.score);
    setText(this.round, view.round);
    show(this.bomb, view.bomb !== null);
    setText(this.bomb, view.bomb ?? '');
    setText(this.net, this.t('netStats', { ping: view.ping, fps: view.fps }));
    show(this.level, view.level !== null);
    setText(this.level, view.level ?? '');

    show(this.crosshair, view.crosshair && !view.scoped);
    show(this.scope, view.scoped);
    const gap = Math.round(4 + view.crosshairGap);
    const [up, down, leftLine, rightLine] = this.crossLines;
    if (up) up.style.transform = `translate(-50%, ${-gap - 8}px)`;
    if (down) down.style.transform = `translate(-50%, ${gap}px)`;
    if (leftLine) leftLine.style.transform = `translate(${-gap - 8}px, -50%)`;
    if (rightLine) rightLine.style.transform = `translate(${gap}px, -50%)`;
    show(this.hitmark, now < this.hitUntil);
    show(this.hurt, now < this.hurtUntil);
    show(this.banner, now < this.bannerUntil);
    show(this.center, now < this.centerUntil);

    show(this.useBar, view.use !== null);
    if (view.use) {
      setText(this.useLabel, view.use.label);
      this.useFill.style.width = `${Math.round(view.use.progress * 100)}%`;
    }
    show(this.death, view.dead !== null);
    if (view.dead) {
      setText(this.deathTitle, view.dead.title);
      setText(this.deathDetail, view.dead.detail);
    }
    show(this.spectate, view.spectating !== null);
    setText(this.spectate, view.spectating ?? '');

    for (const item of [...this.feed.children]) {
      if (now - Number((item as HTMLElement).dataset.at) > FEED_MS) item.remove();
    }
    for (const item of [...this.chatLog.children]) {
      if (this.chatForm.hidden && now - Number((item as HTMLElement).dataset.at) > CHAT_MS) {
        (item as HTMLElement).hidden = true;
      }
    }
  }

  kill(entry: FeedEntry, teams: boolean, now: number): void {
    const item = el(
      'li',
      `flex items-center gap-2 rounded-md px-2 py-0.5 text-label-md ${entry.mine ? 'border-2 border-yellow-solid bg-surface-overlay' : 'bg-surface-overlay/85'}`,
    );
    item.dataset.at = String(now);
    if (entry.killer)
      item.append(el('span', `font-semibold ${teamText(entry.killerTeam, teams)}`, entry.killer));
    item.append(el('span', 'text-fg-muted', this.t(`weapon.${entry.weapon}`)));
    if (entry.headshot) item.append(el('span', 'text-yellow-text', this.t('headshotMark')));
    item.append(el('span', `font-semibold ${teamText(entry.victimTeam, teams)}`, entry.victim));
    this.feed.append(item);
    while (this.feed.children.length > FEED_LIMIT) this.feed.firstElementChild?.remove();
  }

  announce(text: string, sub: string, now: number): void {
    setText(this.bannerText, text);
    setText(this.bannerSub, sub);
    this.bannerUntil = now + 2_200;
  }

  centerMessage(text: string, now: number, ms = 2_500): void {
    setText(this.center, text);
    this.centerUntil = now + ms;
  }

  hit(head: boolean, kill: boolean, now: number): void {
    this.hitmark.classList.remove('text-coral-text', 'text-yellow-text', 'text-fg-primary');
    this.hitmark.classList.add(
      kill ? 'text-coral-text' : head ? 'text-yellow-text' : 'text-fg-primary',
    );
    this.hitUntil = now + (kill ? HITMARK_MS * 2 : HITMARK_MS);
  }

  hurtFrom(angle: number, now: number): void {
    this.hurt.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    this.hurtUntil = now + HURT_MS;
  }

  chat(
    from: string,
    text: string,
    team: boolean,
    side: number | null,
    teams: boolean,
    now: number,
  ): void {
    const line = el('li', 'w-fit rounded-md bg-surface-overlay/85 px-2 py-0.5');
    line.dataset.at = String(now);
    if (team) line.append(el('span', 'mr-1 text-label-sm text-fg-muted', this.t('teamTag')));
    line.append(
      el('span', `mr-1 font-semibold ${teamText(side ?? 0, teams && side !== null)}`, `${from}:`),
    );
    line.append(el('span', '', text));
    this.chatLog.append(line);
    while (this.chatLog.children.length > CHAT_LIMIT) this.chatLog.firstElementChild?.remove();
  }

  openChat(team: boolean, send: (text: string, team: boolean) => void, close: () => void): void {
    this.chatTeam = team;
    this.onChat = send;
    this.onChatClose = close;
    setText(this.chatScope, this.t(team ? 'chatTeam' : 'chatAll'));
    this.chatForm.hidden = false;
    for (const item of this.chatLog.children) (item as HTMLElement).hidden = false;
    this.chatInput.value = '';
    // Focusing on the same tick as the key press would type the hotkey into the box.
    window.setTimeout(() => this.chatInput.focus(), 0);
  }

  get chatting(): boolean {
    return !this.chatForm.hidden;
  }

  closeChat(): void {
    this.chatForm.hidden = true;
    this.chatInput.blur();
    this.onChatClose?.();
  }

  setLabels(labels: Label[]): void {
    while (this.labels.children.length < labels.length) {
      this.labels.append(
        el(
          'span',
          'absolute -translate-x-1/2 -translate-y-full rounded-sm bg-surface-overlay/80 px-1 text-label-sm text-fg-primary',
        ),
      );
    }
    [...this.labels.children].forEach((node, i) => {
      const label = labels[i];
      const span = node as HTMLElement;
      span.hidden = !label;
      if (!label) return;
      setText(span, label.text);
      span.style.left = `${label.x}px`;
      span.style.top = `${label.y}px`;
    });
  }

  destroy(): void {
    this.root.remove();
  }
}
