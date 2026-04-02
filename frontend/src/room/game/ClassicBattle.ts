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
  turnLabelColor?: string;
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
  private readonly turnLabelColor: string;
  private readonly uiFontFamily: string;
  private readonly uiFontSize: number;
  private readonly playerColors: Record<string, number>;
  private readonly backgroundColor: string;
  private playerSprites = new Map<string, Phaser.GameObjects.Arc>();
  private playerLabels = new Map<string, Phaser.GameObjects.Text>();
  private dragLine?: Phaser.GameObjects.Graphics;
  private dragOrigin = new Phaser.Math.Vector2();
  private isDragging = false;
  private isAnimating = false;
  private activeBullet?: Phaser.GameObjects.Arc;
  private turnLabel?: Phaser.GameObjects.Text;

  constructor(options: ClassicBattleSceneOptions) {
    super({ key: 'ClassicBattleScene' });
    this.sceneConfig = options.config;
    this.state = options.state;
    this.localPlayerId = options.localPlayerId;
    this.onFire = options.onFire;
    this.dragLineColor = options.dragLineColor ?? 0x8fd1ff;
    this.turnLabelColor = options.turnLabelColor ?? '#e6f2ff';
    this.uiFontFamily = options.uiFontFamily ?? 'Chakra Petch, sans-serif';
    this.uiFontSize = options.uiFontSize ?? 18;
    this.playerColors = options.playerColors ?? {};
    this.backgroundColor = options.backgroundColor ?? '#0a1021';
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.backgroundColor);
    this.physics.world.setBounds(0, 0, this.sceneConfig.width, this.sceneConfig.height);

    this.dragLine = this.add.graphics();
    this.renderPlayers();
    this.setupTurnLabel();
    this.setupInput();
  }

  setState(state: ClassicBattleState): void {
    this.state = state;
    this.state.players.forEach((player) => {
      const label = this.playerLabels.get(player.id);
      if (label) {
        label.setText(`${player.name} ${player.hp} HP`);
      }
    });
    this.updateTurnLabel();
  }

  playShot(shot: ClassicBattleShotResult, nextState: ClassicBattleState): void {
    if (this.isAnimating) {
      return;
    }

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
    this.activeBullet = bullet;
    this.isAnimating = true;

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
        this.activeBullet = undefined;
        this.isAnimating = false;
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

      const hpText = this.add
        .text(player.x, player.y - this.sceneConfig.playerRadius - 10, '', {
          fontFamily: this.uiFontFamily,
          fontSize: `${this.uiFontSize}px`,
          color: '#cfe2ff',
        })
        .setOrigin(0.5, 1);
      this.playerLabels.set(player.id, hpText);
    });

    this.setState(this.state);
  }

  private setupTurnLabel(): void {
    this.turnLabel = this.add
      .text(this.sceneConfig.width / 2, 16, '', {
        fontFamily: this.uiFontFamily,
        fontSize: `${this.uiFontSize}px`,
        color: this.turnLabelColor,
      })
      .setOrigin(0.5, 0);

    this.updateTurnLabel();
  }

  private setupInput(): void {
    this.input.on('gameobjectdown', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (this.state.winnerId || this.activeBullet || this.isAnimating) {
        return;
      }

      if (this.state.activePlayerId !== this.localPlayerId) {
        return;
      }

      const activeSprite = this.playerSprites.get(this.state.activePlayerId);
      if (!activeSprite || gameObject !== activeSprite) {
        return;
      }

      this.isDragging = true;
      this.dragOrigin.set(activeSprite.x, activeSprite.y);
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
        shooterId: this.state.activePlayerId,
        pullX: clampedVector.x,
        pullY: clampedVector.y,
      });
    });
  }

  private updateTurnLabel(): void {
    const activePlayer = this.state.players.find((player) => player.id === this.state.activePlayerId);
    this.turnLabel?.setText(`回合：${activePlayer?.name ?? ''}`);
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
}

export interface ClassicBattleGameOptions {
  parent: HTMLElement;
  config: ClassicBattleConfig;
  state: ClassicBattleState;
  localPlayerId: string;
  onFire?: (payload: ClassicBattleFirePayload) => void;
  playerColors?: Record<string, number>;
  dragLineColor?: number;
  turnLabelColor?: string;
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
      turnLabelColor: options.turnLabelColor,
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
