// ?debug=1 — 바닥 띠, 장애물, 상호작용 지점, 구역 경계를 겹쳐 보여주고 카메라·캐릭터 좌표를 표시한다.

import { layerOffsetX, type Camera } from './camera';
import { footRect, type Character } from './character/character';
import { DEBUG, DEBUG_COLORS, LAYER_FACTORS } from './constants';
import { INTERACTION_POINTS, OBSTACLES, WALK_AREA } from './world';
import type { Zone } from './zones/zone';

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  character: Character,
  zones: readonly Zone[],
): void {
  const ox = layerOffsetX(camera, LAYER_FACTORS.main);
  const pad = DEBUG.labelOffset;
  ctx.save();
  ctx.font = DEBUG.font;
  ctx.textBaseline = 'top';
  ctx.lineWidth = 1;

  // 구역 경계
  ctx.strokeStyle = DEBUG_COLORS.zoneLine;
  ctx.fillStyle = DEBUG_COLORS.zoneLine;
  for (const zone of zones) {
    const x = zone.startX - ox + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WALK_AREA.y + WALK_AREA.h);
    ctx.stroke();
    ctx.fillText(`${zone.name} ${zone.startX}~${zone.endX}`, zone.startX - ox + pad, pad);
  }

  // 걷는 바닥 띠
  ctx.strokeStyle = DEBUG_COLORS.walkArea;
  ctx.strokeRect(WALK_AREA.x - ox + 0.5, WALK_AREA.y + 0.5, WALK_AREA.w - 1, WALK_AREA.h - 1);
  ctx.fillStyle = DEBUG_COLORS.walkArea;
  ctx.fillText('WALK_AREA', WALK_AREA.x - ox + pad, WALK_AREA.y + WALK_AREA.h - DEBUG.hudLineHeight);

  // 장애물
  for (const o of OBSTACLES) {
    ctx.fillStyle = DEBUG_COLORS.obstacle;
    ctx.fillRect(o.x - ox, o.y, o.w, o.h);
    ctx.fillStyle = DEBUG_COLORS.obstacleLabel;
    ctx.fillText(o.id, o.x - ox + pad, o.y + pad);
  }

  // 상호작용 지점
  ctx.fillStyle = DEBUG_COLORS.point;
  const half = Math.floor(DEBUG.pointSize / 2);
  for (const p of INTERACTION_POINTS) {
    ctx.fillRect(Math.round(p.x) - ox - half, Math.round(p.y) - half, DEBUG.pointSize, DEBUG.pointSize);
    ctx.fillText(p.id, Math.round(p.x) - ox + DEBUG.pointSize, Math.round(p.y) + half);
  }

  // 캐릭터 발 상자와 탭 목적지
  const foot = footRect(character.x, character.y);
  ctx.strokeStyle = DEBUG_COLORS.foot;
  ctx.strokeRect(Math.round(foot.x) - ox + 0.5, Math.round(foot.y) + 0.5, foot.w - 1, foot.h - 1);
  if (character.target) {
    ctx.fillStyle = DEBUG_COLORS.target;
    ctx.fillRect(Math.round(character.target.x) - ox - half, Math.round(character.target.y) - half, DEBUG.pointSize, DEBUG.pointSize);
  }

  // 구석 표시
  const lines = [
    `camera x ${camera.x.toFixed(1)}`,
    `char x ${character.x.toFixed(1)} y ${character.y.toFixed(1)}`,
  ];
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + DEBUG.hudPadding * 2;
  const top = DEBUG.hudLineHeight + pad * 2;
  ctx.fillStyle = DEBUG_COLORS.hudBackground;
  ctx.fillRect(pad, top, width, lines.length * DEBUG.hudLineHeight + DEBUG.hudPadding * 2);
  ctx.fillStyle = DEBUG_COLORS.hudText;
  lines.forEach((line, i) => {
    ctx.fillText(line, pad + DEBUG.hudPadding, top + DEBUG.hudPadding + i * DEBUG.hudLineHeight);
  });

  ctx.restore();
}
