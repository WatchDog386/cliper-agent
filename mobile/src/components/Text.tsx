import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, type, type TypeVariant } from '../theme';

interface Props extends TextProps {
  variant?: TypeVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
  /** Kept for older call sites: colours are always used exactly as given. */
  fixedColor?: boolean;
}

export function Text({ variant = 'body', color = colors.text, align, fixedColor: _fixed, style, ...rest }: Props) {
  return <RNText {...rest} style={[type[variant] as TextStyle, { color, textAlign: align }, style]} />;
}
