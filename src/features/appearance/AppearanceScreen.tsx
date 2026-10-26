import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { ACCENT_THEMES, BG_THEMES, type AccentTheme, type BgTheme, type BubbleOpacity } from '@/lib/domain';
import { PillButton, SectionLabel } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { buildPalette } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { shrinkPhoto, type PickedPhoto } from './shrinkPhoto';
import { usePhotoUrl, WASHED } from './useHomePhoto';

/** Screen 15 (+15b): background and accent colours, home photo with preview, bubble transparency. */
export function AppearanceScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { profile } = useAppData();
  const currentUrl = usePhotoUrl(profile.homePhoto);
  // A chosen photo is only a preview until "Use this photo".
  const [pending, setPending] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = pending?.uri ?? currentUrl;

  const choose = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPending(await shrinkPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' }));
  };

  const apply = async (photo: PickedPhoto | null) => {
    setBusy(true);
    const result = await repo.setHomePhoto(photo);
    setBusy(false);
    if (result === 'offline') return toast(t('appearance.photoOffline'));
    setPending(null);
    toast(photo ? t('appearance.photoSaved') : t('appearance.photoRemoved'));
  };

  return (
    <Screen>
      <ScreenHeader title={t('appearance.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 18, gap: 22 }}>
        <View style={{ gap: 10 }}>
          <SectionLabel>{t('appearance.bgColour')}</SectionLabel>
          <SwatchGrid
            options={BG_THEMES}
            selected={profile.bgTheme}
            colorOf={(id) => buildPalette(id, profile.accentTheme).bg}
            checkColor={colors.text}
            onSelect={(bgTheme) => repo.updateProfile({ bgTheme })}
          />
        </View>
        <View style={{ gap: 10 }}>
          <SectionLabel>{t('appearance.accent')}</SectionLabel>
          <SwatchGrid
            options={ACCENT_THEMES}
            selected={profile.accentTheme}
            colorOf={(id) => buildPalette(profile.bgTheme, id).accent}
            checkColor={colors.bg}
            onSelect={(accentTheme) => repo.updateProfile({ accentTheme })}
          />
        </View>
        <View style={{ gap: 10 }}>
          <SectionLabel>{t('appearance.homeBg')}</SectionLabel>
          <View style={{ borderRadius: 28, backgroundColor: colors.surface, padding: 14, gap: 14 }}>
            <View
              style={{
                height: 190,
                borderRadius: 22,
                overflow: 'hidden',
                backgroundColor: colors.neutral[200],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {shown ? (
                <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, filter: WASHED }}>
                  <Image
                    source={{ uri: shown }}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                    style={{ width: '100%', height: '100%' }}
                  />
                </View>
              ) : (
                <Txt size={12} color={colors.neutral[700]}>
                  {t('appearance.yourPhoto')}
                </Txt>
              )}
              {pending && (
                <View
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: 12,
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: colors.bg,
                  }}
                >
                  <Txt font="bold" size={12}>
                    {t('appearance.preview')}
                  </Txt>
                </View>
              )}
            </View>
            {pending ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PillButton
                  label={t('appearance.usePhoto')}
                  icon="check"
                  height={48}
                  fontSize={16}
                  flex
                  disabled={busy}
                  onPress={() => void apply(pending)}
                />
                <PillButton
                  label={t('common.cancel')}
                  variant="outline"
                  height={48}
                  fontSize={16}
                  onPress={() => setPending(null)}
                />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PillButton
                  label={profile.homePhoto ? t('appearance.changePhoto') : t('appearance.choosePhoto')}
                  icon="image"
                  onPress={() => void choose()}
                />
                {profile.homePhoto && (
                  <PillButton
                    label={t('appearance.remove')}
                    variant="outline"
                    disabled={busy}
                    onPress={() => void apply(null)}
                  />
                )}
              </View>
            )}
          </View>
          <View style={{ gap: 8, paddingTop: 6 }}>
            <SectionLabel>{t('appearance.panel')}</SectionLabel>
            <Segmented<BubbleOpacity>
              value={profile.bubbleOpacity}
              onChange={(bubbleOpacity) => repo.updateProfile({ bubbleOpacity })}
              options={[
                { value: 'solid', label: t('appearance.solid') },
                { value: 'semi', label: t('appearance.semi') },
                { value: 'clear', label: t('appearance.clear') },
              ]}
            />
          </View>
          <Txt size={12} lineHeight={17} color={colors.neutral[700]} style={{ paddingHorizontal: 8 }}>
            {t('appearance.panelNote')}
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** 52 px swatches in a five-column card; the selected one has a check and a double ring. */
function SwatchGrid<T extends BgTheme | AccentTheme>({
  options,
  selected,
  colorOf,
  checkColor,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  colorOf: (id: T) => string;
  checkColor: string;
  onSelect: (id: T) => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        borderRadius: 28,
        backgroundColor: colors.surface,
        paddingVertical: 18,
        paddingHorizontal: 12,
        flexDirection: 'row',
      }}
    >
      {options.map((id) => {
        const on = id === selected;
        const label = t(`theme.${id}`);
        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityLabel={label}
            onPress={() => onSelect(id)}
            style={{ flex: 1, alignItems: 'center', gap: 8 }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: colorOf(id),
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: on
                  ? `0px 0px 0px 3px ${colors.surface}, 0px 0px 0px 5px ${colors.text}`
                  : undefined,
              }}
            >
              {on && <Icon name="check" size={22} color={checkColor} />}
            </View>
            <Txt font="semibold" size={12}>
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
