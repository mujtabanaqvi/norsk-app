'use client';

import React, { useMemo, useRef, useState } from 'react';
import s from './admin.module.css';
import { styles } from './styles';
import { cx, Drawer, Switch, useConfirm } from './ui';
import type { AdminExamTheme, AdminRequest, Level } from './types';

export interface ExamFormValues {
  titleNo: string;
  slug: string;
  level: Level;
  themeId: string;
  monologuePromptNo: string;
  discussionPromptNo: string;
  followUpQuestions: string[];
  isActive: boolean;
}

export const emptyExamForm: ExamFormValues = {
  titleNo: '',
  slug: '',
  level: 'B1',
  themeId: '',
  monologuePromptNo: '',
  discussionPromptNo: '',
  followUpQuestions: ['', '', ''],
  isActive: true,
};

interface ExamFormDrawerProps {
  /** Exam id when editing; null when creating (including duplicates). */
  editingExamId: string | null;
  initialValues: ExamFormValues;
  themes: AdminExamTheme[];
  request: AdminRequest;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Mounted only while open; the parent remounts it (via `key`) for each new edit session. */
export function ExamFormDrawer({
  editingExamId,
  initialValues,
  themes,
  request,
  onClose,
  onSaved,
}: ExamFormDrawerProps) {
  const [values, setValues] = useState<ExamFormValues>(initialValues);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  // Esc reaches both the drawer and the confirm dialog; ignore the drawer while asking.
  const isConfirmingRef = useRef(false);

  const isDirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialValues),
    [values, initialValues]
  );

  const set = <K extends keyof ExamFormValues>(key: K, value: ExamFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleClose = async () => {
    if (isSaving || isConfirmingRef.current) return;
    if (isDirty) {
      isConfirmingRef.current = true;
      const discard = await confirm({
        title: 'Forkaste endringer?',
        message: 'Du har endringer som ikke er lagret.',
        confirmLabel: 'Forkast',
        danger: true,
      });
      isConfirmingRef.current = false;
      if (!discard) return;
    }
    onClose();
  };

  const handleQuestionChange = (index: number, value: string) => {
    setValues((prev) => {
      const next = [...prev.followUpQuestions];
      next[index] = value;
      return { ...prev, followUpQuestions: next };
    });
  };

  const addQuestionField = () => set('followUpQuestions', [...values.followUpQuestions, '']);

  const removeQuestionField = (index: number) => {
    if (values.followUpQuestions.length <= 1) return;
    set(
      'followUpQuestions',
      values.followUpQuestions.filter((_, i) => i !== index)
    );
  };

  const filledQuestions = values.followUpQuestions.filter((q) => q.trim().length > 0).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanedQuestions = values.followUpQuestions.map((q) => q.trim()).filter((q) => q.length > 0);
    if (cleanedQuestions.length === 0) {
      setFormError('Legg til minst ett oppfølgingsspørsmål for Del 3.');
      return;
    }

    const payload: Record<string, unknown> = {
      titleNo: values.titleNo.trim(),
      level: values.level,
      themeId: values.themeId || null,
      monologuePromptNo: values.monologuePromptNo.trim(),
      discussionPromptNo: values.discussionPromptNo.trim(),
      followUpQuestionsNo: cleanedQuestions,
      isActive: values.isActive,
    };
    if (values.slug.trim()) {
      payload.slug = values.slug.trim();
    }

    setIsSaving(true);
    try {
      if (editingExamId) {
        await request(`/api/admin/exams/${encodeURIComponent(editingExamId)}`, 'PATCH', payload);
      } else {
        await request('/api/admin/exams', 'POST', payload);
      }
      onSaved(
        editingExamId
          ? `Eksamen «${values.titleNo.trim()}» ble oppdatert.`
          : `Ny eksamen «${values.titleNo.trim()}» (${values.level}) ble opprettet.`
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lagring feilet');
      setIsSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={editingExamId ? 'Rediger oppgavesett' : 'Nytt oppgavesett'}
      subtitle={
        editingExamId
          ? values.slug
          : 'Aktive sett trekkes tilfeldig når kandidater starter en muntlig prøve.'
      }
      onClose={handleClose}
      footer={
        <>
          <Switch
            checked={values.isActive}
            onChange={(next) => set('isActive', next)}
            label="Aktiv i trekning"
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={s.btn} onClick={handleClose} disabled={isSaving}>
              Avbryt
            </button>
            <button type="submit" form="exam-form" className={cx(s.btn, s.btnPrimary)} disabled={isSaving}>
              {isSaving ? 'Lagrer…' : editingExamId ? 'Lagre endringer' : 'Opprett'}
            </button>
          </div>
        </>
      }
    >
      {formError && <div className={s.formError}>{formError}</div>}

      <form id="exam-form" onSubmit={handleSubmit}>
        <section className={s.formSection}>
          <h3 className={s.formSectionTitle}>Grunninfo</h3>
          <div className={s.formGrid} style={{ marginTop: 12 }}>
            <div className={s.formGridFull}>
              <label style={styles.label} htmlFor="exam-title">
                Tittel *
              </label>
              <input
                id="exam-title"
                type="text"
                value={values.titleNo}
                onChange={(e) => set('titleNo', e.target.value)}
                placeholder="f.eks. Digitalisering og personvern i hverdagen"
                style={styles.input}
                required
                minLength={3}
                autoFocus
              />
            </div>
            <div>
              <label style={styles.label} htmlFor="exam-level">
                CEFR-nivå *
              </label>
              <select
                id="exam-level"
                value={values.level}
                onChange={(e) => set('level', e.target.value as Level)}
                style={styles.select}
              >
                <option value="B1">B1 (Middels)</option>
                <option value="B2">B2 (Høyere)</option>
              </select>
            </div>
            <div>
              <label style={styles.label} htmlFor="exam-theme">
                Tema
              </label>
              <select
                id="exam-theme"
                value={values.themeId}
                onChange={(e) => set('themeId', e.target.value)}
                style={styles.select}
              >
                <option value="">— Uten tema —</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.titleNo}
                    {theme.isActive ? '' : ' (deaktivert)'}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.formGridFull}>
              <label style={styles.label} htmlFor="exam-slug">
                Slug <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(valgfritt, genereres automatisk)</span>
              </label>
              <input
                id="exam-slug"
                type="text"
                value={values.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder="digitalisering-og-personvern"
                style={{ ...styles.input, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
              />
            </div>
          </div>
        </section>

        <section className={s.formSection}>
          <h3 className={s.formSectionTitle}>Del 1 · Monolog</h3>
          <p style={styles.helperText}>
            Presenteres av AI-sensor ved oppstart av prøven, og kandidaten vurderes mot den i
            sluttvurderingen.
          </p>
          <textarea
            rows={4}
            value={values.monologuePromptNo}
            onChange={(e) => set('monologuePromptNo', e.target.value)}
            placeholder="f.eks. Fortell om hvordan digitale tjenester påvirker hverdagen din…"
            style={styles.textarea}
            required
            minLength={10}
            aria-label="Del 1 monologoppgave"
          />
          <div className={s.counter}>{values.monologuePromptNo.trim().length} tegn</div>
        </section>

        <section className={s.formSection}>
          <h3 className={s.formSectionTitle}>Del 2 · Samtale</h3>
          <p style={styles.helperText}>
            Diskusjonsspørsmålet AI-sensor introduserer, og som AI-medkandidaten diskuterer med
            kandidaten.
          </p>
          <textarea
            rows={4}
            value={values.discussionPromptNo}
            onChange={(e) => set('discussionPromptNo', e.target.value)}
            placeholder="f.eks. Diskuter om myndighetene bør innføre strengere regler for persondata…"
            style={styles.textarea}
            required
            minLength={10}
            aria-label="Del 2 samtaleoppgave"
          />
          <div className={s.counter}>{values.discussionPromptNo.trim().length} tegn</div>
        </section>

        <section className={s.formSection}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <h3 className={s.formSectionTitle}>Del 3 · Oppfølgingsspørsmål</h3>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{filledQuestions} utfylt</span>
          </div>
          <p style={styles.helperText}>
            Legg inn 3–6 spørsmål. Hver prøve trekker opptil 3 tilfeldige spørsmål i tilfeldig
            rekkefølge.
          </p>

          {values.followUpQuestions.map((q, idx) => (
            <div key={idx} className={s.questionRow}>
              <span className={s.questionIndex}>{idx + 1}.</span>
              <input
                type="text"
                value={q}
                onChange={(e) => handleQuestionChange(idx, e.target.value)}
                placeholder={`Oppfølgingsspørsmål ${idx + 1}…`}
                style={{ ...styles.input, marginBottom: 0, flex: 1 }}
                aria-label={`Oppfølgingsspørsmål ${idx + 1}`}
              />
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => removeQuestionField(idx)}
                disabled={values.followUpQuestions.length <= 1}
                title="Fjern spørsmål"
                aria-label={`Fjern spørsmål ${idx + 1}`}
              >
                ✕
              </button>
            </div>
          ))}

          {filledQuestions < 3 && (
            <div className={s.hint} style={{ marginLeft: 36 }}>
              Under 3 spørsmål: kandidatene får færre enn 3 oppfølgingsspørsmål i Del 3.
            </div>
          )}

          <button
            type="button"
            className={cx(s.btn, s.btnSm)}
            style={{ marginTop: 10, marginLeft: 36 }}
            onClick={addQuestionField}
          >
            + Legg til spørsmål
          </button>
        </section>
      </form>
      {confirmDialog}
    </Drawer>
  );
}
