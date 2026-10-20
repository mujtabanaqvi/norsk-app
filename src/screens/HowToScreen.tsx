import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/exam';
import { Screen, AppHeader, Card, Badge, Icon } from '../components/ui';
import { useLocale } from '../hooks/useLocale';
import { colors, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'HowTo'>;

export const HowToScreen: React.FC<Props> = ({ navigation }) => {
  const { t, strings } = useLocale();
  return (
    <Screen>
      <AppHeader
        title={t('nav.howTo')}
        onBack={() => navigation.goBack()}
        bordered
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.introBox}>
            <View style={styles.introHeaderRow}>
              <Icon name="information-circle" size={20} color={colors.navy} />
              <Text style={styles.introTitle}>{t('howTo.introTitle')}</Text>
            </View>
            <Text style={styles.introText}>{t('howTo.introText')}</Text>
          </View>

          {strings.howTo.steps.map((step, index) => (
            <Card key={step.badge} style={styles.stepCard}>
              <View style={styles.stepTopRow}>
                <View style={styles.stepCircle}>
                  <Text style={styles.stepCircleText}>{index + 1}</Text>
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
              <Badge label={t('howTo.evalBadge')} tone="success" />
            </View>
            <Text style={styles.stepTitle}>{t('howTo.evalTitle')}</Text>
            <Text style={styles.stepDescription}>{t('howTo.evalDesc')}</Text>
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
