import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { Screen, AppHeader, Card, Badge, Icon } from '../components/ui';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'HowTo'>;

const STEPS = [
  {
    number: '1',
    badge: 'DEL 1',
    title: 'Individuell presentasjon (Monolog)',
    description:
      'Sensoren stiller et oppstartsspørsmål knyttet til et valgt tema. Du snakker i ca. 1,5–2 minutter om temaet uten avbrytelser.',
  },
  {
    number: '2',
    badge: 'DEL 2',
    title: 'Samtale med medkandidat',
    description:
      'Du diskuterer et dilemma eller et tema sammen med en medkandidat. I appen kan du øve alene med en interaktiv AI-medkandidat, eller dele mikrofonen med en venn ved siden av deg.',
  },
  {
    number: '3',
    badge: 'DEL 3',
    title: 'Oppfølgingsspørsmål fra sensor',
    description:
      'Sensoren stiller fordypende spørsmål for å teste evnen din til å reflektere, begrunne meninger og bruke et nyansert ordforråd på B1- eller B2-nivå.',
  },
];

export const HowToScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <Screen>
      <AppHeader
        title="Slik fungerer prøven"
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.introBox}>
            <View style={styles.introHeaderRow}>
              <Icon name="information-circle" size={20} color={colors.navy} />
              <Text style={styles.introTitle}>Offisiell HK-dir B1/B2 Eksamenssimulator</Text>
            </View>
            <Text style={styles.introText}>
              Simulatoren er bygget etter retningslinjene til Direktoratet for høyere utdanning og kompetanse (HK-dir)
              og trener deg på den muntlige delen av Norskprøven.
            </Text>
          </View>

          {STEPS.map((step) => (
            <Card key={step.number} style={styles.stepCard}>
              <View style={styles.stepTopRow}>
                <View style={styles.stepCircle}>
                  <Text style={styles.stepCircleText}>{step.number}</Text>
                </View>
                <Badge label={step.badge} tone="navy" />
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </Card>
          ))}

          <Card style={styles.evalCard}>
            <View style={styles.stepTopRow}>
              <View style={styles.evalCircle}>
                <Icon name="checkmark" size={16} color={colors.white} />
              </View>
              <Badge label="VURDERING" tone="success" />
            </View>
            <Text style={styles.stepTitle}>Umiddelbar tilbakemelding & poeng</Text>
            <Text style={styles.stepDescription}>
              Etter fullført prøve vurderes din tale automatisk etter 5 offisielle kriterier: flyt, uttale,
              vokabular, grammatikk og oppgaveforståelse.
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
  introBox: {
    backgroundColor: colors.navySoft,
    padding: space.lg,
    borderRadius: 16,
    gap: space.xs,
  },
  introHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  introTitle: {
    ...type.heading,
    flex: 1,
  },
  introText: {
    ...type.body,
  },
  stepCard: {
    gap: space.sm,
  },
  evalCard: {
    gap: space.sm,
    borderColor: colors.success,
  },
  stepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: 2,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evalCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  stepTitle: {
    ...type.heading,
  },
  stepDescription: {
    ...type.body,
  },
});
