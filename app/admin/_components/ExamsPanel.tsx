'use client';

import React, { useMemo, useState } from 'react';
import s from './admin.module.css';
import { colors } from './styles';
import { emptyExamForm, ExamFormDrawer, type ExamFormValues } from './ExamFormDrawer';
import {
  Badge,
  cx,
  EmptyState,
  LevelBadge,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  SkeletonRows,
  Switch,
  useConfirm,
  useDebouncedValue,
  usePagination,
  type Notify,
} from './ui';
import type { AdminExamTheme, AdminExamTopic, AdminRequest, ExamFilterPreset } from './types';

type LevelFilter = 'ALL' | 'B1' | 'B2';
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type SortKey = 'NEWEST' | 'TITLE' | 'SESSIONS';

interface ExamsPanelProps {
  exams: AdminExamTopic[];
  themes: AdminExamTheme[];
  isLoading: boolean;
  preset: ExamFilterPreset | null;
  request: AdminRequest;
  notify: Notify;
  onExamsChange: (updater: (prev: AdminExamTopic[]) => AdminExamTopic[]) => void;
  /** Refetches exams and themes (theme set counts depend on exams). */
  onReload: () => Promise<void>;
}

const COLUMN_COUNT = 7;

function toFormValues(exam: AdminExamTopic): ExamFormValues {
  return {
    titleNo: exam.titleNo,
    slug: exam.slug,
    level: exam.level,
    themeId: exam.themeId ?? '',
    monologuePromptNo: exam.monologuePromptNo,
    discussionPromptNo: exam.discussionPromptNo,
    followUpQuestions:
      Array.isArray(exam.followUpQuestionsNo) && exam.followUpQuestionsNo.length > 0
        ? [...exam.followUpQuestionsNo]
        : [''],
    isActive: exam.isActive,
  };
}

export function ExamsPanel({
  exams,
  themes,
  isLoading,
  preset,
  request,
  notify,
  onExamsChange,
  onReload,
}: ExamsPanelProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase());
  const [levelFilter, setLevelFilter] = useState<LevelFilter>(preset?.level ?? 'ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  // 'ALL', 'NONE' (unthemed sets) or a theme id
  const [themeFilter, setThemeFilter] = useState<string>(preset?.themeId ?? 'ALL');
  const [sortKey, setSortKey] = useState<SortKey>('NEWEST');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set());

  const [form, setForm] = useState<{ key: number; examId: string | null; values: ExamFormValues } | null>(
    null
  );
  const [confirm, confirmDialog] = useConfirm();

  const unthemedCount = useMemo(() => exams.filter((e) => !e.themeId).length, [exams]);

  const metrics = useMemo(() => {
    const activeB1 = exams.filter((e) => e.level === 'B1' && e.isActive).length;
    const activeB2 = exams.filter((e) => e.level === 'B2' && e.isActive).length;
    const totalQuestions = exams.reduce(
      (acc, e) => acc + 2 + (Array.isArray(e.followUpQuestionsNo) ? e.followUpQuestionsNo.length : 0),
      0
    );
    const totalSessions = exams.reduce((acc, e) => acc + (e.sessionCount ?? 0), 0);
    return { total: exams.length, activeB1, activeB2, totalQuestions, totalSessions };
  }, [exams]);

  const filteredExams = useMemo(() => {
    const result = exams.filter((exam) => {
      if (levelFilter !== 'ALL' && exam.level !== levelFilter) return false;
      if (statusFilter === 'ACTIVE' && !exam.isActive) return false;
      if (statusFilter === 'INACTIVE' && exam.isActive) return false;
      if (themeFilter === 'NONE' && exam.themeId) return false;
      if (themeFilter !== 'ALL' && themeFilter !== 'NONE' && exam.themeId !== themeFilter) return false;
      if (debouncedSearch) {
        const haystack = [
          exam.titleNo,
          exam.slug,
          exam.themeTitleNo ?? '',
          exam.monologuePromptNo,
          exam.discussionPromptNo,
          ...(exam.followUpQuestionsNo ?? []),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(debouncedSearch)) return false;
      }
      return true;
    });

    const collator = new Intl.Collator('nb');
    if (sortKey === 'TITLE') result.sort((a, b) => collator.compare(a.titleNo, b.titleNo));
    else if (sortKey === 'SESSIONS') result.sort((a, b) => (b.sessionCount ?? 0) - (a.sessionCount ?? 0));
    else result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return result;
  }, [exams, levelFilter, statusFilter, themeFilter, debouncedSearch, sortKey]);

  const filterKey = [levelFilter, statusFilter, themeFilter, debouncedSearch, sortKey].join('|');
  const { page, setPage, pageSize, setPageSize, pageItems, total } = usePagination(filteredExams, filterKey);

  const hasFilters =
    search !== '' || levelFilter !== 'ALL' || statusFilter !== 'ALL' || themeFilter !== 'ALL';

  const resetFilters = () => {
    setSearch('');
    setLevelFilter('ALL');
    setStatusFilter('ALL');
    setThemeFilter('ALL');
  };

  const openCreate = () => {
    setForm({
      key: Date.now(),
      examId: null,
      values: {
        ...emptyExamForm,
        themeId: themeFilter !== 'ALL' && themeFilter !== 'NONE' ? themeFilter : '',
        level: levelFilter === 'B2' ? 'B2' : 'B1',
      },
    });
  };

  const openEdit = (exam: AdminExamTopic) => {
    setForm({ key: Date.now(), examId: exam.id, values: toFormValues(exam) });
  };

  const openDuplicate = (exam: AdminExamTopic) => {
    setForm({
      key: Date.now(),
      examId: null,
      values: { ...toFormValues(exam), titleNo: `${exam.titleNo} (kopi)`, slug: '', isActive: false },
    });
  };

  const handleSaved = async (message: string) => {
    setForm(null);
    notify.success(message);
    await onReload();
  };

  const handleToggleActive = async (exam: AdminExamTopic) => {
    const next = !exam.isActive;
    setPendingToggleIds((prev) => new Set(prev).add(exam.id));
    onExamsChange((prev) => prev.map((item) => (item.id === exam.id ? { ...item, isActive: next } : item)));
    try {
      await request(`/api/admin/exams/${encodeURIComponent(exam.id)}`, 'PATCH', { isActive: next });
      notify.success(`«${exam.titleNo}» er nå ${next ? 'aktiv i trekningen' : 'deaktivert'}.`);
    } catch (err) {
      onExamsChange((prev) =>
        prev.map((item) => (item.id === exam.id ? { ...item, isActive: exam.isActive } : item))
      );
      notify.error(err instanceof Error ? err.message : 'Kunne ikke oppdatere status');
    } finally {
      setPendingToggleIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(exam.id);
        return nextSet;
      });
    }
  };

  const handleDelete = async (exam: AdminExamTopic) => {
    const ok = await confirm({
      title: 'Slette oppgavesett?',
      message: `«${exam.titleNo}» slettes permanent. ${
        exam.sessionCount ? `Settet er brukt i ${exam.sessionCount} prøver.` : ''
      }`,
      confirmLabel: 'Slett',
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/api/admin/exams/${encodeURIComponent(exam.id)}`, 'DELETE');
      onExamsChange((prev) => prev.filter((item) => item.id !== exam.id));
      notify.success(`Eksamen «${exam.titleNo}» ble slettet.`);
      await onReload();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Sletting mislyktes');
    }
  };

  return (
    <>
      <PageHeader
        title="Eksamener"
        subtitle="Aktive oppgavesett trekkes tilfeldig hver gang en kandidat starter en ny muntlig prøve."
        actions={
          <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={openCreate}>
            + Nytt oppgavesett
          </button>
        }
      />

      <section className={s.stats}>
        <div className={cx(s.card, s.stat)}>
          <div className={s.statLabel}>Oppgavesett</div>
          <div className={s.statValue}>{metrics.total}</div>
        </div>
        <div className={cx(s.card, s.stat)}>
          <div className={s.statLabel}>Aktive B1</div>
          <div className={s.statValue} style={{ color: colors.b1 }}>
            {metrics.activeB1}
          </div>
        </div>
        <div className={cx(s.card, s.stat)}>
          <div className={s.statLabel}>Aktive B2</div>
          <div className={s.statValue} style={{ color: colors.b2 }}>
            {metrics.activeB2}
          </div>
        </div>
        <div className={cx(s.card, s.stat)}>
          <div className={s.statLabel}>Spørsmål totalt</div>
          <div className={s.statValue} style={{ color: colors.success }}>
            {metrics.totalQuestions}
          </div>
        </div>
        <div className={cx(s.card, s.stat)}>
          <div className={s.statLabel}>Gjennomførte prøver</div>
          <div className={s.statValue}>{metrics.totalSessions}</div>
        </div>
      </section>

      {unthemedCount > 0 && themeFilter !== 'NONE' && (
        <div className={s.notice}>
          <span>
            ⚠ {unthemedCount} oppgavesett mangler tema og vises ikke som eget tema for kandidatene.
          </span>
          <button type="button" className={s.linkBtn} onClick={() => setThemeFilter('NONE')}>
            Vis
          </button>
        </div>
      )}

      <section className={s.card}>
        <div className={s.toolbar}>
          <SearchInput value={search} onChange={setSearch} placeholder="Søk i tittel, slug eller spørsmål…" />
          <select
            className={cx(s.field, s.selectField)}
            value={themeFilter}
            onChange={(e) => setThemeFilter(e.target.value)}
            aria-label="Filtrer på tema"
          >
            <option value="ALL">Alle temaer</option>
            {unthemedCount > 0 && <option value="NONE">Uten tema ({unthemedCount})</option>}
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titleNo}
              </option>
            ))}
          </select>
          <SegmentedControl
            ariaLabel="Nivå"
            value={levelFilter}
            onChange={setLevelFilter}
            options={[
              { value: 'ALL', label: 'Alle' },
              { value: 'B1', label: 'B1' },
              { value: 'B2', label: 'B2' },
            ]}
          />
          <SegmentedControl
            ariaLabel="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'Alle' },
              { value: 'ACTIVE', label: 'Aktive' },
              { value: 'INACTIVE', label: 'Inaktive' },
            ]}
          />
          <div className={s.toolbarSpacer} />
          {hasFilters && (
            <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={resetFilters}>
              Nullstill filtre
            </button>
          )}
          <select
            className={cx(s.field, s.selectField)}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sortering"
          >
            <option value="NEWEST">Nyeste først</option>
            <option value="TITLE">Tittel A–Å</option>
            <option value="SESSIONS">Mest brukt</option>
          </select>
        </div>

        {!isLoading && filteredExams.length === 0 ? (
          exams.length === 0 ? (
            <EmptyState
              icon="📚"
              title="Ingen oppgavesett ennå"
              text="Opprett det første settet for å komme i gang."
              action={
                <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={openCreate}>
                  + Nytt oppgavesett
                </button>
              }
            />
          ) : (
            <EmptyState
              icon="🔍"
              title="Ingen treff"
              text="Ingen oppgavesett matcher filtrene."
              action={
                <button type="button" className={s.btn} onClick={resetFilters}>
                  Nullstill filtre
                </button>
              }
            />
          )
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Oppgavesett</th>
                  <th>Nivå</th>
                  <th>Tema</th>
                  <th className={s.num} title="Antall oppfølgingsspørsmål i Del 3">
                    Del 3
                  </th>
                  <th className={s.num}>Prøver</th>
                  <th>Aktiv</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading && exams.length === 0 ? (
                  <SkeletonRows columns={COLUMN_COUNT} />
                ) : (
                  pageItems.map((exam) => {
                    const isExpanded = expandedId === exam.id;
                    return (
                      <React.Fragment key={exam.id}>
                        <tr
                          className={cx(s.row, isExpanded && s.rowExpanded, !exam.isActive && s.rowInactive)}
                          onClick={() => setExpandedId(isExpanded ? null : exam.id)}
                          aria-expanded={isExpanded}
                        >
                          <td>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <span className={cx(s.chevron, isExpanded && s.chevronOpen)} aria-hidden>
                                ›
                              </span>
                              <div>
                                <div className={s.rowTitle}>{exam.titleNo}</div>
                                <div className={cx(s.rowSub, s.mono)}>{exam.slug}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <LevelBadge level={exam.level} />
                          </td>
                          <td>
                            {exam.themeId ? (
                              <span style={{ color: '#CBD5E1' }}>{exam.themeTitleNo || 'Tema'}</span>
                            ) : (
                              <Badge tone="warning">Uten tema</Badge>
                            )}
                          </td>
                          <td className={s.num}>{exam.followUpQuestionsNo?.length ?? 0}</td>
                          <td className={s.num}>{exam.sessionCount ?? 0}</td>
                          <td>
                            <Switch
                              checked={exam.isActive}
                              disabled={pendingToggleIds.has(exam.id)}
                              onChange={() => handleToggleActive(exam)}
                              title={exam.isActive ? 'Aktiv i trekning – klikk for å deaktivere' : 'Deaktivert – klikk for å aktivere'}
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className={s.rowActions}>
                              <button type="button" className={cx(s.btn, s.btnSm)} onClick={() => openEdit(exam)}>
                                Rediger
                              </button>
                              <button
                                type="button"
                                className={cx(s.btn, s.btnGhost, s.btnSm)}
                                onClick={() => openDuplicate(exam)}
                                title="Lag en kopi som utgangspunkt for et nytt sett"
                              >
                                Dupliser
                              </button>
                              <button
                                type="button"
                                className={cx(s.btn, s.btnGhost, s.btnSm)}
                                style={{ color: colors.danger }}
                                onClick={() => handleDelete(exam)}
                              >
                                Slett
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={COLUMN_COUNT} className={s.detailCell}>
                              <div className={s.detailGrid}>
                                <div className={s.detailBox}>
                                  <div className={s.detailLabel}>DEL 1 · MONOLOG</div>
                                  <p className={s.detailText}>{exam.monologuePromptNo}</p>
                                </div>
                                <div className={s.detailBox}>
                                  <div className={s.detailLabel}>DEL 2 · SAMTALE</div>
                                  <p className={s.detailText}>{exam.discussionPromptNo}</p>
                                </div>
                                <div className={s.detailBox} style={{ gridColumn: '1 / -1' }}>
                                  <div className={s.detailLabel}>
                                    DEL 3 · OPPFØLGINGSSPØRSMÅL ({exam.followUpQuestionsNo?.length || 0} i pool → 3
                                    trekkes per prøve)
                                  </div>
                                  <ol className={s.detailList}>
                                    {(exam.followUpQuestionsNo || []).map((q, i) => (
                                      <li key={i}>{q}</li>
                                    ))}
                                  </ol>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemLabel="oppgavesett"
        />
      </section>

      {form && (
        <ExamFormDrawer
          key={form.key}
          editingExamId={form.examId}
          initialValues={form.values}
          themes={themes}
          request={request}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
        />
      )}
      {confirmDialog}
    </>
  );
}
