import {
  breakpoints,
  duration,
  easing,
  layout,
  oklchToHex,
  palette,
  radius,
  scaleSteps,
  shadow,
  themes,
  typeScale,
} from '@playnex/design-tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

const meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const canvasHex = oklchToHex(themes.dark.surface.canvas);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-display-sm">{title}</h2>
      {children}
    </section>
  );
}

export const Colors: Story = {
  render: () => (
    <div className="flex w-[72rem] max-w-full flex-col gap-10">
      <Section title="Renk skalaları">
        <p className="max-w-[60ch] text-body-sm text-fg-secondary">
          OKLCH ile yazılmış özel skalalar. Her kutuda koyu tuval üzerindeki kontrast oranı; 4,5 ve
          üzeri metin için AA geçer.
        </p>
        <div className="flex flex-col gap-3">
          {Object.entries(palette).map(([name, scale]) => (
            <div key={name} className="grid grid-cols-[6rem_1fr] items-center gap-3">
              <span className="font-display text-label-md">{name}</span>
              <div className="grid grid-cols-11 gap-1">
                {scaleSteps.map((step) => {
                  const hex = oklchToHex(scale[step]);
                  const ratio = contrast(hex, canvasHex);
                  return (
                    <div
                      key={step}
                      className="flex h-14 flex-col justify-end rounded-sm p-1 text-[0.625rem] leading-tight"
                      style={{
                        background: scale[step],
                        color: luminance(hex) > 0.35 ? '#111' : '#fff',
                      }}
                      title={`${name}-${step} ${hex}`}
                    >
                      <span className="font-semibold">{step}</span>
                      <span>{ratio.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Semantik tokenlar">
        <div className="grid gap-6 md:grid-cols-2">
          {(['dark', 'light'] as const).map((themeName) => (
            <div
              key={themeName}
              data-theme={themeName}
              className="rounded-xl border-2 border-border-strong bg-surface-canvas p-4 text-fg-primary"
            >
              <p className="mb-3 font-display text-title-sm">{themeName}</p>
              <div className="flex flex-col gap-2 text-body-sm">
                {Object.entries(themes[themeName]).map(([group, tokens]) => (
                  <div key={group} className="grid grid-cols-[6rem_1fr] gap-2">
                    <span className="text-fg-muted">{group}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(tokens as Record<string, string>).map(([token, value]) => (
                        <span
                          key={token}
                          className="inline-flex items-center gap-1.5 rounded-xs border border-border-subtle px-1.5 py-0.5 text-label-sm"
                          title={value}
                        >
                          <span
                            className="size-3 rounded-xs border border-border-strong"
                            style={{ background: value }}
                          />
                          {token}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div className="flex w-[64rem] max-w-full flex-col gap-10">
      <Section title="Tipografi ölçeği">
        <div className="flex flex-col gap-5">
          {Object.entries(typeScale).map(([name, style]) => (
            <div
              key={name}
              className="grid grid-cols-[8rem_1fr] items-baseline gap-4 border-b border-border-subtle pb-4"
            >
              <span className="text-label-sm text-fg-muted">
                {name}
                <br />
                {style.size} / {style.lineHeight} / {style.letterSpacing}
              </span>
              <span
                className={name.startsWith('body') ? 'font-body' : 'font-display tabular-nums'}
                style={{
                  fontSize: style.size,
                  lineHeight: style.lineHeight,
                  letterSpacing: style.letterSpacing,
                  fontWeight: style.weight,
                }}
              >
                {name.startsWith('score') ? '48 210' : 'Oyun salonu açılıyor'}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  ),
};

export const SpaceAndShape: Story = {
  render: () => (
    <div className="flex w-[64rem] max-w-full flex-col gap-10">
      <Section title="Yerleşim ve kırılımlar">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-body-sm md:grid-cols-4">
          {Object.entries({ ...layout, ...breakpoints }).map(([name, value]) => (
            <div key={name} className="flex justify-between border-b border-border-subtle py-1">
              <dt className="text-fg-muted">{name}</dt>
              <dd className="font-display tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Köşe yarıçapı">
        <div className="flex flex-wrap gap-4">
          {Object.entries(radius).map(([name, value]) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <div
                className="size-16 border-2 border-border-strong bg-surface-raised"
                style={{ borderRadius: value }}
              />
              <span className="text-label-sm text-fg-muted">
                {name} · {value}
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Gölgeler">
        <div className="flex flex-wrap gap-8">
          {Object.keys(shadow).map((name) => (
            <div key={name} className="flex flex-col items-center gap-3">
              <div
                className="flex h-20 w-32 items-center justify-center rounded-lg border-2 border-border-strong bg-surface-raised font-display text-label-md"
                style={{ boxShadow: `var(--pn-shadow-${name})` }}
              >
                {name}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Hareket">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-body-sm md:grid-cols-4">
          {Object.entries({ ...duration, ...easing }).map(([name, value]) => (
            <div
              key={name}
              className="flex justify-between gap-2 border-b border-border-subtle py-1"
            >
              <dt className="text-fg-muted">{name}</dt>
              <dd className="truncate font-display tabular-nums" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  ),
};
