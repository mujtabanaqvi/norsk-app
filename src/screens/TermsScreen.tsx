import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';

type Props = NativeStackScreenProps<RootStackParamList, 'Terms'>;

export const TermsScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vilkår for bruk</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Sist oppdatert: Oktober 2026</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Aksept av vilkår</Text>
          <Text style={styles.paragraph}>
            Ved å opprette en brukerkonto eller benytte Norskprøven Muntlig Simulator, samtykker du til disse
            vilkårene. Tjenesten tilbys som et øvingsverktøy til forberedelse til den offisielle Norskprøven.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Brukerkonto og autentisering</Text>
          <Text style={styles.paragraph}>
            For å få tilgang til muntlige prøver, taleopptak og lagrede vurderinger må du opprette en personlig
            brukerkonto. Du er ansvarlig for å opprettholde konfidensialiteten til din innloggingsinformasjon.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Abonnement og kvoter</Text>
          <Text style={styles.paragraph}>
            Gratisbrukere har tilgang til 1 prøve per dag. Standard- og Premium-abonnement gir utvidet daglig
            testkvote og tilgang til ytterligere funksjoner. Betalinger behandles sikkert via Stripe.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Ansvarsfraskrivelse</Text>
          <Text style={styles.paragraph}>
            Simulatoren gir veiledende tilbakemeldinger basert på kunstig intelligens og HK-dirs vurderingskriterier.
            Resultater i simulatoren garanterer ikke et spesifikt resultat på den offisielle eksamenen.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backButtonText: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  lastUpdated: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 4,
  },
  section: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  paragraph: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
});

