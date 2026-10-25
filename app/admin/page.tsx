'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface AdminExamTopic {
  id: string;
  slug: string;
  titleNo: string;
  level: 'B1' | 'B2';
  themeId: string | null;
  themeTitleNo?: string | null;
  monologuePromptNo: string;
  discussionPromptNo: string;
  followUpQuestionsNo: string[];
  isActive: boolean;
  createdAt: string;
  sessionCount?: number;
}

interface AdminExamTheme {
  id: string;
  slug: string;
  titleNo: string;
  descriptionNo: string | null;
  sortOrder: number;
  isActive: boolean;
  setCounts: { B1: number; B2: number };
}

const SESSION_STORAGE_KEY = 'norsk_admin_secret';

export default function AdminPortalPage() {
  const [adminSecret, setAdminSecret] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  const [exams, setExams] = useState<AdminExamTopic[]>([]);
  const [isLoadingExams, setIsLoadingExams] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filters
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'B1' | 'B2'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  // 'ALL', 'NONE' (unthemed sets) or a theme id
  const [themeFilter, setThemeFilter] = useState<string>('ALL');

  // Themes (categories grouping question sets)
  const [themes, setThemes] = useState<AdminExamTheme[]>([]);
  const [newThemeTitle, setNewThemeTitle] = useState<string>('');
  const [newThemeDescription, setNewThemeDescription] = useState<string>('');
  const [isSavingTheme, setIsSavingTheme] = useState<boolean>(false);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'EXAMS' | 'CONFIG' | 'PROMO'>('EXAMS');

  // Config tab state
  const [tierPolicies, setTierPolicies] = useState<any>(null);
  const [referralSettings, setReferralSettings] = useState<any>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  // Form state (Create / Edit)
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [titleNo, setTitleNo] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [level, setLevel] = useState<'B1' | 'B2'>('B1');
  const [formThemeId, setFormThemeId] = useState<string>('');
  const [monologuePromptNo, setMonologuePromptNo] = useState<string>('');
  const [discussionPromptNo, setDiscussionPromptNo] = useState<string>('');
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([
    '',
    '',
    '',
  ]);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchExamsWithSecret = useCallback(async (secretToUse: string) => {
    setIsLoadingExams(true);
    setGlobalError(null);
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
      setGlobalError(err instanceof Error ? err.message : 'Kunne ikke hente eksamener');
      return false;
    } finally {
      setIsLoadingExams(false);
      setIsCheckingAuth(false);
    }
  }, []);

  const fetchThemesWithSecret = useCallback(async (secretToUse: string) => {
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

  const handleCreateTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThemeTitle.trim()) return;
    setIsSavingTheme(true);
    setGlobalError(null);
    setSuccessBanner(null);
    try {
      await adminJsonRequest('/api/admin/themes', 'POST', {
        titleNo: newThemeTitle.trim(),
        descriptionNo: newThemeDescription.trim() || null,
        sortOrder: themes.length,
      });
      setSuccessBanner(`Tema «${newThemeTitle.trim()}» ble opprettet.`);
      setNewThemeTitle('');
      setNewThemeDescription('');
      await fetchThemesWithSecret(adminSecret);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Kunne ikke opprette tema');
    } finally {
      setIsSavingTheme(false);
    }
  };

  const handleEditTheme = async (theme: AdminExamTheme) => {
    const title = window.prompt('Nytt navn på temaet:', theme.titleNo);
    if (title === null) return;
    const description = window.prompt('Beskrivelse (valgfritt):', theme.descriptionNo ?? '');
    if (description === null) return;
    setGlobalError(null);
    setSuccessBanner(null);
    try {
      await adminJsonRequest(`/api/admin/themes/${encodeURIComponent(theme.id)}`, 'PATCH', {
        titleNo: title.trim(),
        descriptionNo: description.trim() || null,
      });
      setSuccessBanner(`Tema «${title.trim()}» ble oppdatert.`);
      await Promise.all([fetchThemesWithSecret(adminSecret), fetchExamsWithSecret(adminSecret)]);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Kunne ikke oppdatere tema');
    }
  };

  const handleToggleTheme = async (theme: AdminExamTheme) => {
    setGlobalError(null);
    setSuccessBanner(null);
    try {
      await adminJsonRequest(`/api/admin/themes/${encodeURIComponent(theme.id)}`, 'PATCH', {
        isActive: !theme.isActive,
      });
      setThemes((prev) =>
        prev.map((item) => (item.id === theme.id ? { ...item, isActive: !theme.isActive } : item))
      );
      setSuccessBanner(`Tema «${theme.titleNo}» er nå ${!theme.isActive ? 'aktivt' : 'deaktivert'}.`);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Kunne ikke oppdatere tema');
    }
  };

  const handleDeleteTheme = async (theme: AdminExamTheme) => {
    const confirmed = window.confirm(
      `Er du sikker på at du vil slette temaet «${theme.titleNo}»? Oppgavesettene beholdes, men blir uten tema.`
    );
    if (!confirmed) return;
    setGlobalError(null);
    setSuccessBanner(null);
    try {
      await adminJsonRequest(`/api/admin/themes/${encodeURIComponent(theme.id)}`, 'DELETE');
      if (themeFilter === theme.id) setThemeFilter('ALL');
      setSuccessBanner(`Tema «${theme.titleNo}» ble slettet.`);
      await Promise.all([fetchThemesWithSecret(adminSecret), fetchExamsWithSecret(adminSecret)]);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Sletting mislyktes');
    }
  };

  const fetchConfigsWithSecret = useCallback(async (secretToUse: string) => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch('/api/admin/config', {
        headers: {
          Accept: 'application/json',
          'x-admin-secret': secretToUse,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTierPolicies(data.tiers);
        setReferralSettings(data.referral);
      }
    } catch (err) {
      console.error('Failed to load configs:', err);
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  const handleUpdateTier = async (
    tier: string,
    dailyLimit: number,
    priceCents: number,
    features: string[] = []
  ) => {
    setIsSavingConfig(true);
    setGlobalError(null);
    setSuccessBanner(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({
          tier,
          dailyTestLimit: dailyLimit,
          priceCents,
          features,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || 'Feil ved lagring');
      }
      setSuccessBanner(`Abonnementsplan ${tier} er oppdatert!`);
      await fetchConfigsWithSecret(adminSecret);
    } catch (err: any) {
      setGlobalError(err.message || 'Feil ved lagring av abonnementsplan');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleUpdateReferral = async (bonusDailyTests: number, durationDays: number) => {
    setIsSavingConfig(true);
    setGlobalError(null);
    setSuccessBanner(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({
          bonusDailyTests,
          durationDays,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || 'Feil ved lagring');
      }
      setSuccessBanner('Verveinnstillinger er oppdatert!');
      await fetchConfigsWithSecret(adminSecret);
    } catch (err: any) {
      setGlobalError(err.message || 'Feil ved lagring av verveinnstillinger');
    } finally {
      setIsSavingConfig(false);
    }
  };

  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_STORAGE_KEY) : null;
    if (saved) {
      setAdminSecret(saved);
      fetchExamsWithSecret(saved);
      fetchThemesWithSecret(saved);
      fetchConfigsWithSecret(saved);
    } else {
      setIsCheckingAuth(false);
    }
  }, [fetchExamsWithSecret, fetchThemesWithSecret, fetchConfigsWithSecret]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim()) {
      setAuthError('Vennligst skriv inn admin-nøkkel.');
      return;
    }
    const secret = adminSecret.trim();
    const success = await fetchExamsWithSecret(secret);
    if (success) {
      await Promise.all([fetchThemesWithSecret(secret), fetchConfigsWithSecret(secret)]);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setIsAuthenticated(false);
    setAdminSecret('');
    setExams([]);
    setThemes([]);
  };

  const openCreateForm = () => {
    setEditingExamId(null);
    setTitleNo('');
    setSlug('');
    setLevel('B1');
    setFormThemeId(themeFilter !== 'ALL' && themeFilter !== 'NONE' ? themeFilter : '');
    setMonologuePromptNo('');
    setDiscussionPromptNo('');
    setFollowUpQuestions(['', '', '']);
    setIsActive(true);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (exam: AdminExamTopic) => {
    setEditingExamId(exam.id);
    setTitleNo(exam.titleNo);
    setSlug(exam.slug);
    setLevel(exam.level);
    setFormThemeId(exam.themeId ?? '');
    setMonologuePromptNo(exam.monologuePromptNo);
    setDiscussionPromptNo(exam.discussionPromptNo);
    setFollowUpQuestions(
      Array.isArray(exam.followUpQuestionsNo) && exam.followUpQuestionsNo.length > 0
        ? [...exam.followUpQuestionsNo]
        : ['']
    );
    setIsActive(exam.isActive);
    setFormError(null);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuestionChange = (index: number, value: string) => {
    setFollowUpQuestions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addQuestionField = () => {
    setFollowUpQuestions((prev) => [...prev, '']);
  };

  const removeQuestionField = (index: number) => {
    setFollowUpQuestions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessBanner(null);

    const cleanedQuestions = followUpQuestions
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    if (cleanedQuestions.length === 0) {
      setFormError('Legg til minst ett oppfølgingsspørsmål for Del 3.');
      return;
    }

    setIsSaving(true);
    try {
      const endpoint = editingExamId
        ? `/api/admin/exams/${encodeURIComponent(editingExamId)}`
        : '/api/admin/exams';
      const method = editingExamId ? 'PATCH' : 'POST';

      const payload: Record<string, unknown> = {
        titleNo: titleNo.trim(),
        level,
        themeId: formThemeId || null,
        monologuePromptNo: monologuePromptNo.trim(),
        discussionPromptNo: discussionPromptNo.trim(),
        followUpQuestionsNo: cleanedQuestions,
        isActive,
      };
      if (slug.trim()) {
        payload.slug = slug.trim();
      }

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fieldIssues = body.issues
          ? Object.values(body.issues).flat().join(' ')
          : '';
        throw new Error(fieldIssues || body.message || body.error || `HTTP ${res.status}`);
      }

      setSuccessBanner(
        editingExamId
          ? `Eksamen «${titleNo.trim()}» ble oppdatert.`
          : `Ny eksamen «${titleNo.trim()}» (${level}) ble opprettet og lagt til i trekningsbasen!`
      );
      setIsFormOpen(false);
      setEditingExamId(null);
      await Promise.all([fetchExamsWithSecret(adminSecret), fetchThemesWithSecret(adminSecret)]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lagring feilet');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (exam: AdminExamTopic) => {
    setGlobalError(null);
    setSuccessBanner(null);
    try {
      const res = await fetch(`/api/admin/exams/${encodeURIComponent(exam.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({ isActive: !exam.isActive }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }

      setExams((prev) =>
        prev.map((item) =>
          item.id === exam.id ? { ...item, isActive: !exam.isActive } : item
        )
      );
      setSuccessBanner(
        `«${exam.titleNo}» er nå ${!exam.isActive ? 'aktiv i tilfeldig trekning' : 'deaktivert'}.`
      );
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : 'Kunne ikke oppdatere status'
      );
    }
  };

  const handleDeleteExam = async (exam: AdminExamTopic) => {
    const confirmed = window.confirm(
      `Er du sikker på at du vil slette eksamenen «${exam.titleNo}»?`
    );
    if (!confirmed) return;

    setGlobalError(null);
    setSuccessBanner(null);
    try {
      const res = await fetch(`/api/admin/exams/${encodeURIComponent(exam.id)}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'x-admin-secret': adminSecret,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }

      setExams((prev) => prev.filter((item) => item.id !== exam.id));
      setSuccessBanner(`Eksamen «${exam.titleNo}» ble slettet.`);
      await fetchThemesWithSecret(adminSecret);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Sletting mislyktes');
    }
  };

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (levelFilter !== 'ALL' && exam.level !== levelFilter) return false;
      if (statusFilter === 'ACTIVE' && !exam.isActive) return false;
      if (statusFilter === 'INACTIVE' && exam.isActive) return false;
      if (themeFilter === 'NONE' && exam.themeId) return false;
      if (themeFilter !== 'ALL' && themeFilter !== 'NONE' && exam.themeId !== themeFilter) {
        return false;
      }
      return true;
    });
  }, [exams, levelFilter, statusFilter, themeFilter]);

  const unthemedCount = useMemo(() => exams.filter((e) => !e.themeId).length, [exams]);

  const metrics = useMemo(() => {
    const activeB1 = exams.filter((e) => e.level === 'B1' && e.isActive).length;
    const activeB2 = exams.filter((e) => e.level === 'B2' && e.isActive).length;
    const totalQuestions = exams.reduce(
      (acc, e) =>
        acc +
        2 +
        (Array.isArray(e.followUpQuestionsNo) ? e.followUpQuestionsNo.length : 0),
      0
    );
    const totalSessions = exams.reduce((acc, e) => acc + (e.sessionCount ?? 0), 0);
    return { total: exams.length, activeB1, activeB2, totalQuestions, totalSessions };
  }, [exams]);

  if (isCheckingAuth) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.centeredBox}>
          <p style={{ color: '#94A3B8', fontSize: '16px' }}>Laster Admin Portal...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.loginCard}>
          <img src="/brand/snakkly-wordmark-dark.png" alt="Snakkly" width={150} height={50} style={styles.brandLogo} />
          <div style={styles.badge}>WEB ADMIN PORTAL</div>
          <h1 style={styles.loginTitle}>Norskprøven Eksamen-admin</h1>
          <p style={styles.loginSubtitle}>
            Logg inn for å opprette og administrere muntlige eksamener og spørsmålsbanker
            (Del 1, Del 2 og Del 3).
          </p>

          {authError && <div style={styles.errorAlert}>{authError}</div>}

          <form onSubmit={handleLoginSubmit} style={{ marginTop: '20px' }}>
            <label style={styles.label}>Admin-nøkkel (ADMIN_SECRET)</label>
            <input
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="Skriv inn admin-nøkkel (f.eks. admin123)"
              style={styles.input}
              autoFocus
            />
            <button type="submit" style={styles.primaryButtonFull}>
              Logg inn til Admin Portal
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <a href="/" style={styles.backLink}>
              &larr; Tilbake til statusoversikt
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        {/* Top Bar */}
        <header style={styles.header}>
          <div>
            <img src="/brand/snakkly-wordmark-dark.png" alt="Snakkly" width={150} height={50} style={styles.brandLogo} />
            <div style={styles.badge}>MUNTLIG EKSAMENSSIMULATOR</div>
            <h1 style={styles.headerTitle}>Web Admin Portal — Eksamener &amp; Spørsmål</h1>
            <p style={styles.headerSubtitle}>
              Eksamener og Del 3-spørsmål som er aktive her trekkes tilfeldig hver gang en
              kandidat starter en ny muntlig prøve.
            </p>
          </div>
          <div style={styles.headerActions}>
            {activeTab === 'EXAMS' && (
              <button onClick={openCreateForm} style={styles.primaryButton}>
                + Opprett ny eksamen
              </button>
            )}
            <button onClick={handleLogout} style={styles.secondaryButton}>
              Logg ut
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('EXAMS')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              backgroundColor: activeTab === 'EXAMS' ? '#0284C7' : '#1E293B',
              color: activeTab === 'EXAMS' ? '#FFFFFF' : '#94A3B8',
            }}
          >
            📚 Eksamener &amp; Temaer
          </button>
          <button
            onClick={() => setActiveTab('CONFIG')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              backgroundColor: activeTab === 'CONFIG' ? '#0284C7' : '#1E293B',
              color: activeTab === 'CONFIG' ? '#FFFFFF' : '#94A3B8',
            }}
          >
            ⚙️ Abonnement &amp; Verveinnstillinger
          </button>
          <button
            onClick={() => setActiveTab('PROMO')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              backgroundColor: activeTab === 'PROMO' ? '#0284C7' : '#1E293B',
              color: activeTab === 'PROMO' ? '#FFFFFF' : '#94A3B8',
            }}
          >
            🎟️ Kampanjekoder
          </button>
        </div>

        {/* Metrics Row */}
        <section style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Totalt antall eksamener</div>
            <div style={styles.metricValue}>{metrics.total}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Aktive B1-prøver (Tilfeldig pool)</div>
            <div style={{ ...styles.metricValue, color: '#38BDF8' }}>
              {metrics.activeB1}
            </div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Aktive B2-prøver (Tilfeldig pool)</div>
            <div style={{ ...styles.metricValue, color: '#A855F7' }}>
              {metrics.activeB2}
            </div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Totalt spørsmål i databasen</div>
            <div style={{ ...styles.metricValue, color: '#34D399' }}>
              {metrics.totalQuestions}
            </div>
          </div>
        </section>

        {globalError && <div style={styles.errorAlert}>{globalError}</div>}
        {successBanner && <div style={styles.successAlert}>{successBanner}</div>}

        {/* Create / Edit Exam Form */}
        {isFormOpen && (
          <section style={styles.formPanel}>
            <div style={styles.formHeader}>
              <h2 style={styles.formTitle}>
                {editingExamId ? 'Rediger eksamen og spørsmål' : 'Opprett ny muntlig eksamen'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                style={styles.closeButton}
              >
                Lukk ✕
              </button>
            </div>

            {formError && <div style={styles.errorAlert}>{formError}</div>}

            <form onSubmit={handleSaveExam}>
              <div style={styles.formRow}>
                <div style={{ flex: 2 }}>
                  <label style={styles.label}>Eksamenstittel (Norsk) *</label>
                  <input
                    type="text"
                    value={titleNo}
                    onChange={(e) => setTitleNo(e.target.value)}
                    placeholder="f.eks. Digitalisering og personvern i hverdagen"
                    style={styles.input}
                    required
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={styles.label}>CEFR-Målnivå *</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as 'B1' | 'B2')}
                    style={styles.select}
                  >
                    <option value="B1">Nivå B1 (Middels)</option>
                    <option value="B2">Nivå B2 (Høyere)</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Tema</label>
                  <select
                    value={formThemeId}
                    onChange={(e) => setFormThemeId(e.target.value)}
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

                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Slug (valgfritt, genereres automatisk)</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="digitalisering-og-personvern"
                    style={styles.input}
                  />
                </div>
              </div>

              {/* Del 1 */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>
                  Del 1: Individuell monologoppgave (Egenpresentasjon) *
                </label>
                <p style={styles.helperText}>
                  Dette spørsmålet presenteres av AI-sensor ved oppstart av prøven, og kandidaten
                  vurderes mot det i sluttvurderingen.
                </p>
                <textarea
                  rows={3}
                  value={monologuePromptNo}
                  onChange={(e) => setMonologuePromptNo(e.target.value)}
                  placeholder="f.eks. Fortell om hvordan digitale tjenester påvirker hverdagen din, og hva du gjør for å beskytte personvernet ditt."
                  style={styles.textarea}
                  required
                />
              </div>

              {/* Del 2 */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>
                  Del 2: Samtaleoppgave (Diskusjon med medkandidat) *
                </label>
                <p style={styles.helperText}>
                  Diskusjonsspørsmålet som AI-sensor introduserer i Del 2 og som AI-medkandidaten
                  diskuterer med kandidaten.
                </p>
                <textarea
                  rows={3}
                  value={discussionPromptNo}
                  onChange={(e) => setDiscussionPromptNo(e.target.value)}
                  placeholder="f.eks. Diskuter om myndighetene bør innføre strengere regler for innsamling av persondata på sosiale medier."
                  style={styles.textarea}
                  required
                />
              </div>

              {/* Del 3 */}
              <div style={styles.fieldGroup}>
                <div style={styles.questionHeaderRow}>
                  <div>
                    <label style={styles.label}>
                      Del 3: Oppfølgingsspørsmål (Spørsmålsbank) *
                    </label>
                    <p style={styles.helperText}>
                      Legg gjerne inn 3–6 spørsmål. Hver gang en kandidat får denne eksamenen,
                      trekker systemet opptil 3 tilfeldige spørsmål i tilfeldig rekkefølge fra
                      denne listen.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addQuestionField}
                    style={styles.addQuestionButton}
                  >
                    + Legg til spørsmål
                  </button>
                </div>

                {followUpQuestions.map((q, idx) => (
                  <div key={idx} style={styles.questionInputRow}>
                    <span style={styles.questionNumberBadge}>#{idx + 1}</span>
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => handleQuestionChange(idx, e.target.value)}
                      placeholder={`Oppfølgingsspørsmål ${idx + 1}...`}
                      style={{ ...styles.input, marginBottom: 0, flex: 1 }}
                    />
                    {followUpQuestions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQuestionField(idx)}
                        style={styles.removeQuestionButton}
                        title="Fjern spørsmål"
                      >
                        Fjern
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Active Checkbox & Submit */}
              <div style={styles.formFooter}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#38BDF8' }}
                  />
                  <span>
                    Aktiv eksamen (tilgjengelig for tilfeldig trekning når kandidater starter prøve)
                  </span>
                </label>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    style={styles.secondaryButton}
                  >
                    Avbryt
                  </button>
                  <button type="submit" disabled={isSaving} style={styles.primaryButton}>
                    {isSaving
                      ? 'Lagrer...'
                      : editingExamId
                        ? 'Lagre endringer'
                        : 'Opprett eksamen'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {activeTab === 'EXAMS' ? (
          <div>
            {/* Theme Manager */}
            <section style={styles.formPanel}>
              <div style={styles.formHeader}>
                <h2 style={styles.formTitle}>Temaer ({themes.length})</h2>
              </div>
              <p style={styles.helperText}>
                Kandidater velger et tema (eller tilfeldig). Innen et tema trekkes Del 1, Del 2 og
                Del 3 tilfeldig fra temaets oppgavesett. Ved tilfeldig prøve trekkes hver del fra
                ulike temaer.
                {unthemedCount > 0 &&
                  ` ${unthemedCount} oppgavesett mangler tema og vises ikke som eget tema for kandidatene.`}
              </p>

              <form onSubmit={handleCreateTheme} style={styles.formRow}>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    value={newThemeTitle}
                    onChange={(e) => setNewThemeTitle(e.target.value)}
                    placeholder="Nytt tema, f.eks. Familie og barn"
                    style={styles.input}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <input
                    type="text"
                    value={newThemeDescription}
                    onChange={(e) => setNewThemeDescription(e.target.value)}
                    placeholder="Kort beskrivelse (valgfritt)"
                    style={styles.input}
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={isSavingTheme || !newThemeTitle.trim()}
                    style={styles.primaryButton}
                  >
                    {isSavingTheme ? 'Lagrer...' : '+ Opprett tema'}
                  </button>
                </div>
              </form>

              {themes.map((theme) => (
                <div
                  key={theme.id}
                  style={{
                    ...styles.examCardHeader,
                    opacity: theme.isActive ? 1 : 0.72,
                    padding: '10px 0',
                    borderTop: '1px solid #334155',
                  }}
                >
                  <div style={styles.examTitleRow}>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor: theme.isActive
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(148, 163, 184, 0.15)',
                        color: theme.isActive ? '#34D399' : '#94A3B8',
                      }}
                    >
                      {theme.isActive ? '● Aktivt' : '○ Deaktivert'}
                    </span>
                    <h3 style={styles.examCardTitle}>{theme.titleNo}</h3>
                    {theme.descriptionNo && (
                      <span style={styles.sessionCountText}>{theme.descriptionNo}</span>
                    )}
                  </div>
                  <div style={styles.examCardActions}>
                    <span style={styles.sessionCountText}>
                      B1: {theme.setCounts?.B1 ?? 0} · B2: {theme.setCounts?.B2 ?? 0} oppgavesett
                    </span>
                    <button onClick={() => handleToggleTheme(theme)} style={styles.actionButton}>
                      {theme.isActive ? 'Deaktiver' : 'Aktiver'}
                    </button>
                    <button
                      onClick={() => handleEditTheme(theme)}
                      style={styles.actionButtonPrimary}
                    >
                      Rediger
                    </button>
                    <button
                      onClick={() => handleDeleteTheme(theme)}
                      style={styles.actionButtonDanger}
                    >
                      Slett
                    </button>
                  </div>
                </div>
              ))}
            </section>

            {/* Filter Bar */}
            <section style={styles.filterBar}>
          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Tema:</span>
            {[
              { id: 'ALL', label: 'Alle temaer' },
              ...themes.map((t) => ({ id: t.id, label: t.titleNo })),
              ...(unthemedCount > 0 ? [{ id: 'NONE', label: `Uten tema (${unthemedCount})` }] : []),
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setThemeFilter(opt.id)}
                style={{
                  ...styles.filterPill,
                  ...(themeFilter === opt.id ? styles.filterPillActive : {}),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Nivå:</span>
            {(['ALL', 'B1', 'B2'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                style={{
                  ...styles.filterPill,
                  ...(levelFilter === lvl ? styles.filterPillActive : {}),
                }}
              >
                {lvl === 'ALL' ? 'Alle nivåer' : `Nivå ${lvl}`}
              </button>
            ))}
          </div>

          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Status:</span>
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  ...styles.filterPill,
                  ...(statusFilter === st ? styles.filterPillActive : {}),
                }}
              >
                {st === 'ALL' ? 'Alle' : st === 'ACTIVE' ? 'Kun aktive' : 'Inaktive'}
              </button>
            ))}
          </div>
        </section>

        {/* Exam Catalog List */}
        {isLoadingExams ? (
          <div style={styles.centeredBox}>
            <p style={{ color: '#94A3B8' }}>Henter eksamener fra databasen...</p>
          </div>
        ) : filteredExams.length === 0 ? (
          <div style={styles.emptyBox}>
            <p style={{ color: '#94A3B8', marginBottom: '12px' }}>
              Ingen eksamener funnet med valgte filtre.
            </p>
            <button onClick={openCreateForm} style={styles.primaryButton}>
              + Opprett første eksamen
            </button>
          </div>
        ) : (
          <div style={styles.examList}>
            {filteredExams.map((exam) => (
              <div
                key={exam.id}
                style={{
                  ...styles.examCard,
                  opacity: exam.isActive ? 1 : 0.72,
                }}
              >
                <div style={styles.examCardHeader}>
                  <div style={styles.examTitleRow}>
                    <span
                      style={{
                        ...styles.levelBadge,
                        backgroundColor: exam.level === 'B2' ? '#3B0764' : '#0C4A6E',
                        borderColor: exam.level === 'B2' ? '#A855F7' : '#38BDF8',
                        color: exam.level === 'B2' ? '#E9D5FF' : '#BAE6FD',
                      }}
                    >
                      {exam.level}
                    </span>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor: exam.themeId
                          ? 'rgba(56, 189, 248, 0.15)'
                          : 'rgba(245, 158, 11, 0.15)',
                        color: exam.themeId ? '#7DD3FC' : '#FBBF24',
                      }}
                    >
                      {exam.themeId ? exam.themeTitleNo || 'Tema' : '⚠ Uten tema'}
                    </span>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor: exam.isActive
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(148, 163, 184, 0.15)',
                        color: exam.isActive ? '#34D399' : '#94A3B8',
                      }}
                    >
                      {exam.isActive ? '● Aktiv i trekning' : '○ Deaktivert'}
                    </span>
                    <h3 style={styles.examCardTitle}>{exam.titleNo}</h3>
                  </div>

                  <div style={styles.examCardActions}>
                    <span style={styles.sessionCountText}>
                      {exam.sessionCount ?? 0} gjennomførte prøver
                    </span>
                    <button
                      onClick={() => handleToggleActive(exam)}
                      style={styles.actionButton}
                    >
                      {exam.isActive ? 'Deaktiver' : 'Aktiver'}
                    </button>
                    <button
                      onClick={() => openEditForm(exam)}
                      style={styles.actionButtonPrimary}
                    >
                      Rediger
                    </button>
                    <button
                      onClick={() => handleDeleteExam(exam)}
                      style={styles.actionButtonDanger}
                    >
                      Slett
                    </button>
                  </div>
                </div>

                <div style={styles.promptsGrid}>
                  <div style={styles.promptBox}>
                    <div style={styles.promptLabel}>DEL 1 — MONOLOGOPPGAVE</div>
                    <p style={styles.promptText}>{exam.monologuePromptNo}</p>
                  </div>

                  <div style={styles.promptBox}>
                    <div style={styles.promptLabel}>DEL 2 — SAMTALEOPPGAVE</div>
                    <p style={styles.promptText}>{exam.discussionPromptNo}</p>
                  </div>
                </div>

                <div style={styles.followUpBox}>
                  <div style={styles.promptLabel}>
                    DEL 3 — OPPFØLGINGSSPØRSMÅL ({exam.followUpQuestionsNo?.length || 0}{' '}
                    spørsmål i pool &rarr; 3 trekkes tilfeldig per prøve)
                  </div>
                  <ol style={styles.followUpList}>
                    {(exam.followUpQuestionsNo || []).map((q, i) => (
                      <li key={i} style={styles.followUpItem}>
                        {q}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
        ) : activeTab === 'PROMO' ? (
          <PromoCodesPanel
            request={adminJsonRequest}
            onError={(message) => {
              setSuccessBanner(null);
              setGlobalError(message);
            }}
            onSuccess={(message) => {
              setGlobalError(null);
              setSuccessBanner(message);
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div
                style={{
                  backgroundColor: '#1E293B',
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0' }}>
                      Abonnementsplaner &amp; Daglige Testgrenser
                    </h2>
                    <p style={{ color: '#94A3B8', fontSize: '14px', margin: 0 }}>
                      Endre hvor mange tester gratis og betalte brukere kan ta per kalenderdøgn samt inkluderte funksjoner og fordeler.
                    </p>
                  </div>
                  <button
                    onClick={() => fetchConfigsWithSecret(adminSecret)}
                    disabled={isLoadingConfig}
                    style={{ ...styles.secondaryButton, padding: '8px 14px', fontSize: '13px' }}
                  >
                    {isLoadingConfig ? 'Oppdaterer...' : '↻ Oppfrisk'}
                  </button>
                </div>

                {isLoadingConfig && !tierPolicies ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: '#94A3B8' }}>
                    Laster inn abonnementsinnstillinger fra databasen...
                  </div>
                ) : tierPolicies ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '20px',
                    }}
                  >
                    <TierConfigCard
                      tier="FREE"
                      title="Gratis Nivå (Free)"
                      borderColor="#334155"
                      titleColor="#F8FAFC"
                      badgeLabel="Grunnpakke"
                      initialLimit={tierPolicies.FREE?.dailyTestLimit ?? 1}
                      initialPriceCents={tierPolicies.FREE?.priceCents ?? 0}
                      initialFeatures={tierPolicies.FREE?.features ?? []}
                      isPaid={false}
                      isSaving={isSavingConfig}
                      onSave={(dailyLimit, priceCents, features) =>
                        handleUpdateTier('FREE', dailyLimit, priceCents, features)
                      }
                    />

                    <TierConfigCard
                      tier="STANDARD"
                      title="Standard Nivå"
                      borderColor="#0284C7"
                      titleColor="#38BDF8"
                      badgeLabel="Populær"
                      initialLimit={tierPolicies.STANDARD?.dailyTestLimit ?? 5}
                      initialPriceCents={tierPolicies.STANDARD?.priceCents ?? 14900}
                      initialFeatures={tierPolicies.STANDARD?.features ?? []}
                      isPaid={true}
                      isSaving={isSavingConfig}
                      onSave={(dailyLimit, priceCents, features) =>
                        handleUpdateTier('STANDARD', dailyLimit, priceCents, features)
                      }
                    />

                    <TierConfigCard
                      tier="PREMIUM"
                      title="Premium Nivå"
                      borderColor="#F59E0B"
                      titleColor="#F59E0B"
                      badgeLabel="Maksimal øving"
                      initialLimit={tierPolicies.PREMIUM?.dailyTestLimit ?? 20}
                      initialPriceCents={tierPolicies.PREMIUM?.priceCents ?? 29900}
                      initialFeatures={tierPolicies.PREMIUM?.features ?? []}
                      isPaid={true}
                      isSaving={isSavingConfig}
                      onSave={(dailyLimit, priceCents, features) =>
                        handleUpdateTier('PREMIUM', dailyLimit, priceCents, features)
                      }
                    />
                  </div>
                ) : null}
              </div>

              {/* Referral Settings Card */}
              {referralSettings && (
                <ReferralConfigCard
                  initialBonus={referralSettings.bonusDailyTests ?? 2}
                  initialDuration={referralSettings.durationDays ?? 7}
                  isSaving={isSavingConfig}
                  onSave={(bonus, duration) => handleUpdateReferral(bonus, duration)}
                />
              )}
            </div>
          )}
      </div>
    </div>
  );
}

interface TierConfigCardProps {
  tier: 'FREE' | 'STANDARD' | 'PREMIUM';
  title: string;
  borderColor: string;
  titleColor: string;
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
  borderColor,
  titleColor,
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
      style={{
        backgroundColor: '#0F172A',
        padding: '22px',
        borderRadius: '12px',
        border: `1px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
      }}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: titleColor,
              }}
            >
              {title}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#94A3B8',
                border: '1px solid #334155',
              }}
            >
              {badgeLabel}
            </span>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={styles.label}>Daglige tester per døgn:</label>
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
            <div style={{ marginBottom: '14px' }}>
              <label style={styles.label}>Månedspris i NOK (kr):</label>
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

          {/* Planned Features List */}
          <div style={{ marginTop: '16px', marginBottom: '18px' }}>
            <label style={{ ...styles.label, marginBottom: '8px' }}>
              Inkluderte funksjoner &amp; fordeler:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
              {features.map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={feature}
                    onChange={(e) => handleFeatureChange(idx, e.target.value)}
                    placeholder="f.eks. Ubegrenset tilgang, AI stemme..."
                    style={{ ...styles.input, marginBottom: 0, fontSize: '13px', padding: '8px 10px' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(idx)}
                    title="Fjern funksjon"
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#FCA5A5',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Add new feature input */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                placeholder="+ Legg til ny funksjon..."
                style={{ ...styles.input, marginBottom: 0, fontSize: '13px', padding: '8px 10px' }}
              />
              <button
                type="button"
                onClick={handleAddFeature}
                style={{
                  backgroundColor: '#0C4A6E',
                  border: '1px solid #38BDF8',
                  color: '#BAE6FD',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Legg til
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          style={{
            ...styles.primaryButton,
            width: '100%',
            marginTop: 'auto',
            backgroundColor: tier === 'PREMIUM' ? '#F59E0B' : tier === 'STANDARD' ? '#0284C7' : '#334155',
            color: tier === 'PREMIUM' ? '#0F172A' : '#FFFFFF',
          }}
        >
          {isSaving ? 'Lagrer...' : `Lagre ${tier} plan`}
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

function ReferralConfigCard({
  initialBonus,
  initialDuration,
  isSaving,
  onSave,
}: ReferralConfigCardProps) {
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
    <div
      style={{
        backgroundColor: '#1E293B',
        padding: '24px',
        borderRadius: '12px',
        border: '1px solid #334155',
      }}
    >
      <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0' }}>
        Verveprogram Innstillinger (Referrals)
      </h2>
      <p style={{ color: '#94A3B8', fontSize: '14px', margin: '0 0 20px 0' }}>
        Konfigurer hvor mange ekstra tester per dag både ververen og den vervede vennen mottar når vennen registrerer seg, og varigheten på bonusen.
      </p>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={styles.label}>Ekstra tester per dag per vervet venn:</label>
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
            <label style={styles.label}>Varighet (dager):</label>
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
            <button
              type="submit"
              disabled={isSaving}
              style={{ ...styles.primaryButton, width: '100%' }}
            >
              {isSaving ? 'Lagrer...' : 'Lagre Verveinnstillinger'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

interface AdminPromoCode {
  id: string;
  code: string;
  tier: 'STANDARD' | 'PREMIUM';
  discountPercent: number;
  durationMonths: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  validFrom: string | null;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

interface PromoCodesPanelProps {
  request: (url: string, method: string, body?: unknown) => Promise<any>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

/** `<input type="date">` value → end of that day in the admin's timezone, so the code works all day. */
function endOfDayIso(date: string): string | null {
  return date ? new Date(`${date}T23:59:59`).toISOString() : null;
}

function formatAdminDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function PromoCodesPanel({ request, onError, onSuccess }: PromoCodesPanelProps) {
  const [codes, setCodes] = useState<AdminPromoCode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [code, setCode] = useState<string>('');
  const [tier, setTier] = useState<'STANDARD' | 'PREMIUM'>('PREMIUM');
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [maxRedemptions, setMaxRedemptions] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const loadCodes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await request('/api/admin/promo-codes', 'GET');
      setCodes(Array.isArray(data.promoCodes) ? data.promoCodes : []);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kunne ikke laste kampanjekoder');
    } finally {
      setIsLoading(false);
    }
    // `request` closes over the admin secret, which can't change while this tab is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
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
      onSuccess(`Kampanjekode «${data.promoCode.code}» ble opprettet.`);
      setCode('');
      setMaxRedemptions('');
      setExpiresAt('');
      setNote('');
      await loadCodes();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kunne ikke opprette kampanjekode');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (promo: AdminPromoCode) => {
    try {
      await request(`/api/admin/promo-codes/${promo.id}`, 'PATCH', { isActive: !promo.isActive });
      onSuccess(`«${promo.code}» er ${promo.isActive ? 'deaktivert' : 'aktivert'}.`);
      await loadCodes();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kunne ikke oppdatere kampanjekode');
    }
  };

  const handleDelete = async (promo: AdminPromoCode) => {
    if (!window.confirm(`Slette kampanjekoden «${promo.code}»?`)) return;
    try {
      await request(`/api/admin/promo-codes/${promo.id}`, 'DELETE');
      onSuccess(`«${promo.code}» ble slettet.`);
      await loadCodes();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kunne ikke slette kampanjekode');
    }
  };

  const cellStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid #334155',
    fontSize: '14px',
    textAlign: 'left',
  };
  const headStyle: React.CSSProperties = {
    ...cellStyle,
    color: '#94A3B8',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ backgroundColor: '#1E293B', padding: '24px', borderRadius: '12px', border: '1px solid #334155' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0' }}>Ny kampanjekode</h2>
        <p style={{ color: '#94A3B8', fontSize: '14px', margin: '0 0 20px 0' }}>
          Gir Standard eller Premium gratis i et valgt antall måneder, uten betalingskort. Koden kan brukes på nett og
          Android (Apple tillater ikke egne koder i iOS-appen). Delvis rabatt støttes ikke ennå.
        </p>

        <form onSubmit={handleCreate}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              alignItems: 'end',
            }}
          >
            <div>
              <label style={styles.label}>Kode (tom = generer):</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="F.eks. VAAR2026"
                maxLength={32}
                style={{ ...styles.input, marginBottom: 0 }}
              />
            </div>
            <div>
              <label style={styles.label}>Plan:</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as 'STANDARD' | 'PREMIUM')}
                style={{ ...styles.select, marginBottom: 0 }}
              >
                <option value="STANDARD">Standard</option>
                <option value="PREMIUM">Premium</option>
              </select>
            </div>
            <div>
              <label style={styles.label}>Rabatt:</label>
              <input type="text" value="100 %" disabled style={{ ...styles.input, marginBottom: 0, opacity: 0.6 }} />
            </div>
            <div>
              <label style={styles.label}>Varighet (måneder):</label>
              <input
                type="number"
                min="1"
                max="24"
                value={durationMonths}
                onChange={(e) => setDurationMonths(Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                style={{ ...styles.input, marginBottom: 0 }}
                required
              />
            </div>
            <div>
              <label style={styles.label}>Maks antall bruk (tom = ubegrenset):</label>
              <input
                type="number"
                min="1"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                style={{ ...styles.input, marginBottom: 0 }}
              />
            </div>
            <div>
              <label style={styles.label}>Kan brukes til og med (valgfri):</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={{ ...styles.input, marginBottom: 0 }}
              />
            </div>
            <div>
              <label style={styles.label}>Notat (valgfri):</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="F.eks. Influencer-kampanje"
                style={{ ...styles.input, marginBottom: 0 }}
              />
            </div>
            <div>
              <button type="submit" disabled={isSaving} style={{ ...styles.primaryButton, width: '100%' }}>
                {isSaving ? 'Oppretter...' : 'Opprett kode'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div style={{ backgroundColor: '#1E293B', padding: '24px', borderRadius: '12px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Kampanjekoder</h2>
          <button
            onClick={loadCodes}
            disabled={isLoading}
            style={{ ...styles.secondaryButton, padding: '8px 14px', fontSize: '13px' }}
          >
            {isLoading ? 'Oppdaterer...' : '↻ Oppfrisk'}
          </button>
        </div>

        {codes.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#94A3B8' }}>
            {isLoading ? 'Laster inn kampanjekoder...' : 'Ingen kampanjekoder ennå.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={headStyle}>Kode</th>
                  <th style={headStyle}>Plan</th>
                  <th style={headStyle}>Måneder</th>
                  <th style={headStyle}>Brukt</th>
                  <th style={headStyle}>Utløper</th>
                  <th style={headStyle}>Notat</th>
                  <th style={headStyle}>Status</th>
                  <th style={headStyle}></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((promo) => (
                  <tr key={promo.id}>
                    <td style={{ ...cellStyle, fontFamily: 'monospace', fontWeight: 700 }}>{promo.code}</td>
                    <td style={{ ...cellStyle, color: promo.tier === 'PREMIUM' ? '#F59E0B' : '#38BDF8' }}>
                      {promo.tier === 'PREMIUM' ? 'Premium' : 'Standard'}
                    </td>
                    <td style={cellStyle}>{promo.durationMonths}</td>
                    <td style={cellStyle}>
                      {promo.redemptionCount} / {promo.maxRedemptions ?? '∞'}
                    </td>
                    <td style={cellStyle}>{formatAdminDate(promo.expiresAt)}</td>
                    <td style={{ ...cellStyle, color: '#94A3B8' }}>{promo.note || '—'}</td>
                    <td style={{ ...cellStyle, color: promo.isActive ? '#4ADE80' : '#94A3B8' }}>
                      {promo.isActive ? 'Aktiv' : 'Inaktiv'}
                    </td>
                    <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleToggleActive(promo)} style={styles.actionButton}>
                        {promo.isActive ? 'Deaktiver' : 'Aktiver'}
                      </button>{' '}
                      {promo.redemptionCount === 0 && (
                        <button onClick={() => handleDelete(promo)} style={styles.actionButtonDanger}>
                          Slett
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    minHeight: '100vh',
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '32px 20px',
  },
  container: {
    maxWidth: '1120px',
    margin: '0 auto',
  },
  centeredBox: {
    padding: '64px 20px',
    textAlign: 'center',
  },
  loginCard: {
    maxWidth: '460px',
    margin: '80px auto',
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
  },
  badge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    padding: '4px 10px',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  brandLogo: {
    display: 'block',
    borderRadius: '10px',
    marginBottom: '16px',
  },
  loginTitle: {
    fontSize: '24px',
    fontWeight: 800,
    margin: '4px 0 8px 0',
    color: '#F8FAFC',
  },
  loginSubtitle: {
    fontSize: '14px',
    color: '#94A3B8',
    lineHeight: 1.5,
    margin: 0,
  },
  backLink: {
    color: '#38BDF8',
    fontSize: '14px',
    textDecoration: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '16px',
    paddingBottom: '24px',
    borderBottom: '1px solid #1E293B',
    marginBottom: '24px',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: 800,
    margin: '4px 0 6px 0',
    letterSpacing: '-0.02em',
  },
  headerSubtitle: {
    fontSize: '14px',
    color: '#94A3B8',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  metricCard: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '18px 20px',
  },
  metricLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metricValue: {
    fontSize: '28px',
    fontWeight: 800,
    marginTop: '6px',
    color: '#F8FAFC',
  },
  errorAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#FCA5A5',
    padding: '12px 16px',
    borderRadius: '10px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  successAlert: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    color: '#6EE7B7',
    padding: '12px 16px',
    borderRadius: '10px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  formPanel: {
    backgroundColor: '#1E293B',
    border: '2px solid #0284C7',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '28px',
  },
  formHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  formTitle: {
    fontSize: '20px',
    fontWeight: 700,
    margin: 0,
  },
  closeButton: {
    background: 'transparent',
    border: '1px solid #475569',
    color: '#94A3B8',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  fieldGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 700,
    color: '#E2E8F0',
    marginBottom: '6px',
  },
  helperText: {
    fontSize: '12px',
    color: '#94A3B8',
    margin: '0 0 8px 0',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#F8FAFC',
    fontSize: '14px',
    marginBottom: '8px',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#F8FAFC',
    fontSize: '14px',
    marginBottom: '8px',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#F8FAFC',
    fontSize: '14px',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  questionHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  addQuestionButton: {
    backgroundColor: '#0C4A6E',
    border: '1px solid #38BDF8',
    color: '#BAE6FD',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  questionInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  questionNumberBadge: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    color: '#38BDF8',
    fontSize: '12px',
    fontWeight: 700,
    padding: '8px 10px',
    borderRadius: '8px',
    minWidth: '38px',
    textAlign: 'center',
  },
  removeQuestionButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#FCA5A5',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  formFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #334155',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: '#E2E8F0',
    cursor: 'pointer',
  },
  primaryButton: {
    backgroundColor: '#0284C7',
    border: 'none',
    color: '#FFFFFF',
    borderRadius: '10px',
    padding: '10px 18px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryButtonFull: {
    width: '100%',
    backgroundColor: '#0284C7',
    border: 'none',
    color: '#FFFFFF',
    borderRadius: '10px',
    padding: '12px 18px',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '8px',
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    border: '1px solid #475569',
    color: '#E2E8F0',
    borderRadius: '10px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '20px',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  filterLabel: {
    fontSize: '13px',
    color: '#94A3B8',
    fontWeight: 600,
    marginRight: '4px',
  },
  filterPill: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    color: '#94A3B8',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterPillActive: {
    backgroundColor: '#0C4A6E',
    borderColor: '#38BDF8',
    color: '#FFFFFF',
  },
  emptyBox: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '40px',
    textAlign: 'center',
  },
  examList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  examCard: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '14px',
    padding: '20px',
  },
  examCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '16px',
  },
  examTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  levelBadge: {
    fontSize: '12px',
    fontWeight: 800,
    padding: '3px 10px',
    borderRadius: '6px',
    border: '1px solid',
  },
  statusBadge: {
    fontSize: '12px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '6px',
  },
  examCardTitle: {
    fontSize: '18px',
    fontWeight: 700,
    margin: 0,
    color: '#F8FAFC',
  },
  examCardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  sessionCountText: {
    fontSize: '12px',
    color: '#94A3B8',
    marginRight: '6px',
  },
  actionButton: {
    backgroundColor: '#0F172A',
    border: '1px solid #475569',
    color: '#E2E8F0',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  actionButtonPrimary: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    border: '1px solid #38BDF8',
    color: '#38BDF8',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  actionButtonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#FCA5A5',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  promptsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '12px',
    marginBottom: '12px',
  },
  promptBox: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '12px 14px',
  },
  promptLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#38BDF8',
    letterSpacing: '0.04em',
    marginBottom: '6px',
  },
  promptText: {
    fontSize: '13px',
    color: '#E2E8F0',
    lineHeight: 1.5,
    margin: 0,
  },
  followUpBox: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '12px 14px',
  },
  followUpList: {
    margin: 0,
    paddingLeft: '20px',
  },
  followUpItem: {
    fontSize: '13px',
    color: '#CBD5E1',
    lineHeight: 1.6,
  },
};

