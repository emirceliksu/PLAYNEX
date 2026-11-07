'use client';

import {
  type Behavior,
  type BehaviorKind,
  type BodyKind,
  type Dimension,
  type Entity,
  SHAPES_2D,
  SHAPES_3D,
  type ShapeKind,
} from '@playnex/creator-runtime';
import { Button, IconButton } from '@playnex/ui';
import { Copy, Layers, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CheckField, NumberField, Section, SelectField, SwatchPicker, TextInput } from './fields';

const behaviorDefaults: Record<BehaviorKind, Behavior> = {
  platformerController: { kind: 'platformerController', speed: 7, jump: 13 },
  topDownController: { kind: 'topDownController', speed: 6 },
  patrol: { kind: 'patrol', distance: 4, speed: 2, axis: 'x' },
  chase: { kind: 'chase', tag: 'player', speed: 2 },
  collectible: { kind: 'collectible', points: 10 },
  hazard: { kind: 'hazard', damage: 1 },
  goal: { kind: 'goal' },
  cameraTarget: { kind: 'cameraTarget' },
  spin: { kind: 'spin', degreesPerSecond: 90 },
};

const behaviorKinds = Object.keys(behaviorDefaults) as BehaviorKind[];
const bodies: BodyKind[] = ['static', 'dynamic', 'kinematic', 'none'];

// Adding a behavior also sets up what it needs to work, the way a player would
// expect: a controller makes the object a moving player, a pickup a sensor.
function applyBehavior(entity: Entity, behavior: Behavior): void {
  entity.behaviors = [...(entity.behaviors ?? []), behavior];
  switch (behavior.kind) {
    case 'platformerController':
    case 'topDownController':
      entity.body = 'dynamic';
      entity.tags = Array.from(new Set([...(entity.tags ?? []), 'player']));
      break;
    case 'patrol':
    case 'chase':
      if (entity.body !== 'dynamic') entity.body = 'kinematic';
      break;
    case 'collectible':
    case 'hazard':
    case 'goal':
      entity.sensor = true;
      break;
    default:
      break;
  }
}

interface InspectorProps {
  entity: Entity;
  isPrefab: boolean;
  dimension: Dimension;
  swatches: readonly string[];
  onChange: (change: (entity: Entity) => void, key?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: () => void;
}

export function Inspector({
  entity,
  isPrefab,
  dimension,
  swatches,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
}: InspectorProps) {
  const t = useTranslations('creator.editor');
  const [adding, setAdding] = useState<BehaviorKind>('collectible');
  const flat = dimension === '2d';
  const shapes = flat ? SHAPES_2D : SHAPES_3D;
  const key = (field: string) => `${entity.id}-${field}`;

  return (
    <div className="flex flex-col">
      <Section
        title={isPrefab ? t('inspector.prefab') : t('inspector.object')}
        action={
          <div className="flex gap-1">
            <IconButton
              label={t('inspector.duplicate')}
              size="sm"
              variant="ghost"
              onClick={onDuplicate}
            >
              <Copy aria-hidden />
            </IconButton>
            <IconButton label={t('inspector.delete')} size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 aria-hidden />
            </IconButton>
          </div>
        }
      >
        <TextInput
          label={t('inspector.name')}
          value={entity.name}
          maxLength={40}
          onChange={(name) => onChange((e) => (e.name = name), key('name'))}
        />
        <SelectField<ShapeKind>
          label={t('inspector.shape')}
          value={entity.shape.kind}
          options={shapes.map((kind) => ({ value: kind, label: t(`shapes.${kind}`) }))}
          onChange={(kind) =>
            onChange((e) => {
              e.shape =
                kind === 'star'
                  ? { kind, points: 5 }
                  : kind === 'polygon'
                    ? {
                        kind,
                        points: [
                          [0, 1],
                          [1, -1],
                          [-1, -1],
                        ],
                      }
                    : { kind };
              if (kind === 'text' && !e.text) e.text = e.name;
            })
          }
        />
        {entity.shape.kind === 'star' ? (
          <NumberField
            label={t('inspector.starPoints')}
            value={entity.shape.points}
            step={1}
            min={3}
            max={12}
            onChange={(points) =>
              onChange((e) => {
                if (e.shape.kind === 'star')
                  e.shape.points = Math.min(12, Math.max(3, Math.round(points)));
              }, key('star'))
            }
          />
        ) : null}
        {entity.shape.kind === 'text' ? (
          <TextInput
            label={t('inspector.text')}
            value={entity.text ?? ''}
            onChange={(text) => onChange((e) => (e.text = text), key('text'))}
          />
        ) : null}
        <Button size="sm" variant="secondary" onClick={onMove}>
          <Layers aria-hidden className="size-4" />
          {isPrefab ? t('inspector.toScene') : t('inspector.toPrefab')}
        </Button>
        {isPrefab ? (
          <p className="text-body-sm text-fg-muted">{t('inspector.prefabHint')}</p>
        ) : null}
      </Section>

      <Section title={t('inspector.transform')}>
        <div className={flat ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2'}>
          <NumberField
            label="x"
            value={entity.position.x}
            onChange={(x) => onChange((e) => (e.position.x = x), key('px'))}
          />
          <NumberField
            label="y"
            value={entity.position.y}
            onChange={(y) => onChange((e) => (e.position.y = y), key('py'))}
          />
          {flat ? null : (
            <NumberField
              label="z"
              value={entity.position.z ?? 0}
              onChange={(z) => onChange((e) => (e.position.z = z), key('pz'))}
            />
          )}
          <NumberField
            label={t('inspector.width')}
            value={entity.size.x}
            min={0.05}
            onChange={(x) => onChange((e) => (e.size.x = Math.max(0.05, x)), key('sx'))}
          />
          <NumberField
            label={t('inspector.height')}
            value={entity.size.y}
            min={0.05}
            onChange={(y) => onChange((e) => (e.size.y = Math.max(0.05, y)), key('sy'))}
          />
          {flat ? null : (
            <NumberField
              label={t('inspector.depth')}
              value={entity.size.z ?? 1}
              min={0.05}
              onChange={(z) => onChange((e) => (e.size.z = Math.max(0.05, z)), key('sz'))}
            />
          )}
        </div>
        <NumberField
          label={t('inspector.rotation')}
          value={entity.rotation ?? 0}
          step={15}
          onChange={(degrees) =>
            onChange((e) => (e.rotation = ((degrees % 360) + 360) % 360), key('rot'))
          }
        />
      </Section>

      <Section title={t('inspector.look')}>
        <SwatchPicker
          label={t('inspector.color')}
          value={entity.color}
          swatches={swatches}
          swatchLabel={(index) => t('inspector.swatch', { n: index + 1 })}
          onChange={(color) => onChange((e) => (e.color = color))}
        />
        <CheckField
          label={t('inspector.visible')}
          checked={entity.visible !== false}
          onChange={(visible) => onChange((e) => (e.visible = visible))}
        />
      </Section>

      <Section title={t('inspector.physics')}>
        <SelectField<BodyKind>
          label={t('inspector.body')}
          value={entity.body ?? 'static'}
          options={bodies.map((body) => ({ value: body, label: t(`bodies.${body}`) }))}
          onChange={(body) => onChange((e) => (e.body = body))}
        />
        <p className="text-body-sm text-fg-muted">{t(`bodies.${entity.body ?? 'static'}Hint`)}</p>
        <CheckField
          label={t('inspector.sensor')}
          checked={entity.sensor === true}
          onChange={(sensor) => onChange((e) => (e.sensor = sensor))}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t('inspector.bounce')}
            value={entity.bounce ?? 0}
            step={0.1}
            min={0}
            max={1}
            onChange={(bounce) =>
              onChange((e) => (e.bounce = Math.min(1, Math.max(0, bounce))), key('bounce'))
            }
          />
          <NumberField
            label={t('inspector.friction')}
            value={entity.friction ?? 0.8}
            step={0.1}
            min={0}
            max={1}
            onChange={(friction) =>
              onChange((e) => (e.friction = Math.min(1, Math.max(0, friction))), key('friction'))
            }
          />
        </div>
        <TextInput
          label={t('inspector.tags')}
          value={(entity.tags ?? []).join(', ')}
          placeholder={t('inspector.tagsHint')}
          onChange={(value) =>
            onChange(
              (e) =>
                (e.tags = value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean)
                  .slice(0, 8)),
              key('tags'),
            )
          }
        />
      </Section>

      <Section title={t('inspector.behaviors')}>
        <p className="text-body-sm text-fg-muted">{t('inspector.behaviorsHint')}</p>
        <ul className="flex flex-col gap-2">
          {(entity.behaviors ?? []).map((behavior, index) => (
            <li
              key={`${behavior.kind}-${index}`}
              className="flex flex-col gap-2 rounded-lg border-2 border-border-subtle bg-surface-sunken p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-body-md">{t(`behaviors.${behavior.kind}`)}</span>
                <IconButton
                  label={t('inspector.removeBehavior')}
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange((e) => e.behaviors?.splice(index, 1))}
                >
                  <X aria-hidden />
                </IconButton>
              </div>
              <BehaviorParams
                behavior={behavior}
                dimension={dimension}
                onChange={(next) =>
                  onChange(
                    (e) => {
                      if (e.behaviors) e.behaviors[index] = next;
                    },
                    key(`behavior-${index}`),
                  )
                }
              />
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <SelectField<BehaviorKind>
              label={t('inspector.addBehavior')}
              value={adding}
              options={behaviorKinds.map((kind) => ({
                value: kind,
                label: t(`behaviors.${kind}`),
              }))}
              onChange={setAdding}
            />
          </div>
          <IconButton
            label={t('inspector.addBehavior')}
            size="sm"
            onClick={() =>
              onChange((e) => applyBehavior(e, structuredClone(behaviorDefaults[adding])))
            }
          >
            <Plus aria-hidden />
          </IconButton>
        </div>
      </Section>
    </div>
  );
}

function BehaviorParams({
  behavior,
  dimension,
  onChange,
}: {
  behavior: Behavior;
  dimension: Dimension;
  onChange: (behavior: Behavior) => void;
}) {
  const t = useTranslations('creator.editor.params');
  const number = (field: string, value: number, step = 0.5) => (
    <NumberField
      key={field}
      label={t(field as Parameters<typeof t>[0])}
      value={value}
      step={step}
      min={0}
      onChange={(next) => onChange({ ...behavior, [field]: Math.max(0, next) })}
    />
  );
  switch (behavior.kind) {
    case 'platformerController':
      return (
        <div className="grid grid-cols-2 gap-2">
          {[number('speed', behavior.speed), number('jump', behavior.jump)]}
        </div>
      );
    case 'topDownController':
      return number('speed', behavior.speed);
    case 'patrol':
      return (
        <div className="grid grid-cols-3 gap-2">
          {number('distance', behavior.distance)}
          {number('speed', behavior.speed)}
          <SelectField
            label={t('axis')}
            value={behavior.axis}
            options={(dimension === '2d' ? ['x', 'y'] : ['x', 'y', 'z']).map((axis) => ({
              value: axis as 'x' | 'y' | 'z',
              label: axis,
            }))}
            onChange={(axis) => onChange({ ...behavior, axis })}
          />
        </div>
      );
    case 'chase':
      return (
        <div className="grid grid-cols-2 gap-2">
          <TextInput
            label={t('tag')}
            value={behavior.tag}
            maxLength={40}
            onChange={(tag) => onChange({ ...behavior, tag })}
          />
          {number('speed', behavior.speed)}
        </div>
      );
    case 'collectible':
      return number('points', behavior.points, 1);
    case 'hazard':
      return number('damage', behavior.damage, 1);
    case 'spin':
      return number('degreesPerSecond', behavior.degreesPerSecond, 15);
    default:
      return null;
  }
}
