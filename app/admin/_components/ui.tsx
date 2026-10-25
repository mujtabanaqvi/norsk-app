'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import s from './admin.module.css';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className={s.pageHeader}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {subtitle && <p className={s.pageSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </header>
  );
}

// ---------- Badges / switch ----------

type BadgeTone = 'neutral' | 'success' | 'warning' | 'b1' | 'b2' | 'premium';

const badgeToneClass: Record<BadgeTone, string> = {
  neutral: s.badgeNeutral,
  success: s.badgeSuccess,
  warning: s.badgeWarning,
  b1: s.badgeB1,
  b2: s.badgeB2,
  premium: s.badgePremium,
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return <span className={cx(s.badge, badgeToneClass[tone])}>{children}</span>;
}

export function LevelBadge({ level }: { level: 'B1' | 'B2' }) {
  return <Badge tone={level === 'B2' ? 'b2' : 'b1'}>{level}</Badge>;
}

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  title?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, title, disabled }: SwitchProps) {
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      className={cx(s.switch, checked && s.switchOn)}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    />
  );
  if (!label) return button;
  return (
    <label className={s.switchLabel}>
      {button}
      <span>{label}</span>
    </label>
  );
}

// ---------- Inputs ----------

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className={s.segmented} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          className={cx(s.segment, value === opt.value && s.segmentActive)}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className={s.search}>
      <span className={s.searchIcon} aria-hidden>
        ⌕
      </span>
      <input
        type="search"
        className={s.field}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ---------- Pagination ----------

/**
 * Client-side paging. Jumps back to page 1 whenever `resetKey` changes (e.g. filters),
 * and clamps to the last page when items disappear (e.g. after a delete).
 */
export function usePagination<T>(items: T[], resetKey: string, initialPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
  };

  return { page: currentPage, setPage, pageSize, setPageSize, pageItems, total: items.length };
}

function pageNumbers(current: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('gap');
    result.push(p);
  });
  return result;
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  itemLabel = 'elementer',
}: PaginationProps) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className={s.pagination}>
      <span>
        Viser <strong style={{ color: 'var(--text)' }}>{first}–{last}</strong> av {total} {itemLabel}
      </span>

      {totalPages > 1 && (
        <nav className={s.pages} aria-label="Sider">
          <button
            type="button"
            className={s.pageBtn}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Forrige side"
          >
            ‹
          </button>
          {pageNumbers(page, totalPages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className={s.pageEllipsis}>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={cx(s.pageBtn, p === page && s.pageBtnActive)}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            className={s.pageBtn}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Neste side"
          >
            ›
          </button>
        </nav>
      )}

      {onPageSizeChange && (
        <label className={s.pageSize}>
          Per side
          <select
            className={cx(s.field, s.selectField)}
            style={{ minWidth: 0, padding: '5px 8px' }}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ---------- Empty / loading ----------

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: string;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={s.empty}>
      <div className={s.emptyIcon} aria-hidden>
        {icon}
      </div>
      <p className={s.emptyTitle}>{title}</p>
      {text && <p className={s.emptyText}>{text}</p>}
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c}>
              <div className={s.skeleton} style={{ width: c === 1 ? '70%' : '50%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------- Overlays ----------

function useEscapeAndScrollLock(open: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscapeRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);
}

interface DrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  narrow?: boolean;
  children: React.ReactNode;
}

export function Drawer({ open, title, subtitle, onClose, footer, narrow, children }: DrawerProps) {
  useEscapeAndScrollLock(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className={s.backdrop} onClick={onClose} />
      <aside className={cx(s.drawer, narrow && s.drawerNarrow)} role="dialog" aria-modal aria-label={title}>
        <header className={s.drawerHeader}>
          <div>
            <h2 className={s.drawerTitle}>{title}</h2>
            {subtitle && <p className={s.drawerSubtitle}>{subtitle}</p>}
          </div>
          <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={onClose} aria-label="Lukk">
            ✕
          </button>
        </header>
        <div className={s.drawerBody}>{children}</div>
        {footer && <footer className={s.drawerFooter}>{footer}</footer>}
      </aside>
    </>
  );
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

/** Promise-based replacement for `window.confirm`. Render `dialog` once in the component tree. */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(
    null
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  useEscapeAndScrollLock(pending !== null, () => close(false));

  const dialog = pending ? (
    <>
      <div className={cx(s.backdrop, s.dialogBackdrop)} onClick={() => close(false)} />
      <div className={s.dialog} role="alertdialog" aria-modal aria-label={pending.title}>
        <h2 className={s.dialogTitle}>{pending.title}</h2>
        <p className={s.dialogText}>{pending.message}</p>
        <div className={s.dialogActions}>
          <button type="button" className={s.btn} onClick={() => close(false)}>
            Avbryt
          </button>
          <button
            type="button"
            className={cx(s.btn, pending.danger ? s.btnDanger : s.btnPrimary)}
            onClick={() => close(true)}
            autoFocus
          >
            {pending.confirmLabel ?? 'Bekreft'}
          </button>
        </div>
      </div>
    </>
  ) : null;

  return [confirm, dialog];
}

// ---------- Toasts ----------

interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

export interface Notify {
  success: (message: string) => void;
  error: (message: string) => void;
}

export function useToasts(): { notify: Notify; toasts: React.ReactNode } {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { id, kind, message }]);
      // Errors stay until dismissed so they aren't missed
      if (kind === 'success') setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const [notify] = useState<Notify>(() => ({
    success: (message) => push('success', message),
    error: (message) => push('error', message),
  }));

  const toasts = (
    <div className={s.toasts} aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx(s.toast, t.kind === 'success' ? s.toastSuccess : s.toastError)}>
          <span aria-hidden>{t.kind === 'success' ? '✓' : '!'}</span>
          <span className={s.toastMessage}>{t.message}</span>
          <button type="button" className={s.toastClose} onClick={() => dismiss(t.id)} aria-label="Lukk">
            ✕
          </button>
        </div>
      ))}
    </div>
  );

  return { notify, toasts };
}
