/**
 * HTML Report Generator
 *
 * Generates a self-contained static HTML file with:
 * - Dashboard overview
 * - Per-developer scorecards with radar charts
 * - Metric breakdowns, strengths, and improvement suggestions
 * - N+1 violations section
 * - Responsive, modern UI with collapsible sections
 */

import { METRIC_LABELS, getGrade } from '../scoring/engine.js';

export function generateHTMLReport(reportData) {
  const { repos, days, sinceDate, developers, generatedAt } = reportData;

  const sortedDevs = [...developers].sort((a, b) => b.finalScore - a.finalScore);
  const topPerformer = sortedDevs[0] || null;

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
  ${renderDashboard(repos, days, sortedDevs, topPerformer)}
  <div class="developers-section">
    <h2 class="section-title">Developer Scorecards</h2>
    ${sortedDevs.map((dev, i) => renderDeveloperCard(dev, i)).join('\n')}
  </div>
  ${renderFooter(generatedAt)}
</div>
<script>
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

function renderDashboard(repos, days, developers, topPerformer) {
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
        <div class="stat-detail">Unique developers</div>
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
    ${renderLeaderboard(developers)}
  </section>`;
}

function renderLeaderboard(developers) {
  if (developers.length === 0) return '';

  return `
    <div class="leaderboard">
      <h3>Leaderboard</h3>
      <div class="leaderboard-list">
        ${developers.map((dev, i) => {
          const grade = getGrade(dev.finalScore);
          return `
          <div class="leaderboard-item">
            <span class="rank">#${i + 1}</span>
            <img class="avatar-sm" src="${dev.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=32&background=random`}" alt="${escapeHtml(dev.login)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=32&background=random'">
            <span class="dev-name">${escapeHtml(dev.login)}</span>
            <div class="score-bar-container">
              <div class="score-bar" style="width: ${dev.finalScore}%; background: ${grade.color}"></div>
            </div>
            <span class="score-label" style="color: ${grade.color}">${dev.finalScore}</span>
            <span class="grade-badge-sm" style="background: ${grade.color}">${grade.grade}</span>
          </div>`;
        }).join('\n')}
      </div>
    </div>`;
}

function renderDeveloperCard(dev, index) {
  const grade = getGrade(dev.finalScore);
  const metrics = dev.metrics || {};
  const canvasId = `radar-${index}`;

  return `
  <div class="developer-card" id="dev-${index}">
    <div class="dev-header" onclick="toggleSection('dev-detail-${index}')">
      <div class="dev-info">
        <img class="avatar" src="${dev.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=64&background=random`}" alt="${escapeHtml(dev.login)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(dev.login)}&size=64&background=random'">
        <div>
          <h3 class="dev-name-large">${escapeHtml(dev.login)}</h3>
          <a href="https://github.com/${encodeURIComponent(dev.login)}" target="_blank" rel="noopener" class="github-link">@${escapeHtml(dev.login)}</a>
        </div>
      </div>
      <div class="dev-score">
        <div class="score-circle" style="border-color: ${grade.color}">
          <span class="score-number" style="color: ${grade.color}">${dev.finalScore}</span>
          <span class="score-max">/100</span>
        </div>
        <span class="grade-badge-lg" style="background: ${grade.color}">${grade.grade}</span>
      </div>
      <span class="toggle-icon">▼</span>
    </div>

    <div class="dev-detail" id="dev-detail-${index}">
      <div class="detail-grid">
        <div class="chart-section">
          <h4>Performance Radar</h4>
          <canvas id="${canvasId}" width="380" height="380"></canvas>
        </div>
        <div class="metrics-section">
          <h4>Metric Breakdown</h4>
          <table class="metrics-table">
            <thead><tr><th>Metric</th><th>Score</th><th>Bar</th></tr></thead>
            <tbody>
              ${Object.entries(METRIC_LABELS).map(([key, label]) => {
                const m = metrics[key] || { score: 0 };
                const barColor = getGrade(m.score * 10).color;
                const evidenceItems = m.details?.evidence || [];
                const hasEvidence = evidenceItems.length > 0;
                return `
                <tr>
                  <td>${hasEvidence ? `<span class="evidence-toggle" onclick="toggleSection('evidence-${index}-${key}')" title="View evidence">${label} <small>▶</small></span>` : label}</td>
                  <td class="score-cell" style="color: ${barColor}">${m.score}/10</td>
                  <td><div class="metric-bar"><div class="metric-bar-fill" style="width: ${m.score * 10}%; background: ${barColor}"></div></div></td>
                </tr>`;
              }).join('\n')}
            </tbody>
          </table>
        </div>
      </div>

      ${renderEvidencePanels(metrics, index)}
      ${renderStrengths(dev.strengths)}
      ${renderImprovements(dev.improvements)}

      <script>
        drawRadarChart('${canvasId}', ${JSON.stringify(
          Object.entries(METRIC_LABELS).map(([key, label]) => ({
            label: label.length > 18 ? label.substring(0, 16) + '…' : label,
            value: metrics[key]?.score ?? 0,
          }))
        )});
      </script>
    </div>
  </div>`;
}

function renderStrengths(strengths) {
  if (!strengths || strengths.length === 0) return '';
  return `
    <div class="strengths-section">
      <h4>💪 Strengths</h4>
      <div class="tag-list">
        ${strengths.map((s) => `
          <div class="tag tag-green">
            <strong>${escapeHtml(s.metric)}</strong> (${s.score}/10)
            <span class="tag-desc">${escapeHtml(s.description)}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderImprovements(improvements) {
  if (!improvements || improvements.length === 0) return '';
  return `
    <div class="improvements-section">
      <h4>📈 Areas for Improvement</h4>
      <div class="tag-list">
        ${improvements.map((imp) => `
          <div class="tag tag-amber">
            <strong>${escapeHtml(imp.metric)}</strong> (${imp.score}/10)
            <span class="tag-desc">${escapeHtml(imp.suggestion)}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderEvidencePanels(metrics, devIndex) {
  return Object.entries(METRIC_LABELS).map(([key, label]) => {
    const m = metrics[key] || { score: 0 };
    const evidenceItems = m.details?.evidence || [];
    if (evidenceItems.length === 0) return '';

    return `
    <div class="evidence-panel" id="evidence-${devIndex}-${key}">
      <h4>🔎 ${escapeHtml(label)} — Evidence (${evidenceItems.length} item${evidenceItems.length > 1 ? 's' : ''})</h4>
      <div class="evidence-list">
        ${evidenceItems.map((ev) => `
          <div class="evidence-item">
            <div class="evidence-header">
              <code class="evidence-file">${escapeHtml(ev.file)}</code>
              ${ev.line > 0 ? `<span class="evidence-line">line ${ev.line}</span>` : ''}
              <span class="evidence-issue">${escapeHtml(ev.issue)}</span>
            </div>
            ${ev.snippet ? `<pre class="evidence-snippet">${escapeHtml(ev.snippet)}</pre>` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
  }).join('\n');
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

    .header {
      margin-bottom: 32px;
    }

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

    .logo h1 {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .header-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .badge {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .badge-muted {
      color: var(--text-dim);
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 20px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    .dashboard {
      margin-bottom: 40px;
    }

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

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .stat-detail {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

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

    .leaderboard {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }

    .leaderboard h3 {
      font-size: 1rem;
      margin-bottom: 16px;
      color: var(--text-muted);
    }

    .leaderboard-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
    }

    .leaderboard-item:last-child { border-bottom: none; }

    .rank {
      font-weight: 700;
      color: var(--text-dim);
      min-width: 32px;
      font-size: 0.85rem;
    }

    .avatar-sm {
      width: 28px;
      height: 28px;
      border-radius: 50%;
    }

    .dev-name {
      font-weight: 500;
      min-width: 120px;
      font-size: 0.9rem;
    }

    .score-bar-container {
      flex: 1;
      height: 8px;
      background: var(--bg);
      border-radius: 4px;
      overflow: hidden;
    }

    .score-bar {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .score-label {
      font-weight: 700;
      min-width: 36px;
      text-align: right;
      font-size: 0.9rem;
    }

    .developers-section {
      margin-bottom: 40px;
    }

    .developer-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 16px;
      overflow: hidden;
    }

    .dev-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .dev-header:hover {
      background: var(--surface-hover);
    }

    .dev-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
    }

    .dev-name-large {
      font-size: 1.1rem;
      font-weight: 600;
    }

    .github-link {
      color: var(--accent);
      text-decoration: none;
      font-size: 0.85rem;
    }

    .github-link:hover {
      text-decoration: underline;
    }

    .dev-score {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .score-circle {
      text-align: center;
      border: 3px solid;
      border-radius: 50%;
      width: 64px;
      height: 64px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .score-number {
      font-size: 1.3rem;
      font-weight: 800;
      line-height: 1;
    }

    .score-max {
      font-size: 0.65rem;
      color: var(--text-dim);
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

    .dev-detail.open {
      display: block;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: 400px 1fr;
      gap: 24px;
      margin-top: 20px;
    }

    @media (max-width: 900px) {
      .detail-grid {
        grid-template-columns: 1fr;
      }
    }

    .chart-section, .metrics-section {
      min-width: 0;
    }

    .chart-section h4, .metrics-section h4 {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .chart-section canvas {
      display: block;
      margin: 0 auto;
    }

    .metrics-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    .metrics-table th {
      text-align: left;
      padding: 8px 6px;
      color: var(--text-dim);
      font-weight: 500;
      border-bottom: 1px solid var(--border);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .metrics-table td {
      padding: 8px 6px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
    }

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

    .strengths-section, .improvements-section, .nplusone-section {
      margin-top: 20px;
    }

    .strengths-section h4, .improvements-section h4, .nplusone-section h4 {
      font-size: 0.95rem;
      margin-bottom: 10px;
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

    .evidence-toggle {
      cursor: pointer;
      color: var(--accent);
      transition: color 0.2s;
    }

    .evidence-toggle:hover {
      color: #60a5fa;
    }

    .evidence-toggle small {
      font-size: 0.65rem;
      transition: transform 0.2s;
      display: inline-block;
    }

    .evidence-panel {
      display: none;
      margin-top: 16px;
      background: rgba(59, 130, 246, 0.04);
      border: 1px solid rgba(59, 130, 246, 0.15);
      border-radius: 8px;
      padding: 16px;
    }

    .evidence-panel.open {
      display: block;
    }

    .evidence-panel h4 {
      font-size: 0.9rem;
      margin-bottom: 12px;
      color: var(--text-muted);
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
      background: rgba(245, 158, 11, 0.12);
      color: var(--amber);
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 0.73rem;
      font-weight: 500;
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

    @media (max-width: 640px) {
      .container { padding: 12px; }
      .header-content { flex-direction: column; align-items: flex-start; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .dev-header { flex-wrap: wrap; gap: 12px; }
      .leaderboard-item { flex-wrap: wrap; }
    }
  `;
}

function getScripts() {
  return `
    function toggleSection(id) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('open');
        const card = el.closest('.developer-card');
        const icon = card?.querySelector('.toggle-icon');
        if (icon) icon.style.transform = el.classList.contains('open') ? 'rotate(180deg)' : '';
      }
    }

    function drawRadarChart(canvasId, dataPoints) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.min(cx, cy) - 60;
      const n = dataPoints.length;
      const angleStep = (2 * Math.PI) / n;
      const startAngle = -Math.PI / 2;

      ctx.clearRect(0, 0, W, H);

      // Grid rings
      for (let ring = 1; ring <= 5; ring++) {
        const r = (ring / 5) * maxR;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const angle = startAngle + i * angleStep;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Axis lines and labels
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        const angle = startAngle + i * angleStep;
        const x1 = cx + maxR * Math.cos(angle);
        const y1 = cy + maxR * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
        ctx.stroke();

        const labelR = maxR + 30;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);

        const label = dataPoints[i].label;
        ctx.save();
        if (lx < cx - 10) ctx.textAlign = 'right';
        else if (lx > cx + 10) ctx.textAlign = 'left';
        else ctx.textAlign = 'center';
        ctx.fillText(label, lx, ly);
        ctx.restore();
      }

      // Data polygon
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const idx = i % n;
        const val = Math.max(0, Math.min(10, dataPoints[idx].value));
        const r = (val / 10) * maxR;
        const angle = startAngle + idx * angleStep;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Data points
      for (let i = 0; i < n; i++) {
        const val = Math.max(0, Math.min(10, dataPoints[i].value));
        const r = (val / 10) * maxR;
        const angle = startAngle + i * angleStep;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
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
