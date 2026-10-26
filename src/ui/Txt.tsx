import { Text, type TextProps, type TextStyle } from 'react-native';

import { fonts } from './theme/fonts';
import { useColors } from './theme/ThemeProvider';

type Font = 'heading' | 'body' | 'semibold' | 'bold';

const FAMILY: Record<Font, string> = {
  heading: fonts.heading,
  body: fonts.body,
  semibold: fonts.bodySemiBold,
  bold: fonts.bodyBold,
};

export type TxtProps = TextProps & {
  font?: Font;
  size?: number;
  color?: string;
  /** Tabular numbers for amounts. */
  tabular?: boolean;
  /** Section label style: uppercase, 0.08em tracking. */
  caps?: boolean;
  align?: TextStyle['textAlign'];
  lineHeight?: number;
};

export function Txt({
  font = 'body',
  size = 15,
  color,
  tabular,
  caps,
  align,
  lineHeight,
  style,
  ...rest
}: TxtProps) {
  const colors = useColors();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: FAMILY[font],
          fontSize: size,
          color: color ?? colors.text,
          textAlign: align,
          lineHeight,
        },
        tabular && { fontVariant: ['tabular-nums'] },
        caps && { textTransform: 'uppercase', letterSpacing: size * 0.08 },
        style,
      ]}
    />
  );
}
