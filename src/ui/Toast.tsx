import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useColors } from './theme/ThemeProvider';
import { Txt } from './Txt';

const TOAST_MS = 2400;

const ToastContext = createContext<(message: string) => void>(() => {});

/** Dark pill, 118px from the bottom, about 2.4 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: 16, right: 16, bottom: 118, alignItems: 'center', zIndex: 50 }}
        >
          <View
            style={{
              backgroundColor: colors.neutral[900],
              borderRadius: 999,
              paddingHorizontal: 20,
              paddingVertical: 12,
              maxWidth: '100%',
            }}
          >
            <Txt font="semibold" size={14} color={colors.neutral[100]} align="center">
              {message}
            </Txt>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
