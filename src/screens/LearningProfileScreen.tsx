import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AssessedLevel, RootStackParamList } from '../types/exam';
import {
  CRITERION_KEYS,
  type ExamHistoryItem,
  type LearningInsight,
  type LearningProfileResponse,
  type Trend,
} from '../types/learning-profile';
import { fetchLearningProfile } from '../api';
import { useLocale } from '../hooks/useLocale';
import { LOCALE_TAGS } from '../i18n';
import { Screen, AppHeader, Card, Badge, Button, Icon, type IconName, type BadgeTone } from '../components/ui';
import { colors, radius, space, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'LearningProfile'>;

/** While an exam is still being assessed, re-check so the new result and summary appear. */
const PENDING_POLL_MS = 5_000;
const PENDING_POLL_MAX = 36;

const LEVEL_TONE: Record<AssessedLevel, BadgeTone> = {
  'Under B1': 'warning',
  B1: 'navy',
  B2: 'success',
  'Over B2': 'gold',
};

const TREND_ICON: Record<Trend, { name: IconName; color: string }> = {
  up: { name: 'trending-up', color: colors.success },
  down: { name: 'trending-down', color: colors.danger },
  flat: { name: 'remove', color: colors.textMuted },
};

function scoreColor(score: number): string {
  if (score >= 8) return colors.success;
  if (score >= 5) return colors.navy;
  return colors.warning;
}

export const LearningProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { locale, t } = useLocale();
  const en = locale === 'en';
  const [data, setData] = useState<LearningProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      try {
        const res = await fetchLearningProfile(refresh);
        setData(res);
        setError(null);
      } catch (err: any) {
        setError(err?.message || t('profile.loadFailed'));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [t]
  );

  // Reload whenever the screen comes back into focus (e.g. after opening a result)
  useEffect(() => {
    load();
    return navigation.addListener('focus', () => {
      pollCount.current = 0;
      load();
    });
  }, [navigation, load]);

  const hasPending = !!data?.history.some((h) => h.pending);
  useEffect(() => {
    if (!hasPending || pollCount.current >= PENDING_POLL_MAX) return;
    const timer = setTimeout(() => {
      pollCount.current += 1;
      load();
    }, PENDING_POLL_MS);
    return () => clearTimeout(timer);
  }, [hasPending, data, load]);

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(LOCALE_TAGS[locale], { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

  const header = (
    <AppHeader
      title={t('profile.title')}
      subtitle={t('profile.subtitle')}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('ExamSetup'))}
      bordered
    />
  );

  if (isLoading) {
    return (
      <Screen>
        {header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.red} />
        </View>
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        {header}
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t('profile.loadFailed')}</Text>
          <Text style={[styles.body, styles.centerText]}>{error}</Text>
          <Button
            title={t('common.retry')}
            icon="refresh"
            onPress={() => {
              setIsLoading(true);
              load();
            }}
          />
        </View>
      </Screen>
    );
  }

  const history = data?.history ?? [];
  const insight = data?.insight ?? null;

  if (!history.length) {
    return (
      <Screen>
        {header}
        <View style={styles.center}>
          <View style={styles.iconCircle}>
            <Icon name="stats-chart-outline" size={30} color={colors.red} />
          </View>
          <Text style={styles.emptyTitle}>{t('profile.emptyTitle')}</Text>
          <Text style={[styles.body, styles.centerText]}>{t('profile.emptyBody')}</Text>
          <Button
            title={t('profile.emptyCta')}
            icon="mic"
            size="lg"
            onPress={() => navigation.replace('ExamSetup')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              load();
            }}
            tintColor={colors.red}
            colors={[colors.red]}
          />
        }
      >
        <View style={styles.container}>
          {insight ? (
            <>
              <StatusHero insight={insight} />
              <SkillBars insight={insight} />
              <CoachCard
                insight={insight}
                updatedAt={formatDate(data?.updatedAt ?? insight.generatedAt)}
                refreshing={isRefreshing}
                onRefresh={() => {
                  setIsRefreshing(true);
                  load(true);
                }}
              />
            </>
          ) : (
            <Card style={styles.waitingCard}>
              <ActivityIndicator color={colors.red} />
              <Text style={styles.body}>{t('profile.waitingInsight')}</Text>
            </Card>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t('profile.historyTitle')}</Text>
            <Text style={type.caption}>{t('profile.historyCount', { count: history.length })}</Text>
          </View>
          {history.map((item) => (
            <HistoryCard
              key={item.sessionId}
              item={item}
              date={formatDate(item.completedAt ?? item.startedAt)}
              onPress={() => navigation.navigate('ExamResults', { sessionId: item.sessionId })}
            />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );

  function StatusHero({ insight }: { insight: LearningInsight }) {
    const { stats } = insight;
    const trend = TREND_ICON[stats.overallTrend];
    const trendLabel = t(
      stats.overallTrend === 'up' ? 'profile.trendUp' : stats.overallTrend === 'down' ? 'profile.trendDown' : 'profile.trendFlat'
    );
    return (
      <Card style={styles.hero}>
        <Text style={styles.overline}>{t('profile.standTitle')}</Text>
        <View style={styles.heroTop}>
          <View>
            <Text style={type.caption}>{t('profile.currentLevel')}</Text>
            <Text style={styles.heroLevel}>{stats.currentLevel}</Text>
          </View>
          <View style={styles.heroBadges}>
            <Badge label={t('profile.target', { level: stats.targetLevel })} tone="navy" />
            <View style={styles.trendRow}>
              <Icon name={trend.name} size={16} color={trend.color} />
              <Text style={[styles.trendText, { color: trend.color }]}>{trendLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.readinessRow}>
          <Text style={styles.bodyStrong}>{t('profile.readiness', { level: stats.targetLevel })}</Text>
          <Text style={styles.bodyStrong}>{stats.readinessPct}%</Text>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              {
                width: `${stats.readinessPct}%`,
                backgroundColor: stats.readinessPct >= 100 ? colors.success : colors.red,
              },
            ]}
          />
        </View>

        <View style={styles.statRow}>
          <Stat value={String(stats.testsTaken)} label={t('profile.testsTaken')} />
          <View style={styles.divider} />
          <Stat
            value={`${Math.round(stats.passRate * 100)}%`}
            label={`${t('profile.passRate')} · ${t('profile.lastN', { n: stats.sampleSize })}`}
          />
          <View style={styles.divider} />
          <Stat
            value={stats.recentAvg.toFixed(1)}
            label={`${t('profile.average')} · ${t('profile.lastN', { n: stats.sampleSize })}`}
          />
        </View>
      </Card>
    );
  }

  function Stat({ value, label }: { value: string; label: string }) {
    return (
      <View style={styles.stat}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={[type.caption, styles.centerText]}>{label}</Text>
      </View>
    );
  }

  function SkillBars({ insight }: { insight: LearningInsight }) {
    const { stats } = insight;
    return (
      <Card>
        <Text style={styles.sectionTitle}>{t('profile.skillsTitle')}</Text>
        <Text style={[type.caption, { marginBottom: space.md }]}>
          {t('profile.skillsSubtitle', { n: stats.sampleSize })}
        </Text>
        {CRITERION_KEYS.map((key) => {
          const avg = stats.criterionAverages[key];
          const trend = TREND_ICON[stats.criterionTrend[key]];
          return (
            <View key={key} style={styles.skillRow}>
              <View style={styles.skillLabelRow}>
                <Text style={styles.bodyStrong}>{t(`profile.criteria.${key}`)}</Text>
                <View style={styles.trendRow}>
                  <Text style={[styles.bodyStrong, { color: scoreColor(avg) }]}>{avg.toFixed(1)}</Text>
                  <Icon name={trend.name} size={16} color={trend.color} />
                </View>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${avg * 10}%`, backgroundColor: scoreColor(avg) }]} />
                <View
                  style={[styles.passMark, { left: `${(stats.targetLevel === 'B2' ? 8 : 5) * 10}%` }]}
                />
              </View>
            </View>
          );
        })}
      </Card>
    );
  }

  function CoachCard({
    insight,
    updatedAt,
    refreshing,
    onRefresh,
  }: {
    insight: LearningInsight;
    updatedAt: string;
    refreshing: boolean;
    onRefresh: () => void;
  }) {
    const { coach, stats } = insight;
    return (
      <Card style={styles.coach}>
        <View style={styles.coachHeader}>
          <View style={styles.iconCircleSmall}>
            <Icon name="school-outline" size={20} color={colors.red} />
          </View>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>{t('profile.coachTitle')}</Text>
          {insight.generatedBy === 'offline' && <Badge label={t('profile.offlineNote')} tone="neutral" />}
        </View>
        <Text style={styles.body}>{en ? coach.statusEn : coach.statusNo}</Text>

        {coach.strengths.length > 0 && (
          <View style={styles.coachSection}>
            <Text style={styles.overline}>{t('profile.strengthsTitle')}</Text>
            {coach.strengths.map((s, i) => (
              <View key={i} style={styles.bulletRow}>
                <Icon name="checkmark-circle" size={18} color={colors.success} />
                <Text style={[styles.body, { flex: 1 }]}>{en ? s.en : s.no}</Text>
              </View>
            ))}
          </View>
        )}

        {coach.focusAreas.length > 0 && (
          <View style={styles.coachSection}>
            <Text style={styles.overline}>{t('profile.focusTitle')}</Text>
            {coach.focusAreas.map((f, i) => (
              <View key={i} style={styles.focusItem}>
                <View style={styles.focusNumber}>
                  <Text style={styles.focusNumberText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bodyStrong}>{en ? f.titleEn : f.titleNo}</Text>
                  <Text style={type.caption}>
                    {t(`profile.criteria.${f.criterion}`)} · {stats.criterionAverages[f.criterion]?.toFixed(1)}/10
                  </Text>
                  <Text style={[styles.body, { marginTop: space.xs }]}>{en ? f.adviceEn : f.adviceNo}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {coach.recurringMistakes.length > 0 && (
          <View style={styles.coachSection}>
            <Text style={styles.overline}>{t('profile.mistakesTitle')}</Text>
            {coach.recurringMistakes.map((m, i) => (
              <View key={i} style={styles.mistake}>
                <Text style={styles.bodyStrong}>{m.pattern}</Text>
                <View style={styles.mistakeLine}>
                  <Text style={[styles.mistakeTag, { color: colors.danger }]}>{t('profile.youSaid')}</Text>
                  <Text style={[styles.body, styles.strike, { flex: 1 }]}>{m.example}</Text>
                </View>
                <View style={styles.mistakeLine}>
                  <Text style={[styles.mistakeTag, { color: colors.success }]}>{t('profile.better')}</Text>
                  <Text style={[styles.bodyStrong, { flex: 1, color: colors.success }]}>{m.fix}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.nextStep}>
          <Icon name="flag-outline" size={18} color={colors.navy} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.overline, { color: colors.navy }]}>{t('profile.nextStepTitle')}</Text>
            <Text style={styles.bodyStrong}>{en ? coach.nextStepEn : coach.nextStepNo}</Text>
          </View>
        </View>

        <View style={styles.coachFooter}>
          <Text style={[type.caption, { flex: 1 }]}>
            {t('profile.basedOn', { n: stats.sampleSize, date: updatedAt })}
          </Text>
          <Button
            title={t('profile.refresh')}
            variant="ghost"
            size="sm"
            icon="refresh"
            loading={refreshing}
            onPress={onRefresh}
          />
        </View>
      </Card>
    );
  }

  function HistoryCard({ item, date, onPress }: { item: ExamHistoryItem; date: string; onPress: () => void }) {
    const summary = en ? item.summaryEn : item.summaryNo;
    return (
      <Card onPress={onPress} style={styles.historyCard} accessibilityLabel={item.title ?? t('profile.untitled')}>
        <View style={styles.historyTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bodyStrong} numberOfLines={1}>
              {item.title || t('profile.untitled')}
            </Text>
            <Text style={type.caption} numberOfLines={1}>
              {date} · {item.level} ·{' '}
              {item.coCandidateMode === 'HUMAN_LOCAL' ? t('profile.modeHuman') : t('profile.modeAi')}
              {item.themeTitleNo ? ` · ${item.themeTitleNo}` : ''}
            </Text>
          </View>
          {item.avgScore != null && (
            <Text style={[styles.historyScore, { color: scoreColor(item.avgScore) }]}>{item.avgScore.toFixed(1)}</Text>
          )}
          <Icon name="chevron-forward" size={18} color={colors.textMuted} />
        </View>

        <View style={styles.historyBadges}>
          {item.pending ? (
            <Badge label={t('profile.evaluating')} tone="neutral" icon="time-outline" />
          ) : item.insufficientData ? (
            <Badge label={t('profile.noSpeech')} tone="neutral" icon="mic-off-outline" />
          ) : (
            <>
              {item.assessedLevel && <Badge label={item.assessedLevel} tone={LEVEL_TONE[item.assessedLevel]} />}
              <Badge
                label={item.passed ? t('profile.passed') : t('profile.failed')}
                tone={item.passed ? 'success' : 'red'}
                icon={item.passed ? 'checkmark' : 'close'}
              />
            </>
          )}
        </View>

        {item.criteriaScores && (
          <View style={styles.miniScores}>
            {CRITERION_KEYS.map((key) => (
              <View key={key} style={styles.miniScore}>
                <Text style={styles.miniScoreLabel}>{t(`profile.criteriaShort.${key}`)}</Text>
                <Text style={[styles.miniScoreValue, { color: scoreColor(item.criteriaScores![key]) }]}>
                  {item.criteriaScores![key]}
                </Text>
              </View>
            ))}
          </View>
        )}

        {!!summary && (
          <Text style={styles.body} numberOfLines={2}>
            {summary}
          </Text>
        )}
      </Card>
    );
  }
};

export default LearningProfileScreen;

const styles = StyleSheet.create({
  scrollContent: { padding: space.lg, paddingBottom: space.xxxl },
  container: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: space.lg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
    maxWidth: 480,
    alignSelf: 'center',
  },
  centerText: { textAlign: 'center' },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  overline: { ...type.overline, marginBottom: space.sm },
  emptyTitle: { ...type.title },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { ...type.heading },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: space.sm,
    marginBottom: -space.sm,
  },
  waitingCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },

  // Status hero
  hero: { borderColor: colors.navySoft, borderWidth: 1.5 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.lg },
  heroLevel: { ...type.display, fontSize: 34 },
  heroBadges: { alignItems: 'flex-end', gap: space.sm },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  trendText: { fontSize: 13, fontWeight: '700' },
  readinessRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  passMark: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.navy, opacity: 0.35 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...type.title, fontWeight: '800' },
  divider: { width: 1, height: 36, backgroundColor: colors.border },

  // Skills
  skillRow: { marginBottom: space.md },
  skillLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs },

  // Coach
  coach: { gap: space.md },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  coachSection: { marginTop: space.xs },
  bulletRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', marginBottom: space.xs },
  focusItem: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    marginBottom: space.sm,
  },
  focusNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusNumberText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  mistake: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.sm,
    gap: space.xs,
  },
  mistakeLine: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  mistakeTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, width: 64, paddingTop: 4 },
  strike: { textDecorationLine: 'line-through', color: colors.textMuted },
  nextStep: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.navySoft,
  },
  coachFooter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },

  // History
  historyCard: { gap: space.sm },
  historyTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  historyScore: { fontSize: 20, fontWeight: '800' },
  historyBadges: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  miniScores: { flexDirection: 'row', gap: space.sm },
  miniScore: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  miniScoreLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  miniScoreValue: { fontSize: 15, fontWeight: '800' },
});
