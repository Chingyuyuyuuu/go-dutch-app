import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useRepo } from '@/data/AppDataProvider';
import type { ShareLink } from '@/data/sync/SyncEngine';
import { shareText, webBaseUrl } from '@/features/friends/invites';
import { useI18n } from '@/i18n';
import type { Ledger } from '@/lib/domain';
import { PillButton } from '@/ui/Buttons';
import { Sheet } from '@/ui/Overlay';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/** The share page address for a link token: https://<site>/s/<token>. */
export function sharePageUrl(token: string): string | null {
  const base = webBaseUrl();
  return base ? `${base}/s/${token}` : null;
}

/**
 * Screen 28: the shared ledger's no-login share link (spec §6B.1). Copy, share,
 * QR code; turn it off, or replace it with a new one. Needs the network.
 */
export function ShareSheet({ ledger, onClose }: { ledger: Ledger; onClose: () => void }) {
  const colors = useColors();
  const { t } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const [link, setLink] = useState<ShareLink | null>(null);
  const [busy, setBusy] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);

  const run = async (action: 'regenerate' | 'revoke') => {
    setBusy(true);
    const result = await repo.shareLink(ledger.id, action);
    setBusy(false);
    if (result === 'demo' || result === 'offline') {
      toast(t(result === 'demo' ? 'share.demo' : 'share.offline'));
      return onClose();
    }
    setLink(result);
    if (action === 'revoke') toast(t('share.revokedToast'));
    if (action === 'regenerate') toast(t('share.regeneratedToast'));
  };

  // The link as it is when the sheet opens (made if the ledger never had one).
  useEffect(() => {
    let live = true;
    void repo.shareLink(ledger.id, 'open').then((result) => {
      if (!live) return;
      setBusy(false);
      if (result === 'demo' || result === 'offline') {
        toast(t(result === 'demo' ? 'share.demo' : 'share.offline'));
        onClose();
      } else {
        setLink(result);
      }
    });
    return () => {
      live = false;
    };
  }, [repo, ledger.id, toast, t, onClose]);

  const url = link?.live ? sharePageUrl(link.token) : null;

  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 20, gap: 14 }}>
      <Txt font="heading" size={24} lineHeight={28} style={{ paddingTop: 10 }}>
        {t('share.title', { name: ledger.name })}
      </Txt>
      <Txt size={13} lineHeight={19} color={colors.neutral[700]}>
        {t('share.body')}
      </Txt>
      {!link ? (
        <Txt size={14} color={colors.neutral[700]}>
          {t('share.loading')}
        </Txt>
      ) : !link.live ? (
        <>
          <Txt size={14}>{t('share.off')}</Txt>
          <PillButton label={t('share.regenerate')} disabled={busy} onPress={() => void run('regenerate')} />
        </>
      ) : !url ? (
        <Txt size={14}>{t('share.noWebUrl')}</Txt>
      ) : (
        <>
          <View style={{ padding: 14, borderRadius: 20, backgroundColor: colors.surface }}>
            <Txt size={13} selectable numberOfLines={2}>
              {url}
            </Txt>
          </View>
          {qrOpen && (
            <View
              style={{ alignItems: 'center', padding: 12, borderRadius: 24, backgroundColor: colors.white }}
            >
              <QRCode value={url} size={200} color={colors.text} backgroundColor={colors.white} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PillButton
              label={t('share.copy')}
              icon="link"
              flex
              onPress={async () => {
                await Clipboard.setStringAsync(url);
                toast(t('share.copied'));
              }}
            />
            <PillButton
              label={t('share.send')}
              icon="share-2"
              variant="sage"
              flex
              onPress={async () => {
                const result = await shareText(t('share.message', { name: ledger.name, url }), url);
                if (result === 'copied') toast(t('share.copied'));
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PillButton
              label={qrOpen ? t('share.hideQr') : t('share.qr')}
              icon="qr-code"
              variant="outline"
              height={44}
              fontSize={14}
              bodyFont
              onPress={() => setQrOpen((v) => !v)}
            />
            <PillButton
              label={t('share.regenerate')}
              variant="outline"
              height={44}
              fontSize={14}
              bodyFont
              disabled={busy}
              onPress={() => void run('regenerate')}
            />
            <PillButton
              label={t('share.revoke')}
              variant="ghost"
              height={44}
              fontSize={14}
              bodyFont
              disabled={busy}
              onPress={() => void run('revoke')}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}
