'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import s from './admin.module.css';
import { colors, styles } from './styles';
import {
  Badge,
  cx,
  Drawer,
  EmptyState,
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
import type { AdminPromoCode, AdminRequest } from './types';

interface PromoCodesPanelProps {
  request: AdminRequest;
  notify: Notify;
  onCountChange: (count: number) => void;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const COLUMN_COUNT = 7;

/** `<input type="date">` value → end of that day in the admin's timezone, so the code works all day. */
function endOfDayIso(date: string): string | null {
  return date ? new Date(`${date}T23:59:59`).toISOString() : null;
}

function formatAdminDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function PromoCodesPanel({ request, notify, onCountChange }: PromoCodesPanelProps) {
  const [codes, setCodes] = useState<AdminPromoCode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [confirm, confirmDialog] = useConfirm();

  const loadCodes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await request('/api/admin/promo-codes', 'GET');
      const list: AdminPromoCode[] = Array.isArray(data.promoCodes) ? data.promoCodes : [];
      setCodes(list);
      onCountChange(list.length);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kunne ikke laste kampanjekoder');
    } finally {
      setIsLoading(false);
    }
    // `request` closes over the admin secret, which can't change while this section is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const filteredCodes = useMemo(
    () =>
      codes.filter((promo) => {
        if (statusFilter === 'ACTIVE' && !promo.isActive) return false;
        if (statusFilter === 'INACTIVE' && promo.isActive) return false;
        if (debouncedSearch && !`${promo.code} ${promo.note ?? ''}`.toLowerCase().includes(debouncedSearch)) {
          return false;
        }
        return true;
      }),
    [codes, statusFilter, debouncedSearch]
  );

  const { page, setPage, pageSize, setPageSize, pageItems, total } = usePagination(
    filteredCodes,
    `${statusFilter}|${debouncedSearch}`
  );

  const handleToggleActive = async (promo: AdminPromoCode) => {
    try {
      await request(`/api/admin/promo-codes/${promo.id}`, 'PATCH', { isActive: !promo.isActive });
      notify.success(`«${promo.code}» er ${promo.isActive ? 'deaktivert' : 'aktivert'}.`);
      await loadCodes();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kunne ikke oppdatere kampanjekode');
    }
  };

  const handleDelete = async (promo: AdminPromoCode) => {
    const ok = await confirm({
      title: 'Slette kampanjekode?',
      message: `«${promo.code}» slettes permanent.`,
      confirmLabel: 'Slett',
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/api/admin/promo-codes/${promo.id}`, 'DELETE');
      notify.success(`«${promo.code}» ble slettet.`);
      await loadCodes();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kunne ikke slette kampanjekode');
    }
  };

  return (
    <>
      <PageHeader
        title="Kampanjekoder"
        subtitle="Gir Standard eller Premium gratis i et valgt antall måneder, uten betalingskort. Koden kan brukes på nett og Android (Apple tillater ikke egne koder i iOS-appen)."
        actions={
          <>
            <button type="button" className={s.btn} onClick={loadCodes} disabled={isLoading}>
              {isLoading ? 'Oppdaterer…' : '↻ Oppfrisk'}
            </button>
            <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={() => setIsFormOpen(true)}>
              + Ny kode
            </button>
          </>
        }
      />

      <section className={s.card}>
        <div className={s.toolbar}>
          <SearchInput value={search} onChange={setSearch} placeholder="Søk etter kode eller notat…" />
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
        </div>

        {!isLoading && filteredCodes.length === 0 ? (
          <EmptyState
            icon="🎟"
            title={codes.length === 0 ? 'Ingen kampanjekoder ennå' : 'Ingen treff'}
            action={
              codes.length === 0 ? (
                <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={() => setIsFormOpen(true)}>
                  + Ny kode
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Plan</th>
                  <th className={s.num}>Måneder</th>
                  <th className={s.num}>Brukt</th>
                  <th>Utløper</th>
                  <th>Aktiv</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading && codes.length === 0 ? (
                  <SkeletonRows columns={COLUMN_COUNT} rows={4} />
                ) : (
                  pageItems.map((promo) => (
                    <tr key={promo.id} className={cx(!promo.isActive && s.rowInactive)}>
                      <td>
                        <div className={cx(s.rowTitle, s.mono)}>{promo.code}</div>
                        {promo.note && <div className={s.rowSub}>{promo.note}</div>}
                      </td>
                      <td>
                        <Badge tone={promo.tier === 'PREMIUM' ? 'premium' : 'b1'}>
                          {promo.tier === 'PREMIUM' ? 'Premium' : 'Standard'}
                        </Badge>
                      </td>
                      <td className={s.num}>{promo.durationMonths}</td>
                      <td className={s.num}>
                        {promo.redemptionCount} / {promo.maxRedemptions ?? '∞'}
                      </td>
                      <td>{formatAdminDate(promo.expiresAt)}</td>
                      <td>
                        <Switch checked={promo.isActive} onChange={() => handleToggleActive(promo)} />
                      </td>
                      <td>
                        <div className={s.rowActions}>
                          {promo.redemptionCount === 0 && (
                            <button
                              type="button"
                              className={cx(s.btn, s.btnGhost, s.btnSm)}
                              style={{ color: colors.danger }}
                              onClick={() => handleDelete(promo)}
                            >
                              Slett
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
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
          itemLabel="koder"
        />
      </section>

      {isFormOpen && (
        <PromoCodeFormDrawer
          request={request}
          onClose={() => setIsFormOpen(false)}
          onCreated={async (createdCode) => {
            setIsFormOpen(false);
            notify.success(`Kampanjekode «${createdCode}» ble opprettet.`);
            await loadCodes();
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

interface PromoCodeFormDrawerProps {
  request: AdminRequest;
  onClose: () => void;
  onCreated: (code: string) => void;
}

function PromoCodeFormDrawer({ request, onClose, onCreated }: PromoCodeFormDrawerProps) {
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [code, setCode] = useState<string>('');
  const [tier, setTier] = useState<'STANDARD' | 'PREMIUM'>('PREMIUM');
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [maxRedemptions, setMaxRedemptions] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      const data = await request('/api/admin/promo-codes', 'POST', {
        code: code.trim() || undefined,
        tier,
        discountPercent: 100,
        durationMonths,
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions, 10) : null,
        expiresAt: endOfDayIso(expiresAt),
        note: note.trim() || null,
      });
      onCreated(data.promoCode.code);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Kunne ikke opprette kampanjekode');
      setIsSaving(false);
    }
  };

  return (
    <Drawer
      open
      narrow
      title="Ny kampanjekode"
      subtitle="100 % rabatt i valgt antall måneder. Delvis rabatt støttes ikke ennå."
      onClose={() => !isSaving && onClose()}
      footer={
        <>
          <span />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={s.btn} onClick={onClose} disabled={isSaving}>
              Avbryt
            </button>
            <button type="submit" form="promo-form" className={cx(s.btn, s.btnPrimary)} disabled={isSaving}>
              {isSaving ? 'Oppretter…' : 'Opprett kode'}
            </button>
          </div>
        </>
      }
    >
      {formError && <div className={s.formError}>{formError}</div>}
      <form id="promo-form" onSubmit={handleCreate} className={s.formGrid}>
        <div className={s.formGridFull}>
          <label style={styles.label}>Kode</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Tom = genereres automatisk"
            maxLength={32}
            style={{ ...styles.input, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
            autoFocus
          />
        </div>
        <div>
          <label style={styles.label}>Plan</label>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as 'STANDARD' | 'PREMIUM')}
            style={styles.select}
          >
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </div>
        <div>
          <label style={styles.label}>Varighet (måneder)</label>
          <input
            type="number"
            min="1"
            max="24"
            value={durationMonths}
            onChange={(e) => setDurationMonths(Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            style={styles.input}
            required
          />
        </div>
        <div>
          <label style={styles.label}>Maks antall bruk</label>
          <input
            type="number"
            min="1"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            placeholder="Ubegrenset"
            style={styles.input}
          />
        </div>
        <div>
          <label style={styles.label}>Kan brukes til og med</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={styles.input} />
        </div>
        <div className={s.formGridFull}>
          <label style={styles.label}>Notat</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="F.eks. Influencer-kampanje"
            style={styles.input}
          />
        </div>
      </form>
    </Drawer>
  );
}
