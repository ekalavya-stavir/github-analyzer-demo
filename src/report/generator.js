/**
 * HTML Report Generator
 *
 * Generates a self-contained static HTML file with:
 * - Dashboard overview with stat cards
 * - Sortable score table (all developers, all metrics)
 * - Modal popups for metric evidence and full developer summaries
 * - Review-only contributors section
 * - Responsive, modern dark-theme UI
 */

import { METRIC_LABELS, getGrade } from '../scoring/engine.js';

const METRIC_KEYS = Object.keys(METRIC_LABELS);

const SHORT_LABELS = {
  readability: 'Read',
  cyclomaticComplexity: 'Complex',
  codeMaintainability: 'Maint',
  solidPrinciples: 'SOLID',
  nplusone: 'N+1',
  prSize: 'PR Size',
  prReview: 'PR Rev',
  duplication: 'Dupl',
  contribution: 'Contrib',
};

export function generateHTMLReport(reportData) {
  const { repos, days, sinceDate, developers, reviewOnlyDevelopers, generatedAt } = reportData;

  const sortedDevs = [...developers].sort((a, b) => b.finalScore - a.finalScore);
  const topPerformer = sortedDevs[0] || null;
  const reviewOnly = reviewOnlyDevelopers || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GitHub Developer Scorecard Report</title>
<style>
${getStyles()}
</style>
</head>
<body>
<div class="container">
  ${renderHeader(repos, days, sinceDate, generatedAt)}
  ${renderDashboard(repos, days, sortedDevs, topPerformer, reviewOnly.length)}
  ${renderPodium(sortedDevs)}
  ${renderScoreTable(sortedDevs)}
  ${renderModal()}
  ${renderReviewOnlySection(reviewOnly)}
  ${renderFooter(generatedAt)}
</div>
<script>
${getEmbeddedData(sortedDevs)}
${getScripts()}
</script>
</body>
</html>`;
}

function renderHeader(repos, days, sinceDate, generatedAt) {
  return `
  <header class="header">
    <div class="header-content">
      <div class="logo">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
        </svg>
        <h1>Developer Scorecard Report</h1>
      </div>
      <div class="header-meta">
        <span class="badge">${repos.length} ${repos.length === 1 ? 'Repository' : 'Repositories'}</span>
        <span class="badge">${days}-Day Analysis</span>
        <span class="badge badge-muted">Generated ${new Date(generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  </header>`;
}

function renderDashboard(repos, days, developers, topPerformer, reviewOnlyCount) {
  const avgScore = developers.length > 0
    ? Math.round(developers.reduce((sum, d) => sum + d.finalScore, 0) / developers.length * 10) / 10
    : 0;
  const topGrade = topPerformer ? getGrade(topPerformer.finalScore) : { grade: '-', color: '#94a3b8' };

  return `
  <section class="dashboard">
    <h2 class="section-title">Dashboard Overview</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Repositories</div>
        <div class="stat-value">${repos.length}</div>
        <div class="stat-detail">${repos.map((r) => `<code>${r}</code>`).join(', ')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Time Range</div>
        <div class="stat-value">${days} Days</div>
        <div class="stat-detail">Activity window</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Contributors</div>
        <div class="stat-value">${developers.length}</div>
        <div class="stat-detail">Active developers${reviewOnlyCount > 0 ? ` + ${reviewOnlyCount} review-only` : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Score</div>
        <div class="stat-value" style="color: ${getGrade(avgScore).color}">${avgScore}</div>
        <div class="stat-detail">Out of 100</div>
      </div>
      ${topPerformer ? `
      <div class="stat-card highlight-card">
        <div class="stat-label">Top Performer</div>
        <div class="stat-value" style="color: ${topGrade.color}">
          <span class="grade-badge" style="background: ${topGrade.color}">${topGrade.grade}</span>
          ${escapeHtml(topPerformer.login)}
        </div>
        <div class="stat-detail">Score: ${topPerformer.finalScore}/100</div>
      </div>` : ''}
    </div>
  </section>`;
}

function renderPodium(developers) {
  if (developers.length < 2) return '';

  const top3 = developers.slice(0, 3);
  const podiumOrder = top3.length === 3
    ? [top3[1], top3[0], top3[2]]
    : [top3[1], top3[0]];
  const heights = ['140px', '180px', '110px'];
  const ranks = [2, 1, 3];
  const medals = ['\uD83E\uDD48', '\uD83E\uDD47', '\uD83E\uDD49'];

  const pillars = podiumOrder.map((dev, i) => {
    if (!dev) return '';
    const grade = getGrade(dev.finalScore);
    const avatarUrl = dev.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=80&background=random`;
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=80&background=random`;
    const rank = ranks[i];
    const isFirst = rank === 1;

    return `
      <div class="podium-slot ${isFirst ? 'podium-first' : ''}">
        <div class="podium-avatar-wrap">
          <img class="podium-avatar ${isFirst ? 'podium-avatar-lg' : ''}" src="${avatarUrl}" alt="${escapeHtml(dev.login)}" onerror="this.src='${fallback}'">
          <span class="podium-medal">${medals[i]}</span>
        </div>
        <div class="podium-name">${escapeHtml(dev.login)}</div>
        <div class="podium-score" style="color: ${grade.color}">
          ${dev.finalScore}<span class="score-max">/100</span>
        </div>
        <span class="grade-badge" style="background: ${grade.color}">${grade.grade}</span>
        <div class="podium-bar" style="height: ${heights[i]}; background: linear-gradient(0deg, ${grade.color}22, ${grade.color}08);">
          <span class="podium-rank">${rank}</span>
        </div>
      </div>`;
  }).join('');

  return `
  <section class="podium-section">
    <h2 class="section-title">Top Performers</h2>
    <div class="podium">
      ${pillars}
    </div>
  </section>`;
}

function renderScoreTable(developers) {
  if (developers.length === 0) return '';

  const headerCells = METRIC_KEYS.map((key) => {
    const short = SHORT_LABELS[key] || key;
    const full = METRIC_LABELS[key] || key;
    return `<th class="score-th" title="${full}" data-col="${key}" onclick="sortTable(this)">${short} <span class="sort-arrow"></span></th>`;
  }).join('\n            ');

  const rows = developers.map((dev, i) => {
    const grade = getGrade(dev.finalScore);
    const metrics = dev.metrics || {};

    const metricCells = METRIC_KEYS.map((key) => {
      const m = metrics[key] || { score: 0 };
      const cellGrade = getGrade(m.score * 10);
      return `<td class="score-td" style="color: ${cellGrade.color}" onclick="openMetricModal(${i},'${key}')">${m.score}</td>`;
    }).join('\n        ');

    const avatarUrl = dev.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=32&background=random`;
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=32&background=random`;

    return `      <tr data-dev-idx="${i}">
        <td class="rank-td">${i + 1}</td>
        <td class="dev-td">
          <img class="avatar-sm" src="${avatarUrl}" alt="${escapeHtml(dev.login)}" onerror="this.src='${fallbackUrl}'">
          <a href="https://github.com/${encodeURIComponent(dev.login)}" target="_blank" rel="noopener">${escapeHtml(dev.login)}</a>
        </td>
        ${metricCells}
        <td class="score-td total-td" style="color: ${grade.color}" onclick="openDevModal(${i})">${dev.finalScore}<span class="score-max">/100</span></td>
      </tr>`;
  }).join('\n');

  return `
  <div class="table-section">
    <h2 class="section-title">Developer Scorecards</h2>
    <div class="table-wrap">
      <table class="score-table">
        <thead>
          <tr>
            <th class="rank-th">#</th>
            <th class="dev-th" data-col="dev" onclick="sortTable(this)">Developer <span class="sort-arrow"></span></th>
            ${headerCells}
            <th class="score-th total-th" data-col="total" onclick="sortTable(this)">Total <span class="sort-arrow">\u25BC</span></th>
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderModal() {
  return `
  <div id="modal-overlay" class="modal-overlay" onclick="closeModal()">
    <div class="modal-content" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div id="modal-body"></div>
    </div>
  </div>`;
}

function renderReviewOnlySection(reviewOnlyDevs) {
  if (!reviewOnlyDevs || reviewOnlyDevs.length === 0) return '';

  return `
  <div class="review-only-section">
    <h2 class="section-title">Review-Only Contributors <span class="review-only-badge">${reviewOnlyDevs.length}</span></h2>
    <p class="review-only-desc">These contributors had no code changes during the analysis period but participated in PR reviews.</p>
    <div class="review-only-list">
      ${reviewOnlyDevs.map((dev, i) => {
        const prReview = dev.prReview || { score: 0, details: {} };
        const barColor = getGrade(prReview.score * 10).color;
        const evidence = prReview.details?.evidence || [];

        return `
        <div class="review-only-card">
          <div class="review-only-header" onclick="toggleSection('review-only-detail-${i}')">
            <div class="dev-info">
              <img class="avatar-sm" src="${dev.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=32&background=random`}" alt="${escapeHtml(dev.login)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=32&background=random'">
              <div>
                <span class="dev-name">${escapeHtml(dev.login)}</span>
                <a href="https://github.com/${encodeURIComponent(dev.login)}" target="_blank" rel="noopener" class="github-link">@${escapeHtml(dev.login)}</a>
              </div>
            </div>
            <div class="review-only-stats">
              <span class="review-only-stat">${dev.stats?.prsReviewed || 0} PRs reviewed</span>
              <span class="review-only-stat">${dev.stats?.reviewComments || 0} comments</span>
              <span class="score-cell" style="color: ${barColor}">${prReview.score}/10</span>
              <div class="metric-bar" style="min-width: 60px"><div class="metric-bar-fill" style="width: ${prReview.score * 10}%; background: ${barColor}"></div></div>
            </div>
            <span class="toggle-icon">\u25BC</span>
          </div>
          <div class="dev-detail" id="review-only-detail-${i}">
            ${evidence.length > 0 ? `
            <div class="evidence-panel open" style="margin-top: 12px">
              <h4>\uD83D\uDD0E PR Review Contribution — Evidence</h4>
              <div class="evidence-list">
                ${evidence.map((ev) => `
                  <div class="evidence-item">
                    <div class="evidence-header">
                      <code class="evidence-file">${escapeHtml(ev.file)}</code>
                      <span class="evidence-issue evidence-issue-${ev.issue?.replace(/[^a-z-]/g, '') || 'default'}">${escapeHtml(ev.issue)}</span>
                    </div>
                    ${ev.snippet ? `<pre class="evidence-snippet">${escapeHtml(ev.snippet)}</pre>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>` : ''}
          </div>
        </div>`;
      }).join('\n')}
    </div>
  </div>`;
}

function renderFooter(generatedAt) {
  return `
  <footer class="footer">
    <p>Generated by <strong>GitHub Analyser</strong> on ${new Date(generatedAt).toLocaleString()}</p>
    <p class="footer-note">Scores are heuristic-based and derived from measurable data. Use as guidance, not absolute assessment.</p>
  </footer>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getEmbeddedData(sortedDevs) {
  const devData = sortedDevs.map((dev) => ({
    login: dev.login,
    avatar: dev.avatar || '',
    finalScore: dev.finalScore,
    metrics: Object.fromEntries(
      METRIC_KEYS.map((key) => [key, {
        score: dev.metrics?.[key]?.score ?? 0,
        details: dev.metrics?.[key]?.details || {},
      }])
    ),
    strengths: dev.strengths || [],
    improvements: dev.improvements || [],
  }));

  const jsonStr = JSON.stringify(devData).replace(/<\//g, '<\\/');

  return `
    var DEV_DATA = ${jsonStr};
    var METRIC_KEYS = ${JSON.stringify(METRIC_KEYS)};
    var METRIC_LABELS = ${JSON.stringify(METRIC_LABELS).replace(/<\//g, '<\\/')};
  `;
}

function getStyles() {
  return `
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --surface-hover: #334155;
      --border: #334155;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --accent: #3b82f6;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --radius: 12px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }

    /* --- Header --- */
    .header { margin-bottom: 32px; }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--text);
    }

    .logo h1 { font-size: 1.5rem; font-weight: 700; }

    .header-meta { display: flex; gap: 8px; flex-wrap: wrap; }

    .badge {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .badge-muted { color: var(--text-dim); }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 20px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    /* --- Dashboard --- */
    .dashboard { margin-bottom: 40px; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }

    .highlight-card {
      border-color: var(--accent);
      background: linear-gradient(135deg, var(--surface), rgba(59, 130, 246, 0.1));
    }

    .stat-label {
      font-size: 0.8rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }

    .stat-value { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
    .stat-detail { font-size: 0.8rem; color: var(--text-muted); }

    .stat-detail code {
      background: var(--bg);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .grade-badge, .grade-badge-sm, .grade-badge-lg {
      display: inline-block;
      color: white;
      font-weight: 700;
      border-radius: 6px;
      text-align: center;
    }

    .grade-badge { padding: 2px 8px; font-size: 0.85rem; }
    .grade-badge-sm { padding: 2px 6px; font-size: 0.7rem; border-radius: 4px; }
    .grade-badge-lg { padding: 4px 14px; font-size: 1.1rem; border-radius: 8px; }

    /* --- Podium --- */
    .podium-section { margin-bottom: 40px; }

    .podium {
      display: flex;
      justify-content: center;
      align-items: flex-end;
      gap: 20px;
      padding: 20px 0 0;
    }

    .podium-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      min-width: 120px;
    }

    .podium-first .podium-name { font-size: 1rem; }

    .podium-avatar-wrap {
      position: relative;
      margin-bottom: 4px;
    }

    .podium-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 3px solid var(--border);
      transition: transform 0.2s;
    }

    .podium-first .podium-avatar,
    .podium-avatar-lg {
      width: 72px;
      height: 72px;
    }

    .podium-avatar-wrap:hover .podium-avatar {
      transform: scale(1.08);
    }

    .podium-medal {
      position: absolute;
      bottom: -4px;
      right: -4px;
      font-size: 1.3rem;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
    }

    .podium-name {
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--text);
      text-align: center;
      white-space: nowrap;
    }

    .podium-score {
      font-weight: 800;
      font-size: 1.1rem;
      line-height: 1;
    }

    .podium-first .podium-score {
      font-size: 1.4rem;
    }

    .podium-bar {
      width: 100%;
      border-radius: 8px 8px 0 0;
      border: 1px solid var(--border);
      border-bottom: none;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: 12px;
      min-width: 100px;
    }

    .podium-rank {
      font-size: 2rem;
      font-weight: 800;
      color: var(--text-dim);
      opacity: 0.5;
    }

    .podium-first .podium-rank {
      font-size: 2.5rem;
    }

    @media (max-width: 640px) {
      .podium { gap: 10px; }
      .podium-slot { min-width: 90px; }
      .podium-avatar { width: 44px; height: 44px; }
      .podium-first .podium-avatar, .podium-avatar-lg { width: 56px; height: 56px; }
      .podium-bar { min-width: 80px; }
    }

    /* --- Score Table --- */
    .table-section { margin-bottom: 40px; }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }

    .score-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      min-width: 900px;
    }

    .score-table thead {
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .score-table th {
      background: var(--bg);
      padding: 12px 10px;
      text-align: center;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-dim);
      border-bottom: 2px solid var(--border);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      transition: color 0.15s;
    }

    .score-table th:hover { color: var(--text); }

    .rank-th { width: 42px; cursor: default; }
    .rank-th:hover { color: var(--text-dim); }
    .dev-th { text-align: left; min-width: 160px; }
    .total-th { background: rgba(59,130,246,0.08); }

    .sort-arrow {
      font-size: 0.6rem;
      margin-left: 2px;
      opacity: 0.7;
    }

    .score-table td {
      padding: 10px 10px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.4);
      text-align: center;
    }

    .score-table tbody tr {
      transition: background 0.15s;
    }

    .score-table tbody tr:hover {
      background: var(--surface-hover);
    }

    .rank-td {
      font-weight: 700;
      color: var(--text-dim);
      font-size: 0.8rem;
      text-align: center;
    }

    .dev-td {
      display: flex;
      align-items: center;
      gap: 10px;
      text-align: left;
      white-space: nowrap;
    }

    .dev-td a {
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
    }

    .dev-td a:hover { color: var(--accent); text-decoration: underline; }

    .score-td {
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .score-td:hover { opacity: 0.75; }

    .total-td {
      background: rgba(59,130,246,0.04);
      font-size: 0.95rem;
    }

    .score-max {
      font-size: 0.6rem;
      color: var(--text-dim);
      font-weight: 400;
    }

    .avatar-sm {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* --- Modal --- */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      padding: 24px;
    }

    .modal-overlay.open {
      display: flex;
    }

    .modal-content {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      max-width: 700px;
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      position: relative;
      padding: 32px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
    }

    .modal-close {
      position: absolute;
      top: 12px;
      right: 16px;
      background: none;
      border: none;
      color: var(--text-dim);
      font-size: 1.5rem;
      cursor: pointer;
      line-height: 1;
      padding: 4px 8px;
      border-radius: 6px;
      transition: background 0.15s, color 0.15s;
    }

    .modal-close:hover {
      background: var(--surface-hover);
      color: var(--text);
    }

    /* Modal: Metric Detail */
    .modal-metric h2 {
      font-size: 1.2rem;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .modal-metric h3 {
      font-size: 1rem;
      margin: 20px 0 10px;
      color: var(--text-muted);
    }

    /* Modal: Dev Summary */
    .modal-dev-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .modal-dev-header .avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
    }

    .modal-dev-header h2 {
      font-size: 1.2rem;
      margin-bottom: 2px;
    }

    .modal-score {
      margin-left: auto;
      text-align: center;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .modal-score-num {
      font-size: 2rem;
      font-weight: 800;
      line-height: 1;
    }

    .modal-radar {
      text-align: center;
      margin: 16px 0;
    }

    .modal-radar canvas {
      display: block;
      margin: 0 auto;
    }

    .modal-metrics-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      margin: 16px 0;
    }

    .modal-metrics-table th {
      text-align: left;
      padding: 8px 6px;
      color: var(--text-dim);
      font-weight: 500;
      border-bottom: 1px solid var(--border);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .modal-metrics-table td {
      padding: 8px 6px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
    }

    .modal-metrics-table tbody tr {
      cursor: pointer;
      transition: background 0.15s;
    }

    .modal-metrics-table tbody tr:hover {
      background: var(--surface-hover);
    }

    /* Shared: score cell, metric bar, tags, evidence */
    .score-cell {
      font-weight: 700;
      white-space: nowrap;
      min-width: 50px;
    }

    .metric-bar {
      height: 6px;
      background: var(--bg);
      border-radius: 3px;
      overflow: hidden;
      min-width: 80px;
    }

    .metric-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.4s ease;
    }

    .tag-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tag {
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.85rem;
    }

    .tag-green {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .tag-amber {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .tag-desc {
      display: block;
      margin-top: 2px;
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    .evidence-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .evidence-item {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
    }

    .evidence-header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 0.82rem;
      margin-bottom: 4px;
    }

    .evidence-file {
      background: rgba(59, 130, 246, 0.12);
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 0.78rem;
      color: var(--accent);
    }

    .evidence-line {
      color: var(--text-dim);
      font-size: 0.75rem;
    }

    .evidence-issue {
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 0.73rem;
      font-weight: 500;
      background: rgba(245, 158, 11, 0.12);
      color: var(--amber);
    }

    .evidence-issue-overview {
      background: rgba(59, 130, 246, 0.12);
      color: var(--accent);
    }

    .evidence-issue-clean, .evidence-issue-meets-target {
      background: rgba(16, 185, 129, 0.12);
      color: var(--green);
    }

    .evidence-issue-no-data, .evidence-issue-no-code-files {
      background: rgba(148, 163, 184, 0.12);
      color: var(--text-dim);
    }

    .evidence-snippet {
      background: rgba(15, 23, 42, 0.6);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.76rem;
      overflow-x: auto;
      color: var(--text-muted);
      margin-top: 4px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .evidence-panel {
      display: none;
      margin-top: 16px;
      background: rgba(59, 130, 246, 0.04);
      border: 1px solid rgba(59, 130, 246, 0.15);
      border-radius: 8px;
      padding: 16px;
    }

    .evidence-panel.open { display: block; }

    .evidence-panel h4 {
      font-size: 0.9rem;
      margin-bottom: 12px;
      color: var(--text-muted);
    }

    .github-link {
      color: var(--accent);
      text-decoration: none;
      font-size: 0.85rem;
    }

    .github-link:hover { text-decoration: underline; }

    /* --- Review-Only Section --- */
    .review-only-section { margin-bottom: 40px; }

    .review-only-badge {
      background: var(--surface-hover);
      color: var(--text-muted);
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 10px;
      margin-left: 8px;
      font-weight: 500;
    }

    .review-only-desc {
      color: var(--text-dim);
      font-size: 0.85rem;
      margin-bottom: 16px;
    }

    .review-only-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .review-only-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .review-only-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      cursor: pointer;
      transition: background 0.2s;
      gap: 16px;
    }

    .review-only-header:hover { background: var(--surface-hover); }

    .dev-info { display: flex; align-items: center; gap: 16px; }

    .dev-name {
      font-weight: 500;
      min-width: 120px;
      font-size: 0.9rem;
    }

    .review-only-stats { display: flex; align-items: center; gap: 16px; }

    .review-only-stat {
      font-size: 0.82rem;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .toggle-icon {
      color: var(--text-dim);
      font-size: 0.9rem;
      transition: transform 0.3s;
    }

    .dev-detail {
      display: none;
      padding: 0 24px 24px;
      border-top: 1px solid var(--border);
    }

    .dev-detail.open { display: block; }

    /* --- Footer --- */
    .footer {
      text-align: center;
      padding: 32px 0 16px;
      border-top: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 0.85rem;
    }

    .footer-note {
      margin-top: 4px;
      font-size: 0.75rem;
      color: var(--text-dim);
    }

    /* --- Responsive --- */
    @media (max-width: 640px) {
      .container { padding: 12px; }
      .header-content { flex-direction: column; align-items: flex-start; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .modal-content { padding: 20px; margin: 8px; }
    }
  `;
}

function getScripts() {
  return `
    function getGradeClient(score) {
      if (score >= 90) return { grade: 'A+', color: '#10b981' };
      if (score >= 80) return { grade: 'A', color: '#34d399' };
      if (score >= 70) return { grade: 'B', color: '#60a5fa' };
      if (score >= 60) return { grade: 'C', color: '#fbbf24' };
      if (score >= 50) return { grade: 'D', color: '#f97316' };
      return { grade: 'F', color: '#ef4444' };
    }

    function esc(str) {
      if (!str) return '';
      var d = document.createElement('div');
      d.appendChild(document.createTextNode(String(str)));
      return d.innerHTML;
    }

    function toggleSection(id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.toggle('open');
        var card = el.closest('.review-only-card');
        var icon = card && card.querySelector('.toggle-icon');
        if (icon) icon.style.transform = el.classList.contains('open') ? 'rotate(180deg)' : '';
      }
    }

    /* --- Table Sort --- */
    var currentSortCol = 'total';
    var currentSortAsc = false;

    function sortTable(th) {
      var col = th.getAttribute('data-col');
      if (!col) return;

      if (currentSortCol === col) {
        currentSortAsc = !currentSortAsc;
      } else {
        currentSortCol = col;
        currentSortAsc = (col === 'dev');
      }

      var tbody = document.querySelector('.score-table tbody');
      var rows = Array.from(tbody.querySelectorAll('tr'));

      rows.sort(function(a, b) {
        var va, vb;
        if (col === 'dev') {
          va = a.querySelector('.dev-td a').textContent.toLowerCase();
          vb = b.querySelector('.dev-td a').textContent.toLowerCase();
          return currentSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        if (col === 'total') {
          va = parseFloat(a.querySelector('.total-td').textContent);
          vb = parseFloat(b.querySelector('.total-td').textContent);
        } else {
          var colIdx = METRIC_KEYS.indexOf(col);
          var tdsA = a.querySelectorAll('.score-td');
          var tdsB = b.querySelectorAll('.score-td');
          va = parseFloat(tdsA[colIdx] ? tdsA[colIdx].textContent : '0');
          vb = parseFloat(tdsB[colIdx] ? tdsB[colIdx].textContent : '0');
        }
        return currentSortAsc ? va - vb : vb - va;
      });

      rows.forEach(function(row, i) {
        row.querySelector('.rank-td').textContent = i + 1;
        tbody.appendChild(row);
      });

      var arrows = document.querySelectorAll('.score-table th .sort-arrow');
      for (var i = 0; i < arrows.length; i++) arrows[i].textContent = '';
      var thisArrow = th.querySelector('.sort-arrow');
      if (thisArrow) thisArrow.textContent = currentSortAsc ? '\\u25B2' : '\\u25BC';
    }

    /* --- Modal --- */
    function openMetricModal(devIdx, metricKey) {
      var dev = DEV_DATA[devIdx];
      if (!dev) return;
      var metric = dev.metrics[metricKey];
      var label = METRIC_LABELS[metricKey];
      var grade = getGradeClient(metric.score * 10);
      var evidence = (metric.details && metric.details.evidence) || [];

      var strength = null;
      var improvement = null;
      for (var i = 0; i < dev.strengths.length; i++) {
        if (dev.strengths[i].metric === label) { strength = dev.strengths[i]; break; }
      }
      for (var i = 0; i < dev.improvements.length; i++) {
        if (dev.improvements[i].metric === label) { improvement = dev.improvements[i]; break; }
      }

      var h = '<div class="modal-metric">';
      h += '<h2>' + esc(label) + ' <span class="grade-badge" style="background:' + grade.color + '">' + metric.score + '/10</span></h2>';
      h += '<p style="color:var(--text-muted);margin-bottom:16px">Developer: <strong>' + esc(dev.login) + '</strong></p>';

      if (strength) {
        h += '<div class="tag tag-green"><strong>\\uD83D\\uDCAA Strength</strong><span class="tag-desc">' + esc(strength.description) + '</span></div>';
      }
      if (improvement) {
        h += '<div class="tag tag-amber" style="margin-top:8px"><strong>\\uD83D\\uDCC8 Needs Improvement</strong><span class="tag-desc">' + esc(improvement.suggestion) + '</span></div>';
      }

      // Filter out summary/meta entries — only show actual violation evidence
      var META_ISSUES = ['overview', 'insufficient-data', 'no-data', 'no-code-files', 'clean', 'well-organized', 'structure-review'];
      var realEvidence = evidence.filter(function(ev) { return META_ISSUES.indexOf(ev.issue) === -1; });

      if (realEvidence.length > 0) {
        h += '<h3>Evidence (' + realEvidence.length + ' item' + (realEvidence.length > 1 ? 's' : '') + ')</h3>';
        h += '<div class="evidence-list">';
        for (var i = 0; i < realEvidence.length; i++) {
          var ev = realEvidence[i];
          h += '<div class="evidence-item"><div class="evidence-header">';
          h += '<code class="evidence-file">' + esc(ev.file) + '</code>';
          if (ev.line > 0) h += '<span class="evidence-line">line ' + ev.line + '</span>';
          var issueClass = 'evidence-issue';
          if (ev.issue) {
            var slug = ev.issue.replace(/[^a-z-]/g, '');
            if (slug) issueClass += ' evidence-issue-' + slug;
          }
          h += '<span class="' + issueClass + '">' + esc(ev.issue) + '</span>';
          h += '</div>';
          if (ev.snippet) h += '<pre class="evidence-snippet">' + esc(ev.snippet) + '</pre>';
          h += '</div>';
        }
        h += '</div>';
      }

      h += '</div>';
      document.getElementById('modal-body').innerHTML = h;
      document.getElementById('modal-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function openDevModal(devIdx) {
      var dev = DEV_DATA[devIdx];
      if (!dev) return;
      var grade = getGradeClient(dev.finalScore);
      var canvasId = 'modal-radar-' + devIdx;

      var h = '<div class="modal-dev">';
      h += '<div class="modal-dev-header">';
      var avatarUrl = dev.avatar || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(dev.login) + '&size=64&background=random');
      var fallbackUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(dev.login) + '&size=64&background=random';
      h += '<img class="avatar" src="' + avatarUrl + '" alt="' + esc(dev.login) + '" onerror="this.src=\\'' + fallbackUrl + '\\'">';
      h += '<div><h2>' + esc(dev.login) + '</h2>';
      h += '<a href="https://github.com/' + encodeURIComponent(dev.login) + '" target="_blank" class="github-link">@' + esc(dev.login) + '</a></div>';
      h += '<div class="modal-score" style="color:' + grade.color + '">';
      h += '<span class="modal-score-num">' + dev.finalScore + '</span><span class="score-max">/100</span> ';
      h += '<span class="grade-badge-lg" style="background:' + grade.color + '">' + grade.grade + '</span>';
      h += '</div></div>';

      h += '<div class="modal-radar"><canvas id="' + canvasId + '" width="380" height="380"></canvas></div>';

      h += '<table class="modal-metrics-table"><thead><tr><th>Metric</th><th>Score</th><th>Bar</th></tr></thead><tbody>';
      for (var k = 0; k < METRIC_KEYS.length; k++) {
        var key = METRIC_KEYS[k];
        var m = dev.metrics[key] || { score: 0 };
        var barColor = getGradeClient(m.score * 10).color;
        h += '<tr onclick="openMetricModal(' + devIdx + ',\\'' + key + '\\')">';
        h += '<td>' + METRIC_LABELS[key] + '</td>';
        h += '<td class="score-cell" style="color:' + barColor + '">' + m.score + '/10</td>';
        h += '<td><div class="metric-bar"><div class="metric-bar-fill" style="width:' + (m.score * 10) + '%;background:' + barColor + '"></div></div></td>';
        h += '</tr>';
      }
      h += '</tbody></table>';

      if (dev.strengths.length > 0) {
        h += '<h3 style="margin-top:20px">\\uD83D\\uDCAA Strengths</h3><div class="tag-list" style="margin-top:8px">';
        for (var i = 0; i < dev.strengths.length; i++) {
          var s = dev.strengths[i];
          h += '<div class="tag tag-green"><strong>' + esc(s.metric) + '</strong> (' + s.score + '/10)<span class="tag-desc">' + esc(s.description) + '</span></div>';
        }
        h += '</div>';
      }

      if (dev.improvements.length > 0) {
        h += '<h3 style="margin-top:20px">\\uD83D\\uDCC8 Areas for Improvement</h3><div class="tag-list" style="margin-top:8px">';
        for (var i = 0; i < dev.improvements.length; i++) {
          var imp = dev.improvements[i];
          h += '<div class="tag tag-amber"><strong>' + esc(imp.metric) + '</strong> (' + imp.score + '/10)<span class="tag-desc">' + esc(imp.suggestion) + '</span></div>';
        }
        h += '</div>';
      }

      h += '</div>';
      document.getElementById('modal-body').innerHTML = h;
      document.getElementById('modal-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';

      setTimeout(function() {
        var pts = [];
        for (var k = 0; k < METRIC_KEYS.length; k++) {
          var key = METRIC_KEYS[k];
          var lbl = METRIC_LABELS[key];
          pts.push({
            label: lbl.length > 18 ? lbl.substring(0, 16) + '\\u2026' : lbl,
            value: dev.metrics[key] ? dev.metrics[key].score : 0,
          });
        }
        drawRadarChart(canvasId, pts);
      }, 50);
    }

    function closeModal() {
      document.getElementById('modal-overlay').classList.remove('open');
      document.body.style.overflow = '';
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });

    /* --- Radar Chart --- */
    function drawRadarChart(canvasId, dataPoints) {
      var canvas = document.getElementById(canvasId);
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var W = canvas.width;
      var H = canvas.height;
      var cx = W / 2;
      var cy = H / 2;
      var maxR = Math.min(cx, cy) - 60;
      var n = dataPoints.length;
      var angleStep = (2 * Math.PI) / n;
      var startAngle = -Math.PI / 2;

      ctx.clearRect(0, 0, W, H);

      for (var ring = 1; ring <= 5; ring++) {
        var r = (ring / 5) * maxR;
        ctx.beginPath();
        for (var i = 0; i <= n; i++) {
          var angle = startAngle + i * angleStep;
          var x = cx + r * Math.cos(angle);
          var y = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < n; i++) {
        var angle = startAngle + i * angleStep;
        var x1 = cx + maxR * Math.cos(angle);
        var y1 = cy + maxR * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
        ctx.stroke();

        var labelR = maxR + 30;
        var lx = cx + labelR * Math.cos(angle);
        var ly = cy + labelR * Math.sin(angle);

        ctx.save();
        if (lx < cx - 10) ctx.textAlign = 'right';
        else if (lx > cx + 10) ctx.textAlign = 'left';
        else ctx.textAlign = 'center';
        ctx.fillText(dataPoints[i].label, lx, ly);
        ctx.restore();
      }

      ctx.beginPath();
      for (var i = 0; i <= n; i++) {
        var idx = i % n;
        var val = Math.max(0, Math.min(10, dataPoints[idx].value));
        var r = (val / 10) * maxR;
        var angle = startAngle + idx * angleStep;
        var x = cx + r * Math.cos(angle);
        var y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      for (var i = 0; i < n; i++) {
        var val = Math.max(0, Math.min(10, dataPoints[i].value));
        var r = (val / 10) * maxR;
        var angle = startAngle + i * angleStep;
        var x = cx + r * Math.cos(angle);
        var y = cy + r * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  `;
}
