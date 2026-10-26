import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/Icon';
import { useScreenInsets } from '@/ui/Screen';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

type Item = { icon: IconName; label: string; href?: Href };

/** Screen 01b: dropdown under the menu button. Items from later phases say so. */
export function HomeMenu({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const { t } = useI18n();
  const toast = useToast();
  const { top } = useScreenInsets();

  const items: Item[] = [
    { icon: 'repeat', label: t('menu.recurring') },
    { icon: 'landmark', label: t('menu.banks') },
    { icon: 'chart-column', label: t('menu.monthly') },
    { icon: 'arrow-up-down', label: t('menu.arrange'), href: '/reorder' },
    { icon: 'book-plus', label: t('menu.newLedger'), href: '/ledger/new' },
    { icon: 'user-plus', label: t('menu.friends') },
    { icon: 'settings', label: t('menu.settings'), href: '/settings' },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      <Pressable
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
      />
      <View
        accessibilityViewIsModal
        style={{
          position: 'absolute',
          right: 14,
          top: top + 54,
          width: 272,
          borderRadius: 28,
          backgroundColor: colors.bg,
          boxShadow: shadows.lg,
          padding: 8,
        }}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="menuitem"
            onPress={() => {
              onClose();
              if (item.href) router.push(item.href);
              else toast(t('common.comingSoon'));
            }}
            style={({ pressed }) => ({
              minHeight: 52,
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: pressed ? colors.surface : 'transparent',
            })}
          >
            <Icon name={item.icon} size={18} color={colors.accentRamp[700]} />
            <View style={{ flex: 1 }}>
              <Txt font="semibold" size={15} color={item.href ? colors.text : colors.neutral[600]}>
                {item.label}
              </Txt>
              {!item.href && (
                <Txt size={12} color={colors.neutral[600]}>
                  {t('common.comingSoon')}
                </Txt>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
