import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { Screen, AppHeader, Card, BrandText } from '../components/ui';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Terms'>;

export const TermsScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <Screen>
      <AppHeader
        title="Vilkår for bruk"
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <Text style={styles.lastUpdated}>Sist oppdatert: Oktober 2026</Text>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>1. Aksept av vilkår</Text>
            <Text style={styles.paragraph}>
              Ved å opprette en brukerkonto eller benytte <BrandText /> (Norskprøven Muntlig Simulator), samtykker du til disse
              vilkårene. Tjenesten tilbys som et øvingsverktøy til forberedelse til den offisielle Norskprøven.
            </Text>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>2. Brukerkonto og autentisering</Text>
            <Text style={styles.paragraph}>
              For å få tilgang til muntlige prøver, taleopptak og lagrede vurderinger må du opprette en personlig
              brukerkonto. Du er ansvarlig for å opprettholde konfidensialiteten til din innloggingsinformasjon.
            </Text>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>3. Abonnement og kvoter</Text>
            <Text style={styles.paragraph}>
              Gratisbrukere har tilgang til 1 prøve per dag. Standard- og Premium-abonnement gir utvidet daglig
              testkvote og tilgang til ytterligere funksjoner. Betalinger behandles sikkert via Stripe.
            </Text>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>4. Ansvarsfraskrivelse</Text>
            <Text style={styles.paragraph}>
              Simulatoren gir veiledende tilbakemeldinger basert på kunstig intelligens og HK-dirs vurderingskriterier.
              Resultater i simulatoren garanterer ikke et spesifikt resultat på den offisielle eksamenen.
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
