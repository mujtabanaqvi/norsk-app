'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import s from './admin.module.css';
import { colors } from './styles';
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
  useConfirm,
  useDebouncedValue,
  type Notify,
} from './ui';
import type { AdminRequest, AdminUser, AdminUserDetail, PaymentProvider, Tier } from './types';

interface UsersPanelProps {
  request: AdminRequest;
  notify: Notify;
  onCountChange: (count: number) => void;
}

type TierFilter = 'ALL' | Tier;
type ProviderFilter = 'ALL' | PaymentProvider | 'NONE';
type StatusFilter = 'ALL' | 'ACTIVE' | 'DEACTIVATED';
type VerifiedFilter = 'ALL' | 'YES' | 'NO';
type SortKey = 'newest' | 'oldest' | 'lastActive';

const COLUMN_COUNT = 7;

const TIER_LABELS: Record<Tier, string> = { FREE: 'Gratis', STANDARD: 'Standard', PREMIUM: 'Premium' };
const TIER_TONES = { FREE: 'neutral', STANDARD: 'b1', PREMIUM: 'premium' } as const;

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  STRIPE: 'Nett',
  APPLE: 'App Store',
  GOOGLE: 'Google Play',
  PROMO: 'Kampanjekode',
};

const SIGN_IN_LABELS: Record<string, string> = { credential: 'E-post og passord', google: 'Google', apple: 'Apple' };

function formatAdminDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function Avatar({ user }: { user: Pick<AdminUser, 'name' | 'email' | 'image'> }) {
  if (user.image) {
    return <img className={s.avatar} src={user.image} alt="" referrerPolicy="no-referrer" />;
  }
  return (
    <span className={s.avatar} aria-hidden>
      {(user.name || user.email).charAt(0).toUpperCase()}
    </span>
  );
}

/** Deactivate/reactivate and delete, shared by the table rows and the detail drawer. */
function useUserActions(request: AdminRequest, notify: Notify, onChanged: () => void) {
  const [confirm, confirmDialog] = useConfirm();

  const toggleActive = async (user: Pick<AdminUser, 'id' | 'email' | 'deactivatedAt'>) => {
    const deactivate = !user.deactivatedAt;
    if (deactivate) {
      const ok = await confirm({
        title: 'Deaktivere bruker?',
        message: `${user.email} logges ut på alle enheter og kan ikke logge inn før kontoen aktiveres igjen. Ingen data slettes.`,
        confirmLabel: 'Deaktiver',
        danger: true,
      });
      if (!ok) return false;
    }
    try {
      await request(`/api/admin/users/${encodeURIComponent(user.id)}`, 'PATCH', { isActive: !deactivate });
      notify.success(`${user.email} er ${deactivate ? 'deaktivert' : 'aktivert igjen'}.`);
      onChanged();
      return true;
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kunne ikke oppdatere bruker');
      return false;
    }
  };

  const remove = async (user: Pick<AdminUser, 'id' | 'email'>, detail?: AdminUserDetail) => {
    let hasActivePaidSubscription = detail?.hasActivePaidSubscription ?? false;
    if (!detail) {
      try {
        const loaded: AdminUserDetail = await request(`/api/admin/users/${encodeURIComponent(user.id)}`, 'GET');
        hasActivePaidSubscription = loaded.hasActivePaidSubscription;
      } catch {
        // The warning is a nicety; the delete itself doesn't depend on it
      }
    }
    const ok = await confirm({
      title: 'Slette bruker permanent?',
      message:
        `${user.email} og alle data (eksamener, transkripsjoner, læringsprofil, abonnementer, verving og innlogginger) slettes for godt. Dette kan ikke angres.` +
        (hasActivePaidSubscription
          ? ' NB: Brukeren har et aktivt betalt abonnement. Sletting stopper ikke betalingen i App Store / Google Play — brukeren må si det opp selv.'
          : ''),
      confirmLabel: 'Slett permanent',
      danger: true,
      requireText: user.email,
    });
    if (!ok) return false;
    try {
      await request(`/api/admin/users/${encodeURIComponent(user.id)}`, 'DELETE', { confirmEmail: user.email });
      notify.success(`${user.email} ble slettet.`);
      onChanged();
      return true;
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kunne ikke slette bruker');
      return false;
    }
  };

  return { toggleActive, remove, confirmDialog };
}

export function UsersPanel({ request, notify, onCountChange }: UsersPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [tier, setTier] = useState<TierFilter>('ALL');
  const [provider, setProvider] = useState<ProviderFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [verified, setVerified] = useState<VerifiedFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Back to page 1 whenever the filters change (same approach as usePagination)
  const filterKey = `${debouncedSearch}|${tier}|${provider}|${status}|${verified}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }
  const hasFilters =
    debouncedSearch !== '' || tier !== 'ALL' || provider !== 'ALL' || status !== 'ALL' || verified !== 'ALL';

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const latestRequest = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequest.current;
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      q: debouncedSearch,
      tier,
      provider,
      status,
      verified,
      sort,
    });
    setIsLoading(true);
    request(`/api/admin/users?${query}`, 'GET')
      .then((data) => {
        if (requestId !== latestRequest.current) return; // a newer filter/page request has been sent
        setUsers(Array.isArray(data.users) ? data.users : []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        // A page emptied by a delete: step back to the last page that still has users
        if (data.users?.length === 0 && data.total > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(data.total / pageSize)));
        }
      })
      .catch((err) => {
        if (requestId === latestRequest.current) {
          notify.error(err instanceof Error ? err.message : 'Kunne ikke laste brukere');
        }
      })
      .finally(() => {
        if (requestId === latestRequest.current) setIsLoading(false);
      });
    // `request` closes over the admin secret, which can't change while this section is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, tier, provider, status, verified, sort, reloadKey]);

  // The sidebar shows the total number of users, so only report counts from unfiltered loads
  useEffect(() => {
    if (!hasFilters && !isLoading) onCountChange(total);
  }, [hasFilters, isLoading, total, onCountChange]);

  const { toggleActive, remove, confirmDialog } = useUserActions(request, notify, reload);

  const resetFilters = () => {
    setSearch('');
    setTier('ALL');
    setProvider('ALL');
    setStatus('ALL');
    setVerified('ALL');
  };

  return (
    <>
      <PageHeader
        title="Brukere"
        subtitle="Søk etter brukere, se abonnement og bruk, og deaktiver eller slett kontoer."
        actions={
          <button type="button" className={s.btn} onClick={reload} disabled={isLoading}>
            {isLoading ? 'Oppdaterer…' : '↻ Oppfrisk'}
          </button>
        }
      />

      <section className={s.card}>
        <div className={s.toolbar}>
          <SearchInput value={search} onChange={setSearch} placeholder="Søk etter navn eller e-post…" />
          <SegmentedControl
            ariaLabel="Plan"
            value={tier}
            onChange={setTier}
            options={[
              { value: 'ALL', label: 'Alle' },
              { value: 'FREE', label: 'Gratis' },
              { value: 'STANDARD', label: 'Standard' },
              { value: 'PREMIUM', label: 'Premium' },
            ]}
          />
          <select
            className={cx(s.field, s.selectField)}
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderFilter)}
            aria-label="Betalingskilde"
          >
            <option value="ALL">Alle betalingskilder</option>
            <option value="APPLE">App Store</option>
            <option value="GOOGLE">Google Play</option>
            <option value="STRIPE">Nett</option>
            <option value="PROMO">Kampanjekode</option>
            <option value="NONE">Uten aktivt abonnement</option>
          </select>
          <select
            className={cx(s.field, s.selectField)}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Status"
          >
            <option value="ALL">Alle statuser</option>
            <option value="ACTIVE">Aktive</option>
            <option value="DEACTIVATED">Deaktiverte</option>
          </select>
          <select
            className={cx(s.field, s.selectField)}
            value={verified}
            onChange={(e) => setVerified(e.target.value as VerifiedFilter)}
            aria-label="E-post bekreftet"
          >
            <option value="ALL">E-post: alle</option>
            <option value="YES">E-post bekreftet</option>
            <option value="NO">E-post ikke bekreftet</option>
          </select>
          <span className={s.toolbarSpacer} />
          <select
            className={cx(s.field, s.selectField)}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sortering"
          >
            <option value="newest">Nyeste først</option>
            <option value="oldest">Eldste først</option>
            <option value="lastActive">Sist aktiv</option>
          </select>
        </div>

        {!isLoading && users.length === 0 ? (
          <EmptyState
            icon="👥"
            title={hasFilters ? 'Ingen treff' : 'Ingen brukere ennå'}
            action={
              hasFilters ? (
                <button type="button" className={s.btn} onClick={resetFilters}>
                  Nullstill filtre
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Bruker</th>
                  <th>Plan</th>
                  <th className={s.num}>Eksamener</th>
                  <th>Sist aktiv</th>
                  <th>Registrert</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading && users.length === 0 ? (
                  <SkeletonRows columns={COLUMN_COUNT} rows={6} />
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className={cx(user.deactivatedAt && s.rowInactive)}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <td>
                        <div className={s.userCell}>
                          <Avatar user={user} />
                          <div style={{ minWidth: 0 }}>
                            <div className={s.rowTitle}>
                              {user.name}
                              {user.role === 'ADMIN' && (
                                <>
                                  {' '}
                                  <Badge tone="warning">Admin</Badge>
                                </>
                              )}
                            </div>
                            <div className={s.rowSub}>
                              {user.email}
                              {!user.emailVerified && <span style={{ color: colors.warning }}> · ikke bekreftet</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={TIER_TONES[user.subscriptionTier]}>{TIER_LABELS[user.subscriptionTier]}</Badge>
                        {user.activeProvider && <div className={s.rowSub}>{PROVIDER_LABELS[user.activeProvider]}</div>}
                      </td>
                      <td className={s.num}>{user.examCount}</td>
                      <td>{formatAdminDate(user.lastExamAt)}</td>
                      <td>{formatAdminDate(user.createdAt)}</td>
                      <td>
                        {user.deactivatedAt ? (
                          <Badge tone="warning">Deaktivert</Badge>
                        ) : (
                          <Badge tone="success">Aktiv</Badge>
                        )}
                      </td>
                      <td>
                        <div className={s.rowActions} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={() => toggleActive(user)}>
                            {user.deactivatedAt ? 'Aktiver' : 'Deaktiver'}
                          </button>
                          <button
                            type="button"
                            className={cx(s.btn, s.btnGhost, s.btnSm)}
                            style={{ color: colors.danger }}
                            onClick={() => remove(user)}
                          >
                            Slett
                          </button>
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
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="brukere"
        />
      </section>

      {selectedUserId && (
        <UserDetailDrawer
          userId={selectedUserId}
          request={request}
          notify={notify}
          onClose={() => setSelectedUserId(null)}
          onChanged={reload}
        />
      )}
      {confirmDialog}
    </>
  );
}

interface UserDetailDrawerProps {
  userId: string;
  request: AdminRequest;
  notify: Notify;
  onClose: () => void;
  onChanged: () => void;
}

function UserDetailDrawer({ userId, request, notify, onClose, onChanged }: UserDetailDrawerProps) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await request(`/api/admin/users/${encodeURIComponent(userId)}`, 'GET'));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Kunne ikke hente bruker');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const { toggleActive, remove, confirmDialog } = useUserActions(request, notify, onChanged);

  const handleToggle = async () => {
    if (!detail) return;
    setIsBusy(true);
    if (await toggleActive(detail.user)) await load();
    setIsBusy(false);
  };

  const handleDelete = async () => {
    if (!detail) return;
    setIsBusy(true);
    if (await remove(detail.user, detail)) onClose();
    else setIsBusy(false);
  };

  const user = detail?.user;
  const examTotal = detail ? Object.values(detail.exams).reduce((sum, n) => sum + (n ?? 0), 0) : 0;

  return (
    <>
      <Drawer
        open
        narrow
        title={user?.name ?? 'Bruker'}
        subtitle={user?.email}
        onClose={onClose}
        footer={
          detail && (
            <>
              <button
                type="button"
                className={cx(s.btn, s.btnDanger)}
                onClick={handleDelete}
                disabled={isBusy}
              >
                Slett bruker
              </button>
              <button type="button" className={s.btn} onClick={handleToggle} disabled={isBusy}>
                {detail.user.deactivatedAt ? 'Aktiver konto' : 'Deaktiver konto'}
              </button>
            </>
          )
        }
      >
        {loadError && <div className={s.formError}>{loadError}</div>}
        {!detail && !loadError && <p style={{ color: colors.muted }}>Laster…</p>}
        {detail && user && (
          <>
            <div className={s.formSection}>
              <div className={s.userCell} style={{ marginBottom: 12 }}>
                <Avatar user={user} />
                <div>
                  <Badge tone={TIER_TONES[user.subscriptionTier]}>{TIER_LABELS[user.subscriptionTier]}</Badge>{' '}
                  {user.deactivatedAt ? (
                    <Badge tone="warning">Deaktivert {formatAdminDate(user.deactivatedAt)}</Badge>
                  ) : (
                    <Badge tone="success">Aktiv</Badge>
                  )}{' '}
                  {user.role === 'ADMIN' && <Badge tone="warning">Admin</Badge>}
                </div>
              </div>
              <dl className={s.detailList} style={{ listStyle: 'none', paddingLeft: 0 }}>
                <DetailRow label="Registrert" value={formatAdminDate(user.createdAt)} />
                <DetailRow label="E-post bekreftet" value={user.emailVerified ? 'Ja' : 'Nei'} />
                <DetailRow
                  label="Innlogging"
                  value={detail.signInMethods.map((m) => SIGN_IN_LABELS[m] ?? m).join(', ') || '—'}
                />
                <DetailRow label="Vervekode" value={<span className={s.mono}>{user.referralCode}</span>} />
                <DetailRow
                  label="Vervet av"
                  value={detail.referredBy ? `${detail.referredBy.name} (${detail.referredBy.email})` : '—'}
                />
                <DetailRow label="Har vervet" value={String(detail.referralCount)} />
                <DetailRow label="Bruker-ID" value={<span className={s.mono}>{user.id}</span>} />
              </dl>
            </div>

            <div className={s.formSection}>
              <h3 className={s.formSectionTitle}>Bruk</h3>
              <dl className={s.detailList} style={{ listStyle: 'none', paddingLeft: 0 }}>
                <DetailRow
                  label="Eksamener"
                  value={`${examTotal} (${detail.exams.COMPLETED ?? 0} fullført, ${detail.exams.FAILED ?? 0} feilet, ${detail.exams.ACTIVE ?? 0} pågår)`}
                />
                {detail.usage && (
                  <>
                    <DetailRow
                      label="Taletid i dag"
                      value={`${Math.max(0, Math.round(detail.usage.audioUsedTodaySeconds / 60))} / ${Math.round(detail.usage.dailyAudioSeconds / 60)} min brukt`}
                    />
                    <DetailRow label="Taletid brukt" value={`${Math.round(detail.usage.totalSttSecondsUsed / 60)} min`} />
                    <DetailRow label="LLM-tokens" value={detail.usage.totalLlmTokensUsed.toLocaleString('nb-NO')} />
                    <DetailRow label="Kostnad" value={`$${detail.usage.totalCostUsd.toFixed(2)}`} />
                  </>
                )}
              </dl>
            </div>

            <div className={s.formSection}>
              <h3 className={s.formSectionTitle}>Abonnementer</h3>
              {detail.subscriptions.length === 0 ? (
                <p className={s.detailText}>Ingen abonnementer.</p>
              ) : (
                <ul className={s.detailList}>
                  {detail.subscriptions.map((sub) => (
                    <li key={sub.id}>
                      {TIER_LABELS[sub.tier]} via {PROVIDER_LABELS[sub.provider]} — {sub.status.toLowerCase()}
                      {sub.cancelAtPeriodEnd ? ', sagt opp' : ''}, til {formatAdminDate(sub.currentPeriodEnd)}
                      {sub.environment === 'sandbox' ? ' (sandbox)' : ''}
                    </li>
                  ))}
                </ul>
              )}
              {detail.promoRedemptions.length > 0 && (
                <p className={s.detailText} style={{ marginTop: 8 }}>
                  Kampanjekoder:{' '}
                  {detail.promoRedemptions
                    .map((r) => `${r.code} (${formatAdminDate(r.redeemedAt)})`)
                    .join(', ')}
                </p>
              )}
            </div>
          </>
        )}
      </Drawer>
      {confirmDialog}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', padding: '3px 0' }}>
      <dt style={{ color: colors.muted }}>{label}</dt>
      <dd style={{ margin: 0, textAlign: 'right', wordBreak: 'break-all' }}>{value}</dd>
    </div>
  );
}
