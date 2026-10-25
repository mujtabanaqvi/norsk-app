'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import s from './_components/admin.module.css';
import { styles } from './_components/styles';
import { cx, useToasts } from './_components/ui';
import { ExamsPanel } from './_components/ExamsPanel';
import { ThemesPanel } from './_components/ThemesPanel';
import { ConfigPanel } from './_components/ConfigPanel';
import { PromoCodesPanel } from './_components/PromoCodesPanel';
import type { AdminExamTheme, AdminExamTopic, ExamFilterPreset } from './_components/types';

const SESSION_STORAGE_KEY = 'norsk_admin_secret';

type Section = 'exams' | 'themes' | 'config' | 'promo';

const SECTIONS: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'exams', label: 'Eksamener', icon: '📚' },
  { id: 'themes', label: 'Temaer', icon: '🗂' },
  { id: 'config', label: 'Abonnement & verving', icon: '⚙️' },
  { id: 'promo', label: 'Kampanjekoder', icon: '🎟' },
];

function sectionFromHash(): Section {
  if (typeof window === 'undefined') return 'exams';
  const hash = window.location.hash.replace('#', '');
  return SECTIONS.some((sec) => sec.id === hash) ? (hash as Section) : 'exams';
}

export default function AdminPortalPage() {
  const [adminSecret, setAdminSecret] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  const [exams, setExams] = useState<AdminExamTopic[]>([]);
  const [isLoadingExams, setIsLoadingExams] = useState<boolean>(false);
  const [themes, setThemes] = useState<AdminExamTheme[]>([]);
  const [isLoadingThemes, setIsLoadingThemes] = useState<boolean>(false);
  const [promoCount, setPromoCount] = useState<number | null>(null);

  const [section, setSection] = useState<Section>(sectionFromHash);
  // Filters to open the exam list with when navigating from another section; the key remounts the panel.
  const [examPreset, setExamPreset] = useState<{ key: number; preset: ExamFilterPreset } | null>(null);

  const { notify, toasts } = useToasts();

  useEffect(() => {
    const handleHashChange = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const goTo = (next: Section) => {
    setSection(next);
    if (window.location.hash !== `#${next}`) {
      window.history.replaceState(null, '', `#${next}`);
    }
    window.scrollTo({ top: 0 });
  };

  const fetchExamsWithSecret = useCallback(async (secretToUse: string) => {
    setIsLoadingExams(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/admin/exams', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-admin-secret': secretToUse,
        },
      });

      if (res.status === 401) {
        setIsAuthenticated(false);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setAuthError('Feil admin-nøkkel. Sjekk ADMIN_SECRET (standard i dev: admin123).');
        return false;
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || errBody.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setExams(Array.isArray(data.exams) ? data.exams : []);
      setIsAuthenticated(true);
      sessionStorage.setItem(SESSION_STORAGE_KEY, secretToUse);
      return true;
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Kunne ikke hente eksamener');
      return false;
    } finally {
      setIsLoadingExams(false);
      setIsCheckingAuth(false);
    }
  }, [notify]);

  const fetchThemesWithSecret = useCallback(async (secretToUse: string) => {
    setIsLoadingThemes(true);
    try {
      const res = await fetch('/api/admin/themes', {
        headers: {
          Accept: 'application/json',
          'x-admin-secret': secretToUse,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setThemes(Array.isArray(data.themes) ? data.themes : []);
      }
    } catch (err) {
      console.error('Failed to load themes:', err);
    } finally {
      setIsLoadingThemes(false);
    }
  }, []);

  const adminJsonRequest = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-admin-secret': adminSecret,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const fieldIssues = data.issues ? Object.values(data.issues).flat().join(' ') : '';
      throw new Error(fieldIssues || data.message || data.error || `HTTP ${res.status}`);
    }
    return data;
  };

  const reloadExamsAndThemes = async () => {
    await Promise.all([fetchExamsWithSecret(adminSecret), fetchThemesWithSecret(adminSecret)]);
  };

  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_STORAGE_KEY) : null;
    if (saved) {
      setAdminSecret(saved);
      fetchExamsWithSecret(saved);
      fetchThemesWithSecret(saved);
    } else {
      setIsCheckingAuth(false);
    }
  }, [fetchExamsWithSecret, fetchThemesWithSecret]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim()) {
      setAuthError('Vennligst skriv inn admin-nøkkel.');
      return;
    }
    const secret = adminSecret.trim();
    const success = await fetchExamsWithSecret(secret);
    if (success) {
      await fetchThemesWithSecret(secret);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setIsAuthenticated(false);
    setAdminSecret('');
    setExams([]);
    setThemes([]);
    setPromoCount(null);
  };

  const showExams = (preset: ExamFilterPreset) => {
    setExamPreset({ key: Date.now(), preset });
    goTo('exams');
  };

  const unthemedCount = useMemo(() => exams.filter((e) => !e.themeId).length, [exams]);

  const navCounts: Partial<Record<Section, number | null>> = {
    exams: exams.length,
    themes: themes.length,
    promo: promoCount,
  };

  if (isCheckingAuth) {
    return (
      <div className={s.loginWrap}>
        <p style={{ color: '#8B9AB4' }}>Laster admin…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={s.loginWrap}>
        <div className={s.loginCard}>
          <img
            src="/brand/snakkly-wordmark-dark.png"
            alt="Snakkly"
            width={150}
            height={50}
            style={{ display: 'block', borderRadius: 10, marginBottom: 20 }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>Admin</h1>
          <p style={{ fontSize: 14, color: '#8B9AB4', lineHeight: 1.5, margin: '0 0 20px' }}>
            Logg inn for å administrere oppgavesett, temaer, abonnement og kampanjekoder.
          </p>

          {authError && <div className={s.formError}>{authError}</div>}

          <form onSubmit={handleLoginSubmit}>
            <label style={styles.label} htmlFor="admin-secret">
              Admin-nøkkel
            </label>
            <input
              id="admin-secret"
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="ADMIN_SECRET"
              style={{ ...styles.input, marginBottom: 14 }}
              autoFocus
            />
            <button
              type="submit"
              className={cx(s.btn, s.btnPrimary)}
              style={{ width: '100%', padding: '10px 14px' }}
              disabled={isLoadingExams}
            >
              {isLoadingExams ? 'Logger inn…' : 'Logg inn'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <a href="/" style={{ color: '#38BDF8', fontSize: 13, textDecoration: 'none' }}>
              &larr; Tilbake til statusoversikt
            </a>
          </div>
        </div>
        {toasts}
      </div>
    );
  }

  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <img src="/brand/snakkly-wordmark-dark.png" alt="Snakkly" width={120} height={40} />
          <div className={s.brandTag}>ADMIN</div>
        </div>
        <nav className={s.nav} aria-label="Admin-seksjoner">
          {SECTIONS.map((sec) => {
            const count = navCounts[sec.id];
            return (
              <button
                key={sec.id}
                type="button"
                className={cx(s.navItem, section === sec.id && s.navItemActive)}
                aria-current={section === sec.id ? 'page' : undefined}
                onClick={() => goTo(sec.id)}
              >
                <span className={s.navIcon} aria-hidden>
                  {sec.icon}
                </span>
                {sec.label}
                {count != null && <span className={s.navCount}>{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className={s.sidebarFooter}>
          <button type="button" className={cx(s.navItem)} onClick={handleLogout}>
            <span className={s.navIcon} aria-hidden>
              ⎋
            </span>
            Logg ut
          </button>
        </div>
      </aside>

      <main className={s.main}>
        <div className={s.mainInner}>
          {section === 'exams' && (
            <ExamsPanel
              key={examPreset?.key ?? 'exams'}
              exams={exams}
              themes={themes}
              isLoading={isLoadingExams}
              preset={examPreset?.preset ?? null}
              request={adminJsonRequest}
              notify={notify}
              onExamsChange={setExams}
              onReload={reloadExamsAndThemes}
            />
          )}
          {section === 'themes' && (
            <ThemesPanel
              themes={themes}
              unthemedCount={unthemedCount}
              isLoading={isLoadingThemes}
              request={adminJsonRequest}
              notify={notify}
              onThemesChange={setThemes}
              onReload={reloadExamsAndThemes}
              onShowExams={showExams}
            />
          )}
          {section === 'config' && <ConfigPanel request={adminJsonRequest} notify={notify} />}
          {section === 'promo' && (
            <PromoCodesPanel request={adminJsonRequest} notify={notify} onCountChange={setPromoCount} />
          )}
        </div>
      </main>
      {toasts}
    </div>
  );
}
