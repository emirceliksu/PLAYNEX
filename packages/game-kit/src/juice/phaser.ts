import type Phaser from 'phaser';

const PARTICLE_SIZE = 6;

export interface BurstOptions {
  count?: number;
  speed?: number;
  lifeMs?: number;
}

// Reduced motion keeps the information (the score text) and drops the movement around it.
export class PhaserJuice {
  private frozenUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reducedMotion: boolean,
  ) {}

  // Games skip their simulation step while this is true.
  get frozen(): boolean {
    return this.scene.time.now < this.frozenUntil;
  }

  burst(x: number, y: number, color: number, options: BurstOptions = {}): void {
    if (this.reducedMotion) return;
    const { count = 12, speed = 180, lifeMs = 420 } = options;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const distance = speed * (0.5 + Math.random() * 0.5) * (lifeMs / 1000);
      const particle = this.scene.add.rectangle(x, y, PARTICLE_SIZE, PARTICLE_SIZE, color);
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        scale: 0,
        duration: lifeMs,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  trail(x: number, y: number, color: number, size = PARTICLE_SIZE): void {
    if (this.reducedMotion) return;
    const particle = this.scene.add.rectangle(x, y, size, size, color);
    this.scene.tweens.add({
      targets: particle,
      alpha: 0,
      scale: 0.2,
      duration: 260,
      onComplete: () => particle.destroy(),
    });
  }

  shake(intensity = 0.006, durationMs = 140): void {
    if (this.reducedMotion) return;
    this.scene.cameras.main.shake(durationMs, intensity);
  }

  hitStop(durationMs = 60): void {
    if (this.reducedMotion) return;
    this.frozenUntil = this.scene.time.now + durationMs;
  }

  floatText(x: number, y: number, text: string, color: string): void {
    const label = this.scene.add
      .text(x, y, text, { fontFamily: 'sans-serif', fontSize: '24px', color })
      .setOrigin(0.5);
    this.scene.tweens.add({
      targets: label,
      y: this.reducedMotion ? y : y - 48,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  confetti(colors: number[], durationMs = 1400): void {
    if (this.reducedMotion) return;
    const { width, height } = this.scene.scale.gameSize;
    for (let i = 0; i < 60; i += 1) {
      const color = colors[i % colors.length] ?? 0;
      const piece = this.scene.add.rectangle(Math.random() * width, -10, 8, 12, color);
      this.scene.tweens.add({
        targets: piece,
        y: height + 20,
        angle: 360 + Math.random() * 360,
        delay: Math.random() * (durationMs / 2),
        duration: durationMs / 2 + Math.random() * (durationMs / 2),
        onComplete: () => piece.destroy(),
      });
    }
  }

  fadeIn(durationMs = 240): void {
    if (!this.reducedMotion) this.scene.cameras.main.fadeIn(durationMs);
  }
}
