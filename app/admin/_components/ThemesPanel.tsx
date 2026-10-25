'use client';

import React, { useMemo, useState } from 'react';
import s from './admin.module.css';
import { colors } from './styles';
import { ThemeFormDrawer } from './ThemeFormDrawer';
import {
  cx,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  SkeletonRows,
  Switch,
  useConfirm,
  useDebouncedValue,
  usePagination,
  type Notify,
} from './ui';
import type { AdminExamTheme, AdminRequest, ExamFilterPreset } from './types';

interface ThemesPanelProps {
  themes: AdminExamTheme[];
  unthemedCount: number;
  isLoading: boolean;
  request: AdminRequest;
  notify: Notify;
  onThemesChange: (updater: (prev: AdminExamTheme[]) => AdminExamTheme[]) => void;
  onReload: () => Promise<void>;
  onShowExams: (preset: ExamFilterPreset) => void;
}

const COLUMN_COUNT = 6;

export function ThemesPanel({
  themes,
  unthemedCount,
  isLoading,
  request,
  notify,
  onThemesChange,
  onReload,
  onShowExams,
}: ThemesPanelProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase());
  const [form, setForm] = useState<{ key: number; theme: AdminExamTheme | null } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const filteredThemes = useMemo(() => {
    if (!debouncedSearch) return themes;
    return themes.filter((t) =>
      `${t.titleNo} ${t.descriptionNo ?? ''} ${t.slug}`.toLowerCase().includes(debouncedSearch)
    );
  }, [themes, debouncedSearch]);

  const { page, setPage, pageSize, setPageSize, pageItems, total } = usePagination(
    filteredThemes,
    debouncedSearch
  );

  const handleSaved = async (message: string) => {
    setForm(null);
    notify.success(message);
    await onReload();
  };

  const handleToggle = async (theme: AdminExamTheme) => {
    const next = !theme.isActive;
    onThemesChange((prev) => prev.map((t) => (t.id === theme.id ? { ...t, isActive: next } : t)));
    try {
      await request(`/api/admin/themes/${encodeURIComponent(theme.id)}`, 'PATCH', { isActive: next });
      notify.success(`Tema «${theme.titleNo}» er nå ${next ? 'aktivt' : 'deaktivert'}.`);
    } catch (err) {
      onThemesChange((prev) => prev.map((t) => (t.id === theme.id ? { ...t, isActive: theme.isActive } : t)));
      notify.error(err instanceof Error ? err.message : 'Kunne ikke oppdatere tema');
    }
  };

  const handleDelete = async (theme: AdminExamTheme) => {
    const ok = await confirm({
      title: 'Slette tema?',
      message: `Temaet «${theme.titleNo}» slettes. Oppgavesettene beholdes, men blir uten tema.`,
      confirmLabel: 'Slett tema',
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/api/admin/themes/${encodeURIComponent(theme.id)}`, 'DELETE');
      notify.success(`Tema «${theme.titleNo}» ble slettet.`);
      await onReload();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Sletting mislyktes');
    }
  };

  const countButton = (theme: AdminExamTheme, level: 'B1' | 'B2') => {
    const count = theme.setCounts?.[level] ?? 0;
    return (
      <button
        type="button"
        className={s.countLink}
        disabled={count === 0}
        onClick={() => onShowExams({ themeId: theme.id, level })}
        title={count > 0 ? `Vis ${level}-sett i «${theme.titleNo}»` : undefined}
      >
        {count}
      </button>
    );
  };

  return (
    <>
      <PageHeader
        title="Temaer"
        subtitle="Kandidater velger et tema (eller tilfeldig). Innen et tema trekkes Del 1, 2 og 3 tilfeldig fra temaets oppgavesett. Ved tilfeldig prøve trekkes hver del fra ulike temaer."
        actions={
          <button
            type="button"
            className={cx(s.btn, s.btnPrimary)}
            onClick={() => setForm({ key: Date.now(), theme: null })}
          >
            + Nytt tema
          </button>
        }
      />

      {unthemedCount > 0 && (
        <div className={s.notice}>
          <span>⚠ {unthemedCount} oppgavesett mangler tema og vises ikke som eget tema for kandidatene.</span>
          <button type="button" className={s.linkBtn} onClick={() => onShowExams({ themeId: 'NONE' })}>
            Vis sett
          </button>
        </div>
      )}

      <section className={s.card}>
        <div className={s.toolbar}>
          <SearchInput value={search} onChange={setSearch} placeholder="Søk i temaer…" />
          <div className={s.toolbarSpacer} />
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            {themes.filter((t) => t.isActive).length} av {themes.length} aktive
          </span>
        </div>

        {!isLoading && filteredThemes.length === 0 ? (
          <EmptyState
            icon="🗂"
            title={themes.length === 0 ? 'Ingen temaer ennå' : 'Ingen treff'}
            text={themes.length === 0 ? 'Opprett et tema for å gruppere oppgavesett.' : undefined}
          />
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Tema</th>
                  <th className={s.num}>B1-sett</th>
                  <th className={s.num}>B2-sett</th>
                  <th className={s.num}>Totalt</th>
                  <th>Aktiv</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading && themes.length === 0 ? (
                  <SkeletonRows columns={COLUMN_COUNT} rows={4} />
                ) : (
                  pageItems.map((theme) => {
                    const totalSets = (theme.setCounts?.B1 ?? 0) + (theme.setCounts?.B2 ?? 0);
                    return (
                      <tr key={theme.id} className={cx(!theme.isActive && s.rowInactive)}>
                        <td>
                          <div className={s.rowTitle}>{theme.titleNo}</div>
                          {theme.descriptionNo && <div className={s.rowSub}>{theme.descriptionNo}</div>}
                        </td>
                        <td className={s.num}>{countButton(theme, 'B1')}</td>
                        <td className={s.num}>{countButton(theme, 'B2')}</td>
                        <td className={s.num}>
                          <button
                            type="button"
                            className={s.countLink}
                            disabled={totalSets === 0}
                            onClick={() => onShowExams({ themeId: theme.id })}
                          >
                            {totalSets}
                          </button>
                        </td>
                        <td>
                          <Switch
                            checked={theme.isActive}
                            onChange={() => handleToggle(theme)}
                            title={theme.isActive ? 'Aktivt – klikk for å deaktivere' : 'Deaktivert – klikk for å aktivere'}
                          />
                        </td>
                        <td>
                          <div className={s.rowActions}>
                            <button
                              type="button"
                              className={cx(s.btn, s.btnSm)}
                              onClick={() => setForm({ key: Date.now(), theme })}
                            >
                              Rediger
                            </button>
                            <button
                              type="button"
                              className={cx(s.btn, s.btnGhost, s.btnSm)}
                              style={{ color: colors.danger }}
                              onClick={() => handleDelete(theme)}
                            >
                              Slett
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {total > Math.min(20, pageSize) && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="temaer"
          />
        )}
      </section>

      {form && (
        <ThemeFormDrawer
          key={form.key}
          theme={form.theme}
          nextSortOrder={themes.length}
          request={request}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
        />
      )}
      {confirmDialog}
    </>
  );
}
