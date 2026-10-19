import React from 'react';
import { StatusBar, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '../../theme';

interface ScreenProps {
  children: React.ReactNode;
  /** Background color; defaults to the off-white app background. */
  background?: string;
  /** Use light status bar text (for navy/red headers). */
  lightStatusBar?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  background = colors.bg,
  lightStatusBar = false,
  edges,
  style,
}) => (
  <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: background }, style]}>
    <StatusBar
      barStyle={lightStatusBar ? 'light-content' : 'dark-content'}
      backgroundColor={background}
    />
    {children}
  </SafeAreaView>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
});

