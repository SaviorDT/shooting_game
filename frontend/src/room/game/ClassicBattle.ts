import Phaser from 'phaser';
import {
  type ClassicBattleBulletType,
  ClassicBattleConfig,
  ClassicBattleShotResult,
  ClassicBattleState,
  SimplePhysicsEngine,
  type PhysicsEngineStat,
} from 'shared';

export interface ClassicBattleFirePayload {
  shooterId: string;
  pullX: number;
  pullY: number;
  bullet: ClassicBattleBulletType;
}

export interface ClassicBattleRendererOptions {
  config: ClassicBattleConfig;
  state: ClassicBattleState;
  physicsStat?: PhysicsEngineStat;
  localPlayerId: string;
  onFire?: (payload: ClassicBattleFirePayload) => void;
  dragLineColor?: number;
  uiFontFamily?: string;
  uiFontSize?: number;
  playerColors?: Record<string, number>;
  backgroundColor?: string;
}

interface ClassicBattleSceneOptions extends ClassicBattleRendererOptions {}

interface PlayerVisual {
  sprite: Phaser.GameObjects.Arc;
  nameLabel: Phaser.GameObjects.Text;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  energyBarBg: Phaser.GameObjects.Rectangle;
  energyBarFill: Phaser.GameObjects.Rectangle;
}

interface BulletButtonVisual {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  subtitle: Phaser.GameObjects.Text;
}

class ClassicBattleScene extends Phaser.Scene {
  private readonly sceneConfig: ClassicBattleConfig;
  private state: ClassicBattleState;
  private readonly localPlayerId: string;
  private readonly onFire?: (payload: ClassicBattleFirePayload) => void;
  private readonly dragLineColor: number;
  private readonly uiFontFamily: string;
  private readonly uiFontSize: number;
  private readonly playerColors: Record<string, number>;
  private readonly backgroundColor: string;
  private readonly statusBarWidth: number;
  private readonly statusBarHeight: number;
  private readonly statusBarGap: number;
  private playerVisuals = new Map<string, PlayerVisual>();
  private projectileSprites = new Map<string, Phaser.GameObjects.Arc>();
  private physicsStat: PhysicsEngineStat | null;
  private readonly physicsPredictor: SimplePhysicsEngine;
  private physicsStatReceivedAtMs = 0;
  private readonly maxPredictionSeconds = 0.25;
  private readonly battlefieldOffset = new Phaser.Math.Vector2();
  private selectedBullet: ClassicBattleBulletType = 'normal';
  private bulletSelector?: Phaser.GameObjects.Container;
  private bulletButtons = new Map<ClassicBattleBulletType, BulletButtonVisual>();
  private battlefieldFrame?: Phaser.GameObjects.Graphics;
  private dragLine?: Phaser.GameObjects.Graphics;
  private dragOrigin = new Phaser.Math.Vector2();
  private isDragging = false;

  constructor(options: ClassicBattleSceneOptions) {
    super({ key: 'ClassicBattleScene' });
    this.sceneConfig = options.config;
    this.state = options.state;
    this.localPlayerId = options.localPlayerId;
    this.onFire = options.onFire;
    this.dragLineColor = options.dragLineColor ?? 0x8fd1ff;
    this.uiFontFamily = options.uiFontFamily ?? 'Chakra Petch, sans-serif';
    this.uiFontSize = options.uiFontSize ?? 18;
    this.playerColors = options.playerColors ?? {};
    this.backgroundColor = options.backgroundColor ?? '#0a1021';
    this.statusBarWidth = this.sceneConfig.playerRadius * 2.6;
    this.statusBarHeight = 6;
    this.statusBarGap = 4;
    this.physicsStat = options.physicsStat ?? null;
    this.physicsPredictor = new SimplePhysicsEngine();
    this.physicsStatReceivedAtMs = this.nowMs();
    if (this.physicsStat) {
      this.physicsPredictor.SetStat(this.physicsStat);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.backgroundColor);
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);
    this.layoutBattlefield();

    this.dragLine = this.add.graphics();
    this.battlefieldFrame = this.add.graphics();
    this.drawBattlefieldFrame();
    this.renderPlayers();
    this.createBulletSelector();
    this.applyPhysicsStat();
    this.setupInput();
    this.scale.on('resize', this.handleResize, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
    });
  }

  setState(state: ClassicBattleState): void {
    this.state = state;
    this.state.players.forEach((player) => {
      const visual = this.playerVisuals.get(player.id);
      if (visual) {
        visual.nameLabel.setText(player.name);
      }

      this.setPlayerVisualPosition(player.id, player.x, player.y);
      this.updatePlayerStatusBars(player);
    });
  }

  playShot(shot: ClassicBattleShotResult, nextState: ClassicBattleState): void {
    if (shot.path.length < 2) {
      this.setState(nextState);
      return;
    }

    const bullet = this.add.circle(
      this.toWorldX(shot.path[0].x),
      this.toWorldY(shot.path[0].y),
      this.sceneConfig.bulletRadius,
      0xffffff,
    );
    bullet.setDepth(2);

    const track = { t: 0 };
    const totalDuration = Math.max(200, shot.path.length * 12);

    this.tweens.add({
      targets: track,
      t: 1,
      duration: totalDuration,
      ease: 'Linear',
      onUpdate: () => {
        const progress = track.t * (shot.path.length - 1);
        const idx = Math.floor(progress);
        const nextIdx = Math.min(shot.path.length - 1, idx + 1);
        const localT = progress - idx;
        const from = shot.path[idx];
        const to = shot.path[nextIdx];
        bullet.x = this.toWorldX(Phaser.Math.Linear(from.x, to.x, localT));
        bullet.y = this.toWorldY(Phaser.Math.Linear(from.y, to.y, localT));
      },
      onComplete: () => {
        bullet.destroy();
        this.setState(nextState);
      },
    });
  }

  setPhysicsStat(stat: PhysicsEngineStat): void {
    this.physicsStat = stat;
    this.physicsPredictor.SetStat(stat);
    this.physicsStatReceivedAtMs = this.nowMs();
    this.applyPhysicsStat();
  }

  update(): void {
    this.applyPhysicsStat();
  }

  private renderPlayers(): void {
    this.state.players.forEach((player, index) => {
      const color = this.playerColors[player.id] ?? (index === 0 ? 0x8fd1ff : 0xffb085);
      const spawnX = this.toWorldX(player.x);
      const spawnY = this.toWorldY(player.y);
      const sprite = this.add.circle(spawnX, spawnY, this.sceneConfig.playerRadius, color);
      this.physics.add.existing(sprite, true);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setCircle(this.sceneConfig.playerRadius);
      const hitArea = new Phaser.Geom.Circle(
        this.sceneConfig.playerRadius,
        this.sceneConfig.playerRadius,
        this.sceneConfig.playerRadius,
      );
      sprite.setInteractive(hitArea, Phaser.Geom.Circle.Contains);
      const barsTopY = spawnY - this.sceneConfig.playerRadius - 18;
      const barLeftX = spawnX - this.statusBarWidth / 2;

      const hpBarBg = this.add
        .rectangle(spawnX, barsTopY, this.statusBarWidth, this.statusBarHeight, 0x2c3550, 0.85)
        .setDepth(1);
      const hpFill = this.add
        .rectangle(barLeftX, barsTopY, this.statusBarWidth, this.statusBarHeight, 0x59d98e, 1)
        .setOrigin(0, 0.5)
        .setDepth(2);

      const energyBarBg = this.add
        .rectangle(
          spawnX,
          barsTopY + this.statusBarHeight + this.statusBarGap,
          this.statusBarWidth,
          this.statusBarHeight,
          0x2c3550,
          0.85,
        )
        .setDepth(1);
      const energyFill = this.add
        .rectangle(
          barLeftX,
          barsTopY + this.statusBarHeight + this.statusBarGap,
          this.statusBarWidth,
          this.statusBarHeight,
          0x5db8ff,
          1,
        )
        .setOrigin(0, 0.5)
        .setDepth(2);

      const nameText = this.add
        .text(spawnX, barsTopY - 6, '', {
          fontFamily: this.uiFontFamily,
          fontSize: `${Math.max(12, this.uiFontSize - 4)}px`,
          color: '#cfe2ff',
        })
        .setOrigin(0.5, 1)
        .setDepth(2);

      this.playerVisuals.set(player.id, {
        sprite,
        nameLabel: nameText,
        hpBarBg,
        hpBarFill: hpFill,
        energyBarBg,
        energyBarFill: energyFill,
      });
    });

    this.setState(this.state);
  }

  private setupInput(): void {
    this.input.on('gameobjectdown', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (this.state.winnerId) {
        return;
      }

      const localSprite = this.playerVisuals.get(this.localPlayerId)?.sprite;
      if (!localSprite || gameObject !== localSprite) {
        return;
      }

      this.isDragging = true;
      this.dragOrigin.set(localSprite.x, localSprite.y);
      this.renderDragLine(pointer.x, pointer.y);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) {
        return;
      }

      this.renderDragLine(pointer.x, pointer.y);
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) {
        return;
      }

      this.isDragging = false;
      this.clearDragLine();

      const pullVector = new Phaser.Math.Vector2(this.dragOrigin.x - pointer.x, this.dragOrigin.y - pointer.y);
      const distance = pullVector.length();

      if (distance < this.sceneConfig.minPullDistance) {
        return;
      }

      const clampedVector = pullVector.normalize().scale(Math.min(distance, this.sceneConfig.maxPullDistance));
      this.onFire?.({
        shooterId: this.localPlayerId,
        pullX: clampedVector.x,
        pullY: clampedVector.y,
        bullet: this.selectedBullet,
      });
    });
  }

  private renderDragLine(pointerX: number, pointerY: number): void {
    this.dragLine?.clear();
    this.dragLine?.lineStyle(3, this.dragLineColor, 0.85);
    this.dragLine?.beginPath();
    this.dragLine?.moveTo(this.dragOrigin.x, this.dragOrigin.y);
    this.dragLine?.lineTo(pointerX, pointerY);
    this.dragLine?.strokePath();
  }

  private clearDragLine(): void {
    this.dragLine?.clear();
  }

  private applyPhysicsStat(): void {
    if (!this.physicsStat) {
      return;
    }

    const elapsedSeconds = Math.max(0, (this.nowMs() - this.physicsStatReceivedAtMs) / 1000);
    const horizon = Math.min(this.maxPredictionSeconds, elapsedSeconds);
    const predictedStat = horizon <= 0
      ? this.physicsStat
      : this.physicsPredictor.Predict(this.physicsStat.lastUpdateTime, this.physicsStat.lastUpdateTime + horizon);

    const visibleProjectileIds = new Set<string>();

    predictedStat.objects.forEach((object) => {
      if (object.type === 'player') {
        this.setPlayerVisualPosition(object.id, object.position.x, object.position.y);

        return;
      }

      const shouldRender = !object.grounded;
      if (!shouldRender) {
        return;
      }

      visibleProjectileIds.add(object.id);
      const worldX = this.toWorldX(object.position.x);
      const worldY = this.toWorldY(object.position.y);
      let projectile = this.projectileSprites.get(object.id);
      if (!projectile) {
        projectile = this.add.circle(worldX, worldY, object.radius, 0xffffff, 0.95);
        projectile.setDepth(3);
        this.projectileSprites.set(object.id, projectile);
      } else {
        projectile.setPosition(worldX, worldY);
      }
    });

    this.projectileSprites.forEach((sprite, projectileId) => {
      if (!visibleProjectileIds.has(projectileId)) {
        sprite.destroy();
        this.projectileSprites.delete(projectileId);
      }
    });
  }

  private nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }

    return Date.now();
  }

  private updatePlayerStatusBars(player: ClassicBattleState['players'][number]): void {
    const visual = this.playerVisuals.get(player.id);
    if (!visual) {
      return;
    }

    const hpFill = visual.hpBarFill;
    if (hpFill) {
      const hpRatio = player.maxHp > 0 ? Phaser.Math.Clamp(player.hp / player.maxHp, 0, 1) : 0;
      hpFill.setSize(this.statusBarWidth * hpRatio, this.statusBarHeight);
      hpFill.fillColor = hpRatio > 0.5 ? 0x59d98e : hpRatio > 0.25 ? 0xf8bf5a : 0xf56b6b;
    }

    const energyFill = visual.energyBarFill;
    if (energyFill) {
      const energyRatio = player.maxEnergy > 0 ? Phaser.Math.Clamp(player.energy / player.maxEnergy, 0, 1) : 0;
      energyFill.setSize(this.statusBarWidth * energyRatio, this.statusBarHeight);
      energyFill.fillColor = 0x5db8ff;
    }
  }

  private layoutBattlefield(): void {
    this.battlefieldOffset.x = Math.max(0, (this.scale.width - this.sceneConfig.width) / 2);
    this.battlefieldOffset.y = Math.max(0, (this.scale.height - this.sceneConfig.height) / 2);
  }

  private drawBattlefieldFrame(): void {
    if (!this.battlefieldFrame) {
      return;
    }

    this.battlefieldFrame.clear();
    this.battlefieldFrame.lineStyle(3, 0x6aa4ff, 0.75);
    this.battlefieldFrame.strokeRect(
      this.battlefieldOffset.x,
      this.battlefieldOffset.y,
      this.sceneConfig.width,
      this.sceneConfig.height,
    );
    this.battlefieldFrame.lineStyle(1, 0x9fc2ff, 0.5);
    this.battlefieldFrame.strokeRect(
      this.battlefieldOffset.x - 1,
      this.battlefieldOffset.y - 1,
      this.sceneConfig.width + 2,
      this.sceneConfig.height + 2,
    );
  }

  private setPlayerVisualPosition(playerId: string, battlefieldX: number, battlefieldY: number): void {
    const visual = this.playerVisuals.get(playerId);
    if (!visual) {
      return;
    }

    const worldX = this.toWorldX(battlefieldX);
    const worldY = this.toWorldY(battlefieldY);
    const barsTopY = worldY - this.sceneConfig.playerRadius - 18;
    const barLeftX = worldX - this.statusBarWidth / 2;

    visual.sprite.setPosition(worldX, worldY);
    visual.hpBarBg.setPosition(worldX, barsTopY);
    visual.hpBarFill.setPosition(barLeftX, barsTopY);
    visual.energyBarBg.setPosition(worldX, barsTopY + this.statusBarHeight + this.statusBarGap);
    visual.energyBarFill.setPosition(barLeftX, barsTopY + this.statusBarHeight + this.statusBarGap);
    visual.nameLabel.setPosition(worldX, barsTopY - 6);
  }

  private createBulletSelector(): void {
    this.bulletSelector = this.add.container(0, 0);
    this.bulletSelector.setDepth(20);

    const normalButton = this.createBulletButton('normal', 'Normal', this.sceneConfig.shotEnergyCost, 0);
    const moveButton = this.createBulletButton('move', 'Move', this.sceneConfig.moveShotEnergyCost, 1);

    this.bulletButtons.set('normal', normalButton);
    this.bulletButtons.set('move', moveButton);
    this.bulletSelector.add([normalButton.container, moveButton.container]);

    this.layoutBulletSelector();
    this.refreshBulletButtons();
  }

  private createBulletButton(
    bulletType: ClassicBattleBulletType,
    title: string,
    cost: number,
    index: number,
  ): BulletButtonVisual {
    const width = 134;
    const height = 58;
    const container = this.add.container(0, index * (height + 10));
    container.setSize(width, height);

    const background = this.add.graphics();
    container.add(background);

    const icon = this.add.graphics();
    icon.x = 18;
    icon.y = height / 2;
    if (bulletType === 'normal') {
      icon.fillStyle(0xe6f2ff, 0.95);
      icon.fillCircle(0, 0, 7);
      icon.lineStyle(2, 0x8ab5ff, 0.9);
      icon.strokeCircle(0, 0, 10);
    } else {
      icon.fillStyle(0xffcf8a, 0.95);
      icon.fillTriangle(-9, -6, 10, 0, -9, 6);
      icon.lineStyle(2, 0xff9f66, 0.95);
      icon.strokeTriangle(-11, -7, 12, 0, -11, 7);
    }
    container.add(icon);

    const titleText = this.add.text(34, 14, title, {
      fontFamily: this.uiFontFamily,
      fontSize: `${Math.max(12, this.uiFontSize - 2)}px`,
      color: '#eff6ff',
    });
    container.add(titleText);

    const subtitleText = this.add.text(34, 34, `Energy ${cost}`, {
      fontFamily: this.uiFontFamily,
      fontSize: '12px',
      color: '#b4caec',
    });
    container.add(subtitleText);

    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerdown', () => {
      this.selectedBullet = bulletType;
      this.refreshBulletButtons();
    });

    return {
      container,
      background,
      title: titleText,
      subtitle: subtitleText,
    };
  }

  private refreshBulletButtons(): void {
    this.bulletButtons.forEach((button, bulletType) => {
      const active = bulletType === this.selectedBullet;
      button.background.clear();
      button.background.fillStyle(active ? 0x4a79b7 : 0x112340, active ? 0.94 : 0.86);
      button.background.fillRoundedRect(0, 0, 134, 58, 10);
      button.background.lineStyle(2, active ? 0xffc57f : 0x6a92cf, active ? 0.95 : 0.65);
      button.background.strokeRoundedRect(0, 0, 134, 58, 10);
      button.title.setColor(active ? '#fff7e8' : '#eff6ff');
      button.subtitle.setColor(active ? '#ffe2bd' : '#b4caec');
    });
  }

  private layoutBulletSelector(): void {
    if (!this.bulletSelector) {
      return;
    }

    const margin = 20;
    const selectorWidth = 134;
    const selectorHeight = 58 * 2 + 10;
    this.bulletSelector.setPosition(this.scale.width - selectorWidth - margin, this.scale.height - selectorHeight - margin);
  }

  private handleResize(): void {
    this.layoutBattlefield();
    this.drawBattlefieldFrame();
    this.layoutBulletSelector();
    this.state.players.forEach((player) => {
      this.setPlayerVisualPosition(player.id, player.x, player.y);
    });
    this.applyPhysicsStat();
  }

  private toWorldX(x: number): number {
    return this.battlefieldOffset.x + x;
  }

  private toWorldY(y: number): number {
    return this.battlefieldOffset.y + y;
  }
}

export interface ClassicBattleGameOptions {
  parent: HTMLElement;
  config: ClassicBattleConfig;
  state: ClassicBattleState;
  physicsStat?: PhysicsEngineStat;
  localPlayerId: string;
  onFire?: (payload: ClassicBattleFirePayload) => void;
  playerColors?: Record<string, number>;
  dragLineColor?: number;
  uiFontFamily?: string;
  uiFontSize?: number;
  backgroundColor?: string;
}

export class ClassicBattleGame {
  private game: Phaser.Game;
  private scene: ClassicBattleScene;

  constructor(options: ClassicBattleGameOptions) {
    this.scene = new ClassicBattleScene({
      config: options.config,
      state: options.state,
      physicsStat: options.physicsStat,
      localPlayerId: options.localPlayerId,
      onFire: options.onFire,
      dragLineColor: options.dragLineColor,
      uiFontFamily: options.uiFontFamily,
      uiFontSize: options.uiFontSize,
      playerColors: options.playerColors,
      backgroundColor: options.backgroundColor,
    });

    const getViewportWidth = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      return Math.max(1, Math.floor(viewportWidth));
    };

    const getViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      return Math.max(1, Math.floor(viewportHeight));
    };

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: options.parent,
      width: getViewportWidth(),
      height: getViewportHeight(),
      backgroundColor: options.backgroundColor ?? '#0a1021',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: getViewportWidth(),
        height: getViewportHeight(),
      },
      scene: [this.scene],
    });
  }

  setState(state: ClassicBattleState): void {
    this.scene.setState(state);
  }

  playShot(shot: ClassicBattleShotResult, nextState: ClassicBattleState): void {
    this.scene.playShot(shot, nextState);
  }

  setPhysicsStat(stat: PhysicsEngineStat): void {
    this.scene.setPhysicsStat(stat);
  }

  destroy(): void {
    this.game.destroy(true);
  }
}
