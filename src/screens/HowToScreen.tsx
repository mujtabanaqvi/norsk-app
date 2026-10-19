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

type Props = NativeStackScreenProps<RootStackParamList, 'HowTo'>;

export const HowToScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Slik fungerer prøven</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Offisiell HK-dir B1/B2 Eksamenssimulator</Text>
          <Text style={styles.introText}>
            Simulatoren er bygget etter retningslinjene til Direktoratet for høyere utdanning og kompetanse (HK-dir)
            og trener deg på den muntlige delen av Norskprøven.
          </Text>
        </View>

        <View style={styles.stepCard}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>DEL 1</Text>
          </View>
          <Text style={styles.stepTitle}>Individuell presentasjon (Monolog)</Text>
          <Text style={styles.stepDescription}>
            Sensoren stiller et oppstartsspørsmål knyttet til et valgt tema. Du snakker i ca. 1,5–2 minutter
            om temaet uten avbrytelser.
          </Text>
        </View>

        <View style={styles.stepCard}>
          <View style={[styles.stepBadge, { backgroundColor: '#3B82F6' }]}>
            <Text style={styles.stepBadgeText}>DEL 2</Text>
          </View>
          <Text style={styles.stepTitle}>Samtale med medkandidat</Text>
          <Text style={styles.stepDescription}>
            Du diskuterer et dilemma eller et tema sammen med en medkandidat. I appen kan du øve alene med en
            interaktiv AI-medkandidat, eller dele mikrofonen med en venn ved siden av deg.
          </Text>
        </View>

        <View style={styles.stepCard}>
          <View style={[styles.stepBadge, { backgroundColor: '#8B5CF6' }]}>
            <Text style={styles.stepBadgeText}>DEL 3</Text>
          </View>
          <Text style={styles.stepTitle}>Oppfølgingsspørsmål fra sensor</Text>
          <Text style={styles.stepDescription}>
            Sensoren stiller fordypende spørsmål for å teste evnen din til å reflektere, begrunne meninger og
            bruke et nyansert ordforråd på B1- eller B2-nivå.
          </Text>
        </View>

        <View style={styles.stepCard}>
          <View style={[styles.stepBadge, { backgroundColor: '#10B981' }]}>
            <Text style={styles.stepBadgeText}>VURDERING</Text>
          </View>
          <Text style={styles.stepTitle}>Umiddelbar tilbakemelding & poeng</Text>
          <Text style={styles.stepDescription}>
            Etter fullført prøve vurderes din taleautomatisk etter 5 offisielle kriterier: flyt, uttale,
            vokabular, grammatikk og oppgaveforståelse.
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
  introCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  introTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  introText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
  stepCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  stepDescription: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
});

