import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

interface Particle {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
}

const GRAVITY = 9;

export class BabylonJuice {
  private readonly particles: Particle[] = [];
  private frozenUntil = 0;
  private shakeUntil = 0;
  private shakeAmount = 0;

  constructor(
    private readonly scene: Scene,
    private readonly reducedMotion: boolean,
  ) {
    scene.onBeforeRenderObservable.add(() => this.update());
  }

  // Games skip their simulation step while this is true.
  get frozen(): boolean {
    return performance.now() < this.frozenUntil;
  }

  burst(position: Vector3, color: Color3, count = 12, speed = 4): void {
    if (this.reducedMotion) return;
    const material = new StandardMaterial('juice', this.scene);
    material.diffuseColor = color;
    material.emissiveColor = color;
    for (let i = 0; i < count; i += 1) {
      const mesh = CreateBox('juice', { size: 0.12 }, this.scene);
      mesh.material = material;
      mesh.position.copyFrom(position);
      const velocity = new Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5);
      this.particles.push({ mesh, velocity: velocity.scale(speed), life: 0.6 });
    }
  }

  shake(amount = 0.08, durationMs = 160): void {
    if (this.reducedMotion) return;
    this.shakeAmount = amount;
    this.shakeUntil = performance.now() + durationMs;
  }

  hitStop(durationMs = 60): void {
    if (!this.reducedMotion) this.frozenUntil = performance.now() + durationMs;
  }

  // The game owns its camera rig, so it adds this to the camera position each frame.
  shakeOffset(): Vector3 {
    if (performance.now() >= this.shakeUntil) return Vector3.Zero();
    const random = () => (Math.random() - 0.5) * this.shakeAmount;
    return new Vector3(random(), random(), random());
  }

  destroy(): void {
    for (const particle of this.particles) particle.mesh.dispose();
    this.particles.length = 0;
  }

  private update(): void {
    const delta = this.scene.getEngine().getDeltaTime() / 1000;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      if (!particle) continue;
      particle.life -= delta;
      if (particle.life <= 0) {
        particle.mesh.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      particle.velocity.y -= GRAVITY * delta;
      particle.mesh.position.addInPlace(particle.velocity.scale(delta));
    }
  }
}
