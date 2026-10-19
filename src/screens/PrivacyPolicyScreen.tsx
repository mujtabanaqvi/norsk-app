import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { Screen, AppHeader, Card } from '../components/ui';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacyPolicy'>;

export const PrivacyPolicyScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <Screen>
      <AppHeader
        title="Personvernerklæring"
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <Text style={styles.lastUpdated}>Sist oppdatert: Oktober 2026</Text>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>1. Behandling av personopplysninger</Text>
            <Text style={styles.paragraph}>
              Vi tar personvernet ditt på største alvor. Vi lagrer din registrerte e-post, navn og progresjon
              for å tilby tjenesten i samsvar med gjeldende personvernlovgivning (GDPR).
            </Text>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>2. Lydopptak og transkribering</Text>
            <Text style={styles.paragraph}>
              Når du gjennomfører en muntlig prøve, sendes taleopptakene sikkert til talegjenkjenning (Speech-to-Text)
              for å vurdere uttale, ordforråd og flyt. Lydopptakene brukes utelukkende for å gi deg tilbakemelding
              og lagres ikke permanent for modelltrening.
            </Text>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>3. Dine rettigheter</Text>
            <Text style={styles.paragraph}>
              Du har rett til innsyn i egne data, retting eller sletting av din konto og tilhørende transkripsjoner
              ved å kontakte support eller slette kontoen din.
            </Text>
          </Card>
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
