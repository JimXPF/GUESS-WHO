import type { Request } from 'express';

/**
 * 玩家唯一标识：请求头 X-User-Id（浏览器 localStorage 设备 UUID）优先；
 * 无头时回退 IP（同网段会碰撞，仅作兜底）。
 */
export function getClientKey(req: Request): string {
  const userId = req.header('x-user-id')?.trim();
  if (userId) return `uid:${userId.slice(0, 128)}`;

  const forwarded = req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return `ip:${first}`;
  }

  const realIp = req.header('x-real-ip')?.trim();
  if (realIp) return `ip:${realIp}`;

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}
