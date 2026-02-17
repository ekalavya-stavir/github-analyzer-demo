import { parseArgs } from 'node:util';

const DEFAULTS = {
  days: 30,
  output: 'report.html',
};

const HELP_TEXT = `
GitHub Analyser — Developer Scorecard Generator

Usage:
  github-analyser --repos owner/repo1,owner/repo2 [options]

Options:
  --repos    Comma-separated repos (owner/repo or full GitHub URLs)
  --days     Number of past days to analyze (default: ${DEFAULTS.days})
  --output   Output HTML filename (default: ${DEFAULTS.output})
  --token    GitHub Personal Access Token (default: GITHUB_TOKEN env var)
  --help     Show this help message

All flags are optional when defaults or environment variables are set.

Examples:
  github-analyser --repos facebook/react
  github-analyser --repos https://github.com/myorg/api
  github-analyser --repos myorg/api,myorg/web --days 14
  github-analyser --repos owner/repo --days 7 --output team-report.html
`;

/**
 * Normalizes a repo input — accepts owner/repo, full GitHub URLs,
 * or git@ SSH URLs and extracts the owner/repo portion.
 */
function normalizeRepo(input) {
  if (!input) return '';

  // Full HTTPS URL: https://github.com/owner/repo or https://github.com/owner/repo/
  const httpsMatch = input.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\/|\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  // SSH URL: git@github.com:owner/repo.git
  const sshMatch = input.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  // Already owner/repo
  return input;
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const { values } = parseArgs({
    args: argv,
    options: {
      repos: { type: 'string' },
      days: { type: 'string', default: String(DEFAULTS.days) },
      output: { type: 'string', default: DEFAULTS.output },
      token: { type: 'string' },
    },
    strict: true,
  });

  if (!values.repos) {
    console.error('Error: --repos is required. Use --help for usage information.');
    process.exit(1);
  }

  const days = parseInt(values.days, 10);
  if (isNaN(days) || days < 1) {
    console.error('Error: --days must be a positive integer.');
    process.exit(1);
  }

  const repos = values.repos
    .split(',')
    .map((r) => normalizeRepo(r.trim()))
    .filter(Boolean);

  for (const repo of repos) {
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      console.error(`Error: Invalid repo format "${repo}". Expected owner/repo or a GitHub URL.`);
      process.exit(1);
    }
  }

  const token = values.token || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(
      'Error: GitHub token required. Use --token or set GITHUB_TOKEN environment variable.'
    );
    process.exit(1);
  }

  return {
    repos,
    days,
    output: values.output,
    token,
  };
}
