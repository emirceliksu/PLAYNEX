'use client';

import type {
  CameraMode,
  GameDocument,
  HudAnchor,
  HudItem,
  Literal,
  SoundRecipe,
} from '@playnex/creator-runtime';
import { IconButton } from '@playnex/ui';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { NumberField, Section, SelectField, SwatchPicker, TextInput } from './fields';

const cameras: CameraMode[] = ['fixed', 'follow', 'topDown', 'thirdPerson'];
const recipes: SoundRecipe[] = [
  'coin',
  'jump',
  'hit',
  'explosion',
  'powerUp',
  'laser',
  'click',
  'win',
  'lose',
];
const anchors: HudAnchor[] = [
  'topLeft',
  'topCenter',
  'topRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
];
type HudType = HudItem['kind']['type'];
const hudTypes: HudType[] = ['score', 'timer', 'lives', 'variable', 'text'];

interface SettingsProps {
  document: GameDocument;
  swatches: readonly string[];
  onEdit: (change: (document: GameDocument) => void, key?: string) => void;
}

// Variable values typed as text become numbers when they read as one, the way
// the engine compares them anyway.
function parseLiteral(value: string): Literal {
  const trimmed = value.trim();
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  const number = Number(trimmed);
  return trimmed !== '' && Number.isFinite(number) ? number : value;
}

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base} ${index}`)) index++;
  return `${base} ${index}`;
}

export function Settings({ document, swatches, onEdit }: SettingsProps) {
  const t = useTranslations('creator.editor.settings');
  const world = document.world;
  const flat = document.dimension === '2d';
  const variables = document.variables ?? [];
  const lists = document.lists ?? [];
  const sounds = document.sounds ?? [];
  const hud = document.hud ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <Section title={t('world')}>
        <div className={flat ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-3'}>
          <NumberField
            label={t('width')}
            value={world.size.x}
            step={1}
            min={1}
            onChange={(x) =>
              onEdit((d) => (d.world.size.x = Math.min(5000, Math.max(1, x))), 'world-x')
            }
          />
          <NumberField
            label={t('height')}
            value={world.size.y}
            step={1}
            min={1}
            onChange={(y) =>
              onEdit((d) => (d.world.size.y = Math.min(5000, Math.max(1, y))), 'world-y')
            }
          />
          {flat ? null : (
            <NumberField
              label={t('depth')}
              value={world.size.z ?? 20}
              step={1}
              min={1}
              onChange={(z) =>
                onEdit((d) => (d.world.size.z = Math.min(5000, Math.max(1, z))), 'world-z')
              }
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumberField
            label={t('gravity')}
            value={world.gravity}
            step={1}
            onChange={(gravity) =>
              onEdit((d) => (d.world.gravity = Math.min(200, Math.max(-200, gravity))), 'gravity')
            }
          />
          <NumberField
            label={t('timeLimit')}
            value={world.timeLimitSeconds ?? 0}
            step={10}
            min={0}
            onChange={(seconds) =>
              onEdit(
                (d) =>
                  (d.world.timeLimitSeconds =
                    seconds > 0 ? Math.min(600, Math.round(seconds)) : null),
                'time',
              )
            }
          />
          <NumberField
            label={t('lives')}
            value={world.lives ?? 0}
            step={1}
            min={0}
            onChange={(lives) =>
              onEdit(
                (d) => (d.world.lives = lives > 0 ? Math.min(99, Math.round(lives)) : null),
                'lives',
              )
            }
          />
          <SelectField<CameraMode>
            label={t('camera')}
            value={world.camera ?? 'fixed'}
            options={cameras.map((camera) => ({ value: camera, label: t(`cameras.${camera}`) }))}
            onChange={(camera) => onEdit((d) => (d.world.camera = camera))}
          />
        </div>
        <p className="text-body-sm text-fg-muted">{t('zeroMeansNone')}</p>
        <SwatchPicker
          label={t('background')}
          value={world.background}
          swatches={swatches}
          swatchLabel={(index) => t('swatch', { n: index + 1 })}
          onChange={(background) => onEdit((d) => (d.world.background = background))}
        />
      </Section>

      <Section
        title={t('variables')}
        action={
          <IconButton
            label={t('addVariable')}
            size="sm"
            onClick={() =>
              onEdit((d) => {
                d.variables = [
                  ...(d.variables ?? []),
                  {
                    name: uniqueName(
                      t('newVariable'),
                      (d.variables ?? []).map((v) => v.name),
                    ),
                    initial: 0,
                  },
                ];
              })
            }
          >
            <Plus aria-hidden />
          </IconButton>
        }
      >
        <p className="text-body-sm text-fg-muted">{t('variablesHint')}</p>
        {variables.map((variable, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <TextInput
              label={t('name')}
              value={variable.name}
              maxLength={40}
              onChange={(name) =>
                onEdit((d) => (d.variables![index]!.name = name), `var-name-${index}`)
              }
            />
            <TextInput
              label={t('initial')}
              value={String(variable.initial)}
              onChange={(value) =>
                onEdit(
                  (d) => (d.variables![index]!.initial = parseLiteral(value)),
                  `var-initial-${index}`,
                )
              }
            />
            <IconButton
              label={t('remove')}
              size="sm"
              variant="ghost"
              onClick={() => onEdit((d) => d.variables?.splice(index, 1))}
            >
              <X aria-hidden />
            </IconButton>
          </div>
        ))}
      </Section>

      <Section
        title={t('lists')}
        action={
          <IconButton
            label={t('addList')}
            size="sm"
            onClick={() =>
              onEdit((d) => {
                d.lists = [
                  ...(d.lists ?? []),
                  {
                    name: uniqueName(
                      t('newList'),
                      (d.lists ?? []).map((l) => l.name),
                    ),
                    initial: [],
                  },
                ];
              })
            }
          >
            <Plus aria-hidden />
          </IconButton>
        }
      >
        {lists.map((list, index) => (
          <div key={index} className="grid grid-cols-[1fr_2fr_auto] items-end gap-2">
            <TextInput
              label={t('name')}
              value={list.name}
              maxLength={40}
              onChange={(name) =>
                onEdit((d) => (d.lists![index]!.name = name), `list-name-${index}`)
              }
            />
            <TextInput
              label={t('items')}
              value={(list.initial ?? []).join(', ')}
              placeholder={t('itemsHint')}
              onChange={(value) =>
                onEdit(
                  (d) =>
                    (d.lists![index]!.initial = value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map(parseLiteral)),
                  `list-items-${index}`,
                )
              }
            />
            <IconButton
              label={t('remove')}
              size="sm"
              variant="ghost"
              onClick={() => onEdit((d) => d.lists?.splice(index, 1))}
            >
              <X aria-hidden />
            </IconButton>
          </div>
        ))}
      </Section>

      <Section
        title={t('sounds')}
        action={
          <IconButton
            label={t('addSound')}
            size="sm"
            onClick={() =>
              onEdit((d) => {
                d.sounds = [
                  ...(d.sounds ?? []),
                  {
                    name: uniqueName(
                      t('newSound'),
                      (d.sounds ?? []).map((s) => s.name),
                    ),
                    recipe: 'coin',
                  },
                ];
              })
            }
          >
            <Plus aria-hidden />
          </IconButton>
        }
      >
        <p className="text-body-sm text-fg-muted">{t('soundsHint')}</p>
        {sounds.map((sound, index) => (
          <div
            key={index}
            className="grid grid-cols-2 items-end gap-2 md:grid-cols-[1fr_1fr_6rem_6rem_auto]"
          >
            <TextInput
              label={t('name')}
              value={sound.name}
              maxLength={40}
              onChange={(name) =>
                onEdit((d) => (d.sounds![index]!.name = name), `sound-name-${index}`)
              }
            />
            <SelectField<SoundRecipe>
              label={t('recipe')}
              value={sound.recipe}
              options={recipes.map((recipe) => ({ value: recipe, label: t(`recipes.${recipe}`) }))}
              onChange={(recipe) => onEdit((d) => (d.sounds![index]!.recipe = recipe))}
            />
            <NumberField
              label={t('pitch')}
              value={sound.pitch ?? 1}
              step={0.1}
              min={0.25}
              max={4}
              onChange={(pitch) =>
                onEdit(
                  (d) => (d.sounds![index]!.pitch = Math.min(4, Math.max(0.25, pitch))),
                  `pitch-${index}`,
                )
              }
            />
            <NumberField
              label={t('volume')}
              value={sound.volume ?? 1}
              step={0.1}
              min={0}
              max={1}
              onChange={(volume) =>
                onEdit(
                  (d) => (d.sounds![index]!.volume = Math.min(1, Math.max(0, volume))),
                  `volume-${index}`,
                )
              }
            />
            <IconButton
              label={t('remove')}
              size="sm"
              variant="ghost"
              onClick={() => onEdit((d) => d.sounds?.splice(index, 1))}
            >
              <X aria-hidden />
            </IconButton>
          </div>
        ))}
      </Section>

      <Section
        title={t('hud')}
        action={
          <IconButton
            label={t('addHud')}
            size="sm"
            onClick={() =>
              onEdit(
                (d) => (d.hud = [...(d.hud ?? []), { kind: { type: 'score' }, anchor: 'topLeft' }]),
              )
            }
          >
            <Plus aria-hidden />
          </IconButton>
        }
      >
        {hud.map((item, index) => (
          <div
            key={index}
            className="grid grid-cols-2 items-end gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
          >
            <SelectField<HudType>
              label={t('hudShows')}
              value={item.kind.type}
              options={hudTypes.map((type) => ({ value: type, label: t(`hudTypes.${type}`) }))}
              onChange={(type) =>
                onEdit((d) => {
                  d.hud![index]!.kind =
                    type === 'variable'
                      ? { type, name: variables[0]?.name ?? '' }
                      : type === 'text'
                        ? { type, text: '' }
                        : { type };
                })
              }
            />
            {item.kind.type === 'variable' ? (
              <TextInput
                label={t('variable')}
                value={item.kind.name}
                maxLength={40}
                onChange={(name) =>
                  onEdit(
                    (d) => (d.hud![index]!.kind = { type: 'variable', name }),
                    `hud-var-${index}`,
                  )
                }
              />
            ) : item.kind.type === 'text' ? (
              <TextInput
                label={t('text')}
                value={item.kind.text}
                onChange={(text) =>
                  onEdit((d) => (d.hud![index]!.kind = { type: 'text', text }), `hud-text-${index}`)
                }
              />
            ) : (
              <span />
            )}
            <TextInput
              label={t('label')}
              value={item.label ?? ''}
              maxLength={40}
              onChange={(label) =>
                onEdit((d) => (d.hud![index]!.label = label || null), `hud-label-${index}`)
              }
            />
            <SelectField<HudAnchor>
              label={t('anchor')}
              value={item.anchor}
              options={anchors.map((anchor) => ({ value: anchor, label: t(`anchors.${anchor}`) }))}
              onChange={(anchor) => onEdit((d) => (d.hud![index]!.anchor = anchor))}
            />
            <IconButton
              label={t('remove')}
              size="sm"
              variant="ghost"
              onClick={() => onEdit((d) => d.hud?.splice(index, 1))}
            >
              <X aria-hidden />
            </IconButton>
          </div>
        ))}
      </Section>
    </div>
  );
}
