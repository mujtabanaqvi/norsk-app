import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { Screen, AppHeader, Card } from '../components/ui';
import { LegalContactCard } from '../components/LegalContactCard';
import { useLocale } from '../hooks/useLocale';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacyPolicy'>;

export const PrivacyPolicyScreen: React.FC<Props> = ({ navigation }) => {
  const { t, strings } = useLocale();
  return (
    <Screen>
      <AppHeader
        title={t('nav.privacy')}
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <Text style={styles.lastUpdated}>{strings.privacy.lastUpdated}</Text>

          {strings.privacy.sections.map((section) => (
            <Card key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.paragraph}>{section.body}</Text>
            </Card>
          ))}

          <LegalContactCard document="privacy" />
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
