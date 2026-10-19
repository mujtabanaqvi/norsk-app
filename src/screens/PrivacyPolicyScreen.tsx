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

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacyPolicy'>;

export const PrivacyPolicyScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Personvernerklæring</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Sist oppdatert: Oktober 2026</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Behandling av personopplysninger</Text>
          <Text style={styles.paragraph}>
            Vi tar personvernet ditt på største alvor. Vi lagrer din registrerte e-post, navn og progresjon
            for å tilby tjenesten i samsvar med gjeldende personvernlovgivning (GDPR).
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Lydopptak og transkribering</Text>
          <Text style={styles.paragraph}>
            Når du gjennomfører en muntlig prøve, sendes taleopptakene sikkert til talegjenkjenning (Speech-to-Text)
            for å vurdere uttale, ordforråd og flyt. Lydopptakene brukes utelukkende for å gi deg tilbakemelding
            og lagres ikke permanent for modelltrening.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Dine rettigheter</Text>
          <Text style={styles.paragraph}>
            Du har rett til innsyn i egne data, retting eller sletting av din konto og tilhørende transkripsjoner
            ved å kontakte support eller slette kontoen din.
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

