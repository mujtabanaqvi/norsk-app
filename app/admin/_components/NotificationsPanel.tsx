'use client';

import React, { useCallback, useEffect, useState } from 'react';
import s from './admin.module.css';
import { colors, styles } from './styles';
import {
  Badge,
  cx,
  Drawer,
  EmptyState,
  PageHeader,
  SkeletonRows,
  useConfirm,
  type Notify,
} from './ui';
import type { AdminRequest } from './types';

interface NotificationsPanelProps {
  request: AdminRequest;
  notify: Notify;
  onCountChange?: (count: number) => void;
}

interface NotificationItem {
  id: string;
  type: string;
  titleNo: string;
  titleEn: string;
  messageNo: string;
  messageEn: string;
  actionRoute: string | null;
  targetAudience: string;
  createdAt: string;
  totalRecipients: number;
  readCount: number;
  readRatePercent: number;
}

const TEMPLATES = [
  {
    name: 'Daglige kreditter',
    type: 'DAILY_CREDITS',
    titleNo: 'Daglige taleminutter er klare! ⚡',
    titleEn: 'Daily speaking minutes refreshed! ⚡',
    messageNo: 'Dine daglige taleminutter og prøver er fornyet for i dag. Ta en muntlig økt nå for å forbedre flyten.',
    messageEn: 'Your daily speaking minutes and exams are renewed for today. Start a practice session now to improve your fluency.',
    route: 'ExamSetup',
    audience: 'ALL',
  },
  {
    name: 'Øvingspåminnelse',
    type: 'PRACTICE_REMINDER',
    titleNo: 'Tid for litt norsktrening? 🎯',
    titleEn: 'Time for some Norwegian practice? 🎯',
    messageNo: 'Jevnlig muntlig øving er nøkkelen til å bestå B1/B2! Ta 10 minutter med prøvetrening i dag.',
    messageEn: 'Regular speaking practice is key to passing B1/B2! Take 10 minutes for practice today.',
    route: 'ExamSetup',
    audience: 'ALL',
  },
  {
    name: 'Kampanje / Tilbud',
    type: 'PROMOTION',
    titleNo: 'Begrenset tilbud på Standard og Premium! ⭐',
    titleEn: 'Limited offer on Standard and Premium! ⭐',
    messageNo: 'Få full tilgang til ubegrensede prøver, sensorveiledning og personlig uttaleanalyse.',
    messageEn: 'Get full access to unlimited exams, examiner guidance and personal pronunciation analysis.',
    route: 'Subscription',
    audience: 'FREE',
  },
  {
    name: 'Systemoppdatering',
    type: 'SYSTEM',
    titleNo: 'Nye eksamenstemaer er tilgjengelige! 📚',
    titleEn: 'New exam themes are available! 📚',
    messageNo: 'Vi har lagt til nye offisielle prøvetemaer og spørsmål for B1 og B2.',
    messageEn: 'We have added new official exam topics and questions for B1 and B2.',
    route: 'ExamSetup',
    audience: 'ALL',
  },
];

export function NotificationsPanel({ request, notify, onCountChange }: NotificationsPanelProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [pushStats, setPushStats] = useState<{ totalTokens: number; uniqueUsers: number } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isComposeOpen, setIsComposeOpen] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isTriggeringCredits, setIsTriggeringCredits] = useState<boolean>(false);
  const [isTriggeringReminders, setIsTriggeringReminders] = useState<boolean>(false);
  const [confirm, confirmDialog] = useConfirm();

  // Form states
  const [formType, setFormType] = useState<string>('ANNOUNCEMENT');
  const [formAudience, setFormAudience] = useState<string>('ALL');
  const [formTargetUserId, setFormTargetUserId] = useState<string>('');
  const [formTitleNo, setFormTitleNo] = useState<string>('');
  const [formTitleEn, setFormTitleEn] = useState<string>('');
  const [formMessageNo, setFormMessageNo] = useState<string>('');
  const [formMessageEn, setFormMessageEn] = useState<string>('');
  const [formRoute, setFormRoute] = useState<string>('ExamSetup');
  const [formSendPush, setFormSendPush] = useState<boolean>(true);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await request('/api/admin/notifications', 'GET');
      const list: NotificationItem[] = Array.isArray(data.items) ? data.items : [];
      setItems(list);
      if (data.pushStats) setPushStats(data.pushStats);
      if (onCountChange) onCountChange(data.total ?? list.length);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kunne ikke laste varsler');
    } finally {
      setIsLoading(false);
    }
  }, [request, notify, onCountChange]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const applyTemplate = (tpl: (typeof TEMPLATES)[0]) => {
    setFormType(tpl.type);
    setFormTitleNo(tpl.titleNo);
    setFormTitleEn(tpl.titleEn);
    setFormMessageNo(tpl.messageNo);
    setFormMessageEn(tpl.messageEn);
    setFormRoute(tpl.route);
    setFormAudience(tpl.audience);
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitleNo.trim() || !formMessageNo.trim()) {
      notify.error('Tittel og melding på norsk må fylles ut.');
      return;
    }

    const confirmed = await confirm({
      title: 'Send varsel til brukere',
      message: `Er du sikker på at du vil sende dette varselet til målgruppen: "${formAudience}"?`,
      confirmLabel: 'Send varsel',
    });
    if (!confirmed) return;

    setIsSending(true);
    try {
      const res = await request('/api/admin/notifications', 'POST', {
        type: formType,
        targetAudience: formAudience,
        targetUserId: formAudience === 'CUSTOM' ? formTargetUserId.trim() : undefined,
        titleNo: formTitleNo.trim(),
        titleEn: formTitleEn.trim() || undefined,
        messageNo: formMessageNo.trim(),
        messageEn: formMessageEn.trim() || undefined,
        actionRoute: formRoute || undefined,
        sendPush: formSendPush,
      });

      notify.success(`Varsel sendt! Levert til ${res.deliveredCount ?? 0} brukere.`);
      setIsComposeOpen(false);
      setFormTitleNo('');
      setFormTitleEn('');
      setFormMessageNo('');
      setFormMessageEn('');
      await loadNotifications();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Utsending feilet');
    } finally {
      setIsSending(false);
    }
  };

  const handleTriggerDailyCredits = async () => {
    const confirmed = await confirm({
      title: 'Kjør daglig kreditt-varsling',
      message: 'Dette vil sende varsel om nye daglige taleminutter til alle aktive brukere som ikke allerede har mottatt varsel i dag.',
      confirmLabel: 'Kjør utsending',
    });
    if (!confirmed) return;

    setIsTriggeringCredits(true);
    try {
      const res = await request('/api/admin/notifications/triggers', 'POST', {
        action: 'TRIGGER_DAILY_CREDITS',
      });
      const sent = res.result?.sentCount ?? 0;
      notify.success(`Ferdig! Sendte kredittvarsel til ${sent} brukere.`);
      await loadNotifications();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kjøring feilet');
    } finally {
      setIsTriggeringCredits(false);
    }
  };

  const handleTriggerPracticeReminders = async () => {
    const confirmed = await confirm({
      title: 'Kjør øvingspåminnelse',
      message: 'Dette sender en oppmuntrende påminnelse til alle brukere som ikke har tatt en prøve på 2 eller flere dager.',
      confirmLabel: 'Kjør påminnelse',
    });
    if (!confirmed) return;

    setIsTriggeringReminders(true);
    try {
      const res = await request('/api/admin/notifications/triggers', 'POST', {
        action: 'TRIGGER_PRACTICE_REMINDERS',
        daysThreshold: 2,
      });
      const sent = res.result?.sentCount ?? 0;
      notify.success(`Ferdig! Sendte påminnelse til ${sent} inaktive brukere.`);
      await loadNotifications();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kjøring feilet');
    } finally {
      setIsTriggeringReminders(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Varsler & Påminnelser"
        subtitle="Send in-app varsler og kunngjøringer til brukere, eller kjør automatiserte påminnelser for øving og daglige kreditter."
        actions={
          <button
            type="button"
            className={cx(s.btn, s.btnPrimary)}
            onClick={() => {
              applyTemplate(TEMPLATES[0]);
              setIsComposeOpen(true);
            }}
          >
            + Opprett nytt varsel
          </button>
        }
      />

      {/* Quick Action Automated Triggers Card */}
      <div
        style={{
          background: colors.surfaceRaised,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: colors.text }}>
              ⚡ Hurtighandlinger for automatiske varsler
            </div>
            <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              Kjør utsendelse til kvalifiserte brukere med innebygd deduplisering (forhindrer spam).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={cx(s.btn, s.btnSecondary)}
              onClick={handleTriggerDailyCredits}
              disabled={isTriggeringCredits}
              style={{ fontSize: 13 }}
            >
              {isTriggeringCredits ? 'Sender…' : '⚡ Send daglige kreditter nå'}
            </button>
            <button
              type="button"
              className={cx(s.btn, s.btnSecondary)}
              onClick={handleTriggerPracticeReminders}
              disabled={isTriggeringReminders}
              style={{ fontSize: 13 }}
            >
              {isTriggeringReminders ? 'Sender…' : '🎯 Send øvingspåminnelse nå (2+ dager inaktiv)'}
            </button>
          </div>
        </div>

        {pushStats && (
          <div
            style={{
              paddingTop: 10,
              borderTop: `1px solid ${colors.border}`,
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
              fontSize: 12,
              color: colors.muted,
            }}
          >
            <div>
              📱 Registrerte mobilenheter:{' '}
              <strong style={{ color: colors.text }}>{pushStats.totalTokens}</strong>
            </div>
            <div>
              👥 Brukere med push-varsler:{' '}
              <strong style={{ color: colors.text }}>{pushStats.uniqueUsers}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Notification Broadcasts Table */}
      <div style={styles.card}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: colors.text }}>
            Utsendelseshistorikk ({items.length})
          </div>
          <button
            type="button"
            className={cx(s.btn, s.btnSecondary)}
            onClick={loadNotifications}
            disabled={isLoading}
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            ↻ Oppdater
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Dato</th>
                <th>Type</th>
                <th>Tittel & Melding</th>
                <th>Målgruppe</th>
                <th>Rute</th>
                <th style={{ textAlign: 'right' }}>Mottakere</th>
                <th style={{ textAlign: 'right' }}>Lest</th>
                <th style={{ textAlign: 'right' }}>Leserate</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows rows={4} columns={8} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon="🔔"
                      title="Ingen utsendelser ennå"
                      text="Klikk på «Opprett nytt varsel» for å sende en kunngjøring til dine brukere."
                      action={
                        <button
                          type="button"
                          className={cx(s.btn, s.btnPrimary)}
                          onClick={() => {
                            applyTemplate(TEMPLATES[0]);
                            setIsComposeOpen(true);
                          }}
                        >
                          Send ditt første varsel
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                items.map((notif) => (
                  <tr key={notif.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: colors.muted }}>
                      {new Date(notif.createdAt).toLocaleDateString('nb-NO', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <Badge
                        tone={
                          notif.type === 'DAILY_CREDITS'
                            ? 'warning'
                            : notif.type === 'PRACTICE_REMINDER'
                            ? 'b1'
                            : notif.type === 'PROMOTION'
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {notif.type}
                      </Badge>
                    </td>
                    <td style={{ maxWidth: 300 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>
                        {notif.titleNo}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: colors.muted,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {notif.messageNo}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: colors.accent }}>{notif.targetAudience}</span>
                    </td>
                    <td>
                      <code style={{ fontSize: 11, color: colors.muted }}>
                        {notif.actionRoute || '—'}
                      </code>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                      {notif.totalRecipients}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 13, color: colors.muted }}>
                      {notif.readCount}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge tone={notif.readRatePercent > 50 ? 'success' : 'neutral'}>
                        {notif.readRatePercent}%
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compose Drawer */}
      <Drawer
        open={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        title="Opprett og send varsel"
        subtitle="Varsler vises direkte i brukernes varslingssenter (bjelle-ikon) i appen."
      >
        <form onSubmit={handleSendNotification} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={styles.label}>Raske maler</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  className={cx(s.btn, s.btnSecondary)}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => applyTemplate(tpl)}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={styles.label}>Kategori / Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                style={styles.select}
              >
                <option value="ANNOUNCEMENT">Kunngjøring (ANNOUNCEMENT)</option>
                <option value="DAILY_CREDITS">Daglige kreditter (DAILY_CREDITS)</option>
                <option value="PRACTICE_REMINDER">Øvingspåminnelse (PRACTICE_REMINDER)</option>
                <option value="PROMOTION">Kampanje / Tilbud (PROMOTION)</option>
                <option value="SYSTEM">Systemoppdatering (SYSTEM)</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Målgruppe</label>
              <select
                value={formAudience}
                onChange={(e) => setFormAudience(e.target.value)}
                style={styles.select}
              >
                <option value="ALL">Alle aktive brukere</option>
                <option value="FREE">Kun Gratis-brukere</option>
                <option value="STANDARD">Kun Standard-abonnenter</option>
                <option value="PREMIUM">Kun Premium-abonnenter</option>
                <option value="CUSTOM">Enkeltbruker (User ID)</option>
              </select>
            </div>
          </div>

          {formAudience === 'CUSTOM' && (
            <div>
              <label style={styles.label}>Bruker-ID (UUID)</label>
              <input
                type="text"
                value={formTargetUserId}
                onChange={(e) => setFormTargetUserId(e.target.value)}
                placeholder="f.eks. 123e4567-e89b-12d3-a456-426614174000"
                style={styles.input}
                required
              />
            </div>
          )}

          <div>
            <label style={styles.label}>Tittel (Norsk bokmål) *</label>
            <input
              type="text"
              value={formTitleNo}
              onChange={(e) => setFormTitleNo(e.target.value)}
              placeholder="f.eks. Daglige taleminutter er klare! ⚡"
              style={styles.input}
              required
            />
          </div>

          <div>
            <label style={styles.label}>Tittel (Engelsk - valgfritt)</label>
            <input
              type="text"
              value={formTitleEn}
              onChange={(e) => setFormTitleEn(e.target.value)}
              placeholder="e.g. Daily speaking minutes refreshed! ⚡"
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Melding (Norsk bokmål) *</label>
            <textarea
              value={formMessageNo}
              onChange={(e) => setFormMessageNo(e.target.value)}
              placeholder="Skriv varselet her…"
              rows={3}
              style={{ ...styles.input, resize: 'vertical' }}
              required
            />
          </div>

          <div>
            <label style={styles.label}>Melding (Engelsk - valgfritt)</label>
            <textarea
              value={formMessageEn}
              onChange={(e) => setFormMessageEn(e.target.value)}
              placeholder="English translation…"
              rows={3}
              style={{ ...styles.input, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={styles.label}>Handlingslenke i appen</label>
            <select
              value={formRoute}
              onChange={(e) => setFormRoute(e.target.value)}
              style={styles.select}
            >
              <option value="ExamSetup">Start / forbered prøve (ExamSetup)</option>
              <option value="Subscription">Abonnement & Oppgradering (Subscription)</option>
              <option value="LearningProfile">Min fremgang & Innsikt (LearningProfile)</option>
              <option value="Referral">Verv en venn (Referral)</option>
              <option value="">Ingen spesiell handling</option>
            </select>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontSize: 13,
              color: colors.text,
              marginTop: 4,
            }}
          >
            <input
              type="checkbox"
              checked={formSendPush}
              onChange={(e) => setFormSendPush(e.target.checked)}
            />
            <span>Send også som push-varsel til mobil (låseskjerm / varsellinje)</span>
          </label>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              className={cx(s.btn, s.btnSecondary)}
              onClick={() => setIsComposeOpen(false)}
            >
              Avbryt
            </button>
            <button
              type="submit"
              className={cx(s.btn, s.btnPrimary)}
              disabled={isSending}
            >
              {isSending ? 'Sender ut…' : 'Send varsel'}
            </button>
          </div>
        </form>
      </Drawer>

      {confirmDialog}
    </div>
  );
}
