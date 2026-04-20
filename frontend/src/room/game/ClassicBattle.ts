import Phaser from 'phaser';
import { ClassicBattleConfig, ClassicBattleShotResult, ClassicBattleState } from 'shared';

export interface ClassicBattleFirePayload {
  shooterId: string;
  pullX: number;
  pullY: number;
}

export interface ClassicBattleRendererOptions {
  config: ClassicBattleConfig;
  state: ClassicBattleState;
  localPlayerId: string;
  onFire?: (payload: ClassicBattleFirePayload) => void;
  dragLineColor?: number;
  uiFontFamily?: string;
  uiFontSize?: number;
  playerColors?: Record<string, number>;
  backgroundColor?: string;
}

interface ClassicBattleSceneOptions extends ClassicBattleRendererOptions {}

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
  private playerSprites = new Map<string, Phaser.GameObjects.Arc>();
  private playerNameLabels = new Map<string, Phaser.GameObjects.Text>();
  private hpBarFills = new Map<string, Phaser.GameObjects.Rectangle>();
  private energyBarFills = new Map<string, Phaser.GameObjects.Rectangle>();
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
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.backgroundColor);
    this.physics.world.setBounds(0, 0, this.sceneConfig.width, this.sceneConfig.height);

    this.dragLine = this.add.graphics();
    this.renderPlayers();
    this.setupInput();
  }

  setState(state: ClassicBattleState): void {
    this.state = state;
    this.state.players.forEach((player) => {
      const label = this.playerNameLabels.get(player.id);
      if (label) {
        label.setText(player.name);
      }

      this.updatePlayerStatusBars(player);
    });
  }

  playShot(shot: ClassicBattleShotResult, nextState: ClassicBattleState): void {
    if (shot.path.length < 2) {
      this.setState(nextState);
      return;
    }

    const bullet = this.add.circle(
      shot.path[0].x,
      shot.path[0].y,
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
        bullet.x = Phaser.Math.Linear(from.x, to.x, localT);
        bullet.y = Phaser.Math.Linear(from.y, to.y, localT);
      },
      onComplete: () => {
        bullet.destroy();
        this.setState(nextState);
      },
    });
  }

  private renderPlayers(): void {
    this.state.players.forEach((player, index) => {
      const color = this.playerColors[player.id] ?? (index === 0 ? 0x8fd1ff : 0xffb085);
      const sprite = this.add.circle(player.x, player.y, this.sceneConfig.playerRadius, color);
      this.physics.add.existing(sprite, true);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setCircle(this.sceneConfig.playerRadius);
      const hitArea = new Phaser.Geom.Circle(
        this.sceneConfig.playerRadius,
        this.sceneConfig.playerRadius,
        this.sceneConfig.playerRadius,
      );
      sprite.setInteractive(hitArea, Phaser.Geom.Circle.Contains);
      this.playerSprites.set(player.id, sprite);

      const barsTopY = player.y - this.sceneConfig.playerRadius - 18;
      const barLeftX = player.x - this.statusBarWidth / 2;

      this.add
        .rectangle(player.x, barsTopY, this.statusBarWidth, this.statusBarHeight, 0x2c3550, 0.85)
        .setDepth(1);
      const hpFill = this.add
        .rectangle(barLeftX, barsTopY, this.statusBarWidth, this.statusBarHeight, 0x59d98e, 1)
        .setOrigin(0, 0.5)
        .setDepth(2);
      this.hpBarFills.set(player.id, hpFill);

      this.add
        .rectangle(
          player.x,
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
      this.energyBarFills.set(player.id, energyFill);

      const nameText = this.add
        .text(player.x, barsTopY - 6, '', {
          fontFamily: this.uiFontFamily,
          fontSize: `${Math.max(12, this.uiFontSize - 4)}px`,
          color: '#cfe2ff',
        })
        .setOrigin(0.5, 1)
        .setDepth(2);
      this.playerNameLabels.set(player.id, nameText);
    });

    this.setState(this.state);
  }

  private setupInput(): void {
    this.input.on('gameobjectdown', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (this.state.winnerId) {
        return;
      }

      const localSprite = this.playerSprites.get(this.localPlayerId);
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

  private updatePlayerStatusBars(player: ClassicBattleState['players'][number]): void {
    const hpFill = this.hpBarFills.get(player.id);
    if (hpFill) {
      const hpRatio = player.maxHp > 0 ? Phaser.Math.Clamp(player.hp / player.maxHp, 0, 1) : 0;
      hpFill.setSize(this.statusBarWidth * hpRatio, this.statusBarHeight);
      hpFill.fillColor = hpRatio > 0.5 ? 0x59d98e : hpRatio > 0.25 ? 0xf8bf5a : 0xf56b6b;
    }

    const energyFill = this.energyBarFills.get(player.id);
    if (energyFill) {
      const energyRatio = player.maxEnergy > 0 ? Phaser.Math.Clamp(player.energy / player.maxEnergy, 0, 1) : 0;
      energyFill.setSize(this.statusBarWidth * energyRatio, this.statusBarHeight);
      energyFill.fillColor = 0x5db8ff;
    }
  }
}

export interface ClassicBattleGameOptions {
  parent: HTMLElement;
  config: ClassicBattleConfig;
  state: ClassicBattleState;
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
      localPlayerId: options.localPlayerId,
      onFire: options.onFire,
      dragLineColor: options.dragLineColor,
      uiFontFamily: options.uiFontFamily,
      uiFontSize: options.uiFontSize,
      playerColors: options.playerColors,
      backgroundColor: options.backgroundColor,
    });

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: options.parent,
      width: options.config.width,
      height: options.config.height,
      backgroundColor: options.backgroundColor ?? '#0a1021',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: options.config.width,
        height: options.config.height,
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

  destroy(): void {
    this.game.destroy(true);
  }
}
