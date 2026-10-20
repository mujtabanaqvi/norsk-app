import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { Screen, AppHeader, Card, BrandText } from '../components/ui';
import { useLocale } from '../hooks/useLocale';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Terms'>;

/** Swaps the `{brand}` placeholder for the styled wordmark. */
function withBrand(text: string): React.ReactNode {
  const [before, after] = text.split('{brand}');
  if (after === undefined) return text;
  return (
    <>
      {before}
      <BrandText />
      {after}
    </>
  );
}

export const TermsScreen: React.FC<Props> = ({ navigation }) => {
  const { t, strings } = useLocale();
  return (
    <Screen>
      <AppHeader
        title={t('nav.terms')}
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <Text style={styles.lastUpdated}>{strings.terms.lastUpdated}</Text>

          {strings.terms.sections.map((section) => (
            <Card key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.paragraph}>{withBrand(section.body)}</Text>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  container: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: space.md,
  },
  lastUpdated: {
    ...type.caption,
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  section: {
    gap: space.xs,
  },
  sectionTitle: {
    ...type.heading,
  },
  paragraph: {
    ...type.body,
  },
});
