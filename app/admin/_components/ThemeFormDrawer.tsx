'use client';

import React, { useState } from 'react';
import s from './admin.module.css';
import { styles } from './styles';
import { cx, Drawer } from './ui';
import type { AdminExamTheme, AdminRequest } from './types';

interface ThemeFormDrawerProps {
  /** Theme being edited, or null to create a new one. */
  theme: AdminExamTheme | null;
  nextSortOrder: number;
  request: AdminRequest;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Mounted only while open; the parent remounts it (via `key`) for each new edit session. */
export function ThemeFormDrawer({ theme, nextSortOrder, request, onClose, onSaved }: ThemeFormDrawerProps) {
  const [title, setTitle] = useState(theme?.titleNo ?? '');
  const [description, setDescription] = useState(theme?.descriptionNo ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setFormError(null);
    setIsSaving(true);
    try {
      if (theme) {
        await request(`/api/admin/themes/${encodeURIComponent(theme.id)}`, 'PATCH', {
          titleNo: title.trim(),
          descriptionNo: description.trim() || null,
        });
        onSaved(`Tema «${title.trim()}» ble oppdatert.`);
      } else {
        await request('/api/admin/themes', 'POST', {
          titleNo: title.trim(),
          descriptionNo: description.trim() || null,
          sortOrder: nextSortOrder,
        });
        onSaved(`Tema «${title.trim()}» ble opprettet.`);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Kunne ikke lagre tema');
      setIsSaving(false);
    }
  };

  return (
    <Drawer
      open
      narrow
      title={theme ? 'Rediger tema' : 'Nytt tema'}
      subtitle="Kandidater kan velge et tema når de starter en prøve."
      onClose={() => !isSaving && onClose()}
      footer={
        <>
          <span />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={s.btn} onClick={onClose} disabled={isSaving}>
              Avbryt
            </button>
            <button
              type="submit"
              form="theme-form"
              className={cx(s.btn, s.btnPrimary)}
              disabled={isSaving || title.trim().length < 2}
            >
              {isSaving ? 'Lagrer…' : theme ? 'Lagre endringer' : 'Opprett tema'}
            </button>
          </div>
        </>
      }
    >
      {formError && <div className={s.formError}>{formError}</div>}
      <form id="theme-form" onSubmit={handleSubmit}>
        <label style={styles.label} htmlFor="theme-title">
          Navn *
        </label>
        <input
          id="theme-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="f.eks. Familie og barn"
          style={{ ...styles.input, marginBottom: 16 }}
          required
          minLength={2}
          autoFocus
        />
        <label style={styles.label} htmlFor="theme-description">
          Beskrivelse <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(valgfritt)</span>
        </label>
        <textarea
          id="theme-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Kort beskrivelse som vises for kandidatene"
          style={styles.textarea}
        />
      </form>
    </Drawer>
  );
}
