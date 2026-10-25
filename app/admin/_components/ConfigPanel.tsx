'use client';

import React, { useCallback, useEffect, useState } from 'react';
import s from './admin.module.css';
import { colors, styles } from './styles';
import { cx, PageHeader, type Notify } from './ui';
import type { AdminRequest } from './types';

type Tier = 'FREE' | 'STANDARD' | 'PREMIUM';

interface ConfigPanelProps {
  request: AdminRequest;
  notify: Notify;
}

export function ConfigPanel({ request, notify }: ConfigPanelProps) {
  const [tierPolicies, setTierPolicies] = useState<any>(null);
  const [referralSettings, setReferralSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await request('/api/admin/config', 'GET');
      setTierPolicies(data.tiers);
      setReferralSettings(data.referral);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kunne ikke laste innstillinger');
    } finally {
      setIsLoading(false);
    }
    // `request` closes over the admin secret, which can't change while this section is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleUpdateTier = async (tier: Tier, dailyLimit: number, priceCents: number, features: string[]) => {
    setIsSaving(true);
    try {
      await request('/api/admin/config', 'PUT', {
        tier,
        dailyTestLimit: dailyLimit,
        priceCents,
        features,
      });
      notify.success(`Abonnementsplan ${tier} er oppdatert.`);
      await loadConfig();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Feil ved lagring av abonnementsplan');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateReferral = async (bonusDailyTests: number, durationDays: number) => {
    setIsSaving(true);
    try {
      await request('/api/admin/config', 'PUT', { bonusDailyTests, durationDays });
      notify.success('Verveinnstillinger er oppdatert.');
      await loadConfig();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Feil ved lagring av verveinnstillinger');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Abonnement & verving"
        subtitle="Daglige testgrenser, priser og inkluderte fordeler per plan, samt bonus for vervede venner."
        actions={
          <button type="button" className={s.btn} onClick={loadConfig} disabled={isLoading}>
            {isLoading ? 'Oppdaterer…' : '↻ Oppfrisk'}
          </button>
        }
      />

      {isLoading && !tierPolicies ? (
        <div className={cx(s.card, s.empty)}>Laster inn abonnementsinnstillinger…</div>
      ) : tierPolicies ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px',
            marginBottom: '16px',
          }}
        >
          <TierConfigCard
            tier="FREE"
            title="Gratis"
            accentColor={colors.muted}
            badgeLabel="Grunnpakke"
            initialLimit={tierPolicies.FREE?.dailyTestLimit ?? 1}
            initialPriceCents={tierPolicies.FREE?.priceCents ?? 0}
            initialFeatures={tierPolicies.FREE?.features ?? []}
            isPaid={false}
            isSaving={isSaving}
            onSave={(dailyLimit, priceCents, features) => handleUpdateTier('FREE', dailyLimit, priceCents, features)}
          />
          <TierConfigCard
            tier="STANDARD"
            title="Standard"
            accentColor={colors.accent}
            badgeLabel="Populær"
            initialLimit={tierPolicies.STANDARD?.dailyTestLimit ?? 5}
            initialPriceCents={tierPolicies.STANDARD?.priceCents ?? 14900}
            initialFeatures={tierPolicies.STANDARD?.features ?? []}
            isPaid={true}
            isSaving={isSaving}
            onSave={(dailyLimit, priceCents, features) =>
              handleUpdateTier('STANDARD', dailyLimit, priceCents, features)
            }
          />
          <TierConfigCard
            tier="PREMIUM"
            title="Premium"
            accentColor="#F59E0B"
            badgeLabel="Maksimal øving"
            initialLimit={tierPolicies.PREMIUM?.dailyTestLimit ?? 20}
            initialPriceCents={tierPolicies.PREMIUM?.priceCents ?? 29900}
            initialFeatures={tierPolicies.PREMIUM?.features ?? []}
            isPaid={true}
            isSaving={isSaving}
            onSave={(dailyLimit, priceCents, features) =>
              handleUpdateTier('PREMIUM', dailyLimit, priceCents, features)
            }
          />
        </div>
      ) : null}

      {referralSettings && (
        <ReferralConfigCard
          initialBonus={referralSettings.bonusDailyTests ?? 2}
          initialDuration={referralSettings.durationDays ?? 7}
          isSaving={isSaving}
          onSave={handleUpdateReferral}
        />
      )}
    </>
  );
}

interface TierConfigCardProps {
  tier: Tier;
  title: string;
  accentColor: string;
  badgeLabel: string;
  initialLimit: number;
  initialPriceCents: number;
  initialFeatures: string[];
  isPaid: boolean;
  isSaving: boolean;
  onSave: (dailyLimit: number, priceCents: number, features: string[]) => void;
}

function TierConfigCard({
  tier,
  title,
  accentColor,
  badgeLabel,
  initialLimit,
  initialPriceCents,
  initialFeatures,
  isPaid,
  isSaving,
  onSave,
}: TierConfigCardProps) {
  const [dailyLimit, setDailyLimit] = useState<number>(initialLimit);
  const [priceNok, setPriceNok] = useState<number>(Math.round(initialPriceCents / 100));
  const [features, setFeatures] = useState<string[]>(initialFeatures);
  const [newFeatureText, setNewFeatureText] = useState<string>('');

  useEffect(() => {
    setDailyLimit(initialLimit);
    setPriceNok(Math.round(initialPriceCents / 100));
    setFeatures(initialFeatures);
  }, [initialLimit, initialPriceCents, initialFeatures]);

  const handleAddFeature = () => {
    const trimmed = newFeatureText.trim();
    if (!trimmed) return;
    setFeatures((prev) => [...prev, trimmed]);
    setNewFeatureText('');
  };

  const handleRemoveFeature = (index: number) => {
    setFeatures((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFeatureChange = (index: number, val: string) => {
    setFeatures((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFeatures = features.map((f) => f.trim()).filter((f) => f.length > 0);
    onSave(dailyLimit, isPaid ? priceNok * 100 : 0, cleanFeatures);
  };

  return (
    <div
      className={cx(s.card, s.cardPadded)}
      style={{ display: 'flex', flexDirection: 'column', borderTop: `3px solid ${accentColor}` }}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className={s.cardTitle} style={{ margin: 0, color: accentColor === colors.muted ? undefined : accentColor }}>
            {title}
          </h2>
          <span className={cx(s.badge, s.badgeNeutral)}>{badgeLabel}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isPaid ? '1fr 1fr' : '1fr', gap: 12 }}>
          <div>
            <label style={styles.label}>Tester per døgn</label>
            <input
              type="number"
              min="1"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={styles.input}
              required
            />
          </div>
          {isPaid && (
            <div>
              <label style={styles.label}>Månedspris (kr)</label>
              <input
                type="number"
                min="0"
                value={priceNok}
                onChange={(e) => setPriceNok(Math.max(0, parseInt(e.target.value, 10) || 0))}
                style={styles.input}
                required
              />
            </div>
          )}
        </div>

        <div style={{ margin: '10px 0 18px' }}>
          <label style={styles.label}>Inkluderte funksjoner</label>
          {features.map((feature, idx) => (
            <div key={idx} className={s.questionRow}>
              <input
                type="text"
                value={feature}
                onChange={(e) => handleFeatureChange(idx, e.target.value)}
                placeholder="f.eks. Ubegrenset tilgang, AI-stemme…"
                style={{ ...styles.input, marginBottom: 0, fontSize: 13 }}
              />
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => handleRemoveFeature(idx)}
                title="Fjern funksjon"
                aria-label="Fjern funksjon"
              >
                ✕
              </button>
            </div>
          ))}
          <div className={s.questionRow}>
            <input
              type="text"
              value={newFeatureText}
              onChange={(e) => setNewFeatureText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddFeature();
                }
              }}
              placeholder="Ny funksjon…"
              style={{ ...styles.input, marginBottom: 0, fontSize: 13 }}
            />
            <button type="button" className={cx(s.btn, s.btnSm)} onClick={handleAddFeature}>
              Legg til
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className={cx(s.btn, tier !== 'FREE' && s.btnPrimary)}
          style={{ width: '100%', marginTop: 'auto' }}
        >
          {isSaving ? 'Lagrer…' : `Lagre ${title}`}
        </button>
      </form>
    </div>
  );
}

interface ReferralConfigCardProps {
  initialBonus: number;
  initialDuration: number;
  isSaving: boolean;
  onSave: (bonusDailyTests: number, durationDays: number) => void;
}

function ReferralConfigCard({ initialBonus, initialDuration, isSaving, onSave }: ReferralConfigCardProps) {
  const [bonusDailyTests, setBonusDailyTests] = useState<number>(initialBonus);
  const [durationDays, setDurationDays] = useState<number>(initialDuration);

  useEffect(() => {
    setBonusDailyTests(initialBonus);
    setDurationDays(initialDuration);
  }, [initialBonus, initialDuration]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(bonusDailyTests, durationDays);
  };

  return (
    <div className={cx(s.card, s.cardPadded)}>
      <h2 className={s.cardTitle}>Verveprogram</h2>
      <p className={s.cardSubtitle}>
        Hvor mange ekstra tester per dag både ververen og den vervede vennen får når vennen registrerer seg, og
        hvor lenge bonusen varer.
      </p>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={styles.label}>Ekstra tester per dag per vervet venn</label>
            <input
              type="number"
              min="1"
              value={bonusDailyTests}
              onChange={(e) => setBonusDailyTests(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ ...styles.input, marginBottom: 0 }}
              required
            />
          </div>
          <div>
            <label style={styles.label}>Varighet (dager)</label>
            <input
              type="number"
              min="1"
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ ...styles.input, marginBottom: 0 }}
              required
            />
          </div>
          <div>
            <button type="submit" disabled={isSaving} className={cx(s.btn, s.btnPrimary)} style={{ width: '100%' }}>
              {isSaving ? 'Lagrer…' : 'Lagre verveinnstillinger'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
