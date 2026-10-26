import type { TFunction } from 'i18next';
import { View } from 'react-native';

import type { Ledger, LedgerMember } from '@/lib/domain';
import type { Palette } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/** "You" for the signed-in user, otherwise the member's name. */
export function memberName(member: LedgerMember | undefined, myUid: string, t: TFunction): string {
  if (!member) return '?';
  if (member.uid === myUid) return t('home.you');
  return member.name || '?';
}

/** Avatar fills from the design: me accent-300, then sage / neutral / accent tints. */
export function avatarColor(colors: Palette, index: number, isMe: boolean): string {
  if (isMe) return colors.accentRamp[300];
  const tints = [
    colors.accent2Ramp[300],
    colors.neutral[300],
    colors.accentRamp[200],
    colors.accent2Ramp[200],
    colors.neutral[200],
  ];
  return tints[index % tints.length];
}

/** Colour for a member of a ledger, stable for the ledger's member order. */
export function memberColor(colors: Palette, ledger: Ledger, memberId: string, myUid: string): string {
  const others = ledger.members.filter((m) => m.uid !== myUid);
  const member = ledger.members.find((m) => m.id === memberId);
  return avatarColor(
    colors,
    Math.max(
      0,
      others.findIndex((m) => m.id === memberId),
    ),
    member?.uid === myUid,
  );
}

export function Avatar({
  name,
  color,
  size = 30,
  dashed,
  ring,
}: {
  name: string;
  color: string;
  size?: number;
  /** Placeholder friends: dashed outline, no fill. */
  dashed?: boolean;
  /** Overlapping avatars get a `bg` ring. */
  ring?: string;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: dashed ? 'transparent' : color,
        borderWidth: dashed ? 2 : ring ? 2 : 0,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: dashed ? colors.neutral[500] : ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt font="bold" size={Math.round(size * 0.4)}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Txt>
    </View>
  );
}
