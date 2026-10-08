/**
 * 把 LocalUser 和 FishUser 组合为「对外展示用」的身份。
 *
 * - id 始终来自 LocalUser，保证 clientId 稳定（与登录关联前生成的房间仍能恢复）。
 * - name/avatar 优先取已登录 FishUser；若摸鱼岛未登录或返回字段为空，回落到 LocalUser。
 */
import { getCachedFishUser, type FishUser } from './fishUser';
import type { LocalUser } from './localUser';

export interface EffectiveIdentity {
  /** 稳定 clientId，用于联机会话。 */
  id: string;
  name: string;
  avatar?: string;
  /** 是否由摸鱼岛登录态提供。 */
  fromFishUser: boolean;
}

export function localUserToEffective(
  localUser: LocalUser,
  fishUser: FishUser | null = getCachedFishUser(),
): EffectiveIdentity {
  const trimmedFishName = fishUser?.name?.trim();
  if (trimmedFishName) {
    const avatar = fishUser?.avatar?.trim();
    return {
      id: localUser.id,
      name: trimmedFishName.slice(0, 24),
      ...(avatar ? { avatar } : {}),
      fromFishUser: true,
    };
  }
  return {
    id: localUser.id,
    name: localUser.name,
    fromFishUser: false,
  };
}