# GitHub Analyser — Developer Scorecard Generator

A production-ready CLI tool that evaluates developers based on their GitHub contributions and generates a well-formatted HTML scorecard report with per-developer metrics, radar charts, and actionable insights.

## Features

- **Multi-repo analysis**: Analyze contributions across multiple repositories
- **11 measurable metrics**: Code quality, complexity, duplication, N+1 detection, readability, SOLID principles, and more
- **Beautiful HTML reports**: Dark-themed responsive UI with radar charts, score breakdowns, and leaderboards
- **GitHub API integration**: Analyzes commits, pull requests, reviews, and code patches
- **Private repo support**: Works with private repositories when given appropriate token permissions
- **Rate limit handling**: Automatic retry with backoff on API rate limits

## Requirements

- **Node.js >= 18**
- **GitHub Personal Access Token** with `repo` scope (for private repos) or `public_repo` scope

## Installation

```bash
git clone <repo-url> github-analyser
cd github-analyser
npm install
npm link            # registers the "github-analyser" command globally
```

## Usage

### Basic Usage

```bash
github-analyser --repos owner/repo
```

That's it — defaults to 30 days, outputs `report.html`, and reads your token from the `GITHUB_TOKEN` environment variable.

### Multiple Repositories

```bash
github-analyser --repos owner/repo1,owner/repo2
```

### Override Defaults

```bash
github-analyser --repos owner/repo --days 14 --output team-report.html
```

### Alternative (without `npm link`)

```bash
npm run analyse -- --repos owner/repo
```

### CLI Arguments

| Argument   | Required | Description                                    | Default            |
|------------|----------|------------------------------------------------|--------------------|
| `--repos`  | Yes      | Comma-separated repos in `owner/repo` format   | —                  |
| `--days`   | No       | Number of past days to analyze                 | `30`               |
| `--output` | No       | Output HTML filename                           | `report.html`      |
| `--token`  | No       | GitHub PAT                                     | `GITHUB_TOKEN` env |
| `--help`   | No       | Show help message                              | —                  |

### Examples

```bash
# Simplest — just point at a repo
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
github-analyser --repos facebook/react

# Multiple repos, custom window
github-analyser --repos myorg/api,myorg/frontend --days 14

# Everything explicit
github-analyser --repos owner/repo --days 7 --output weekly.html --token ghp_xxxxxxxxxxxx
```

## Scoring Model

Each metric is scored from **0 to 10**, and the final score is scaled to **0-100** using configurable weights.

### Metrics & Weights

| # | Metric                    | Weight | Description                                                        |
|---|---------------------------|--------|--------------------------------------------------------------------|
| 1 | Code Readability          | 14%    | Naming, nesting, style anti-patterns, comment density              |
| 2 | Cyclomatic Complexity     | 7%     | Decision points per function, dead code, promise chains            |
| 3 | Code Maintainability      | 15%    | File size, function length, doc coverage, tech debt, abstractions  |
| 4 | SOLID Principles          | 11%    | SRP, OCP, ISP, DIP violation detection                             |
| 5 | N+1 Query Detection       | 11%    | ORM/SQL/API queries inside loops                                   |
| 6 | PR Size Discipline        | 7%     | Average PR size, penalizes large PRs                               |
| 7 | PR Review Contribution    | 13%    | Review ratio and comment density (50/50)                           |
| 8 | Duplicate Code            | 14%    | Token-based duplicate block detection                              |
| 9 | Contributor Score         | 8%     | Lines changed ranked in 10 equal-width buckets across team         |

### Grading Scale

| Score  | Grade | Color  |
|--------|-------|--------|
| 90-100 | A+    | Green  |
| 80-89  | A     | Green  |
| 70-79  | B     | Blue   |
| 60-69  | C     | Yellow |
| 50-59  | D     | Orange |
| 0-49   | F     | Red    |

## HTML Report

The generated report includes:

- **Dashboard**: Repository list, time range, contributor count, average score, top performer
- **Leaderboard**: Ranked list of all contributors with score bars
- **Per-Developer Scorecards**:
  - Profile with GitHub link
  - Overall score with grade badge
  - Radar chart covering all 9 metrics
  - Metric breakdown table with visual bars
  - Strengths section
  - Improvement suggestions
  - N+1 query violations (with file names and code snippets)

## Project Structure

```
/
├── index.js                          # Main entry point
├── package.json
├── README.md
└── src/
    ├── cli/
    │   └── parser.js                 # CLI argument parsing
    ├── github/
    │   ├── client.js                 # Octokit client with rate limiting
    │   └── fetcher.js                # GitHub API data fetching
    ├── analysis/
    │   ├── complexity/index.js       # Cyclomatic complexity
    │   ├── duplication/index.js      # Duplicate code detection
    │   ├── nplusone/index.js         # N+1 query detection
    │   ├── readability/index.js      # Code readability
    │   ├── solid/index.js            # SOLID principles
    │   ├── pr-size/index.js          # PR size discipline
    │   ├── pr-review/index.js        # PR review quality
    │   └── maintainability/index.js  # Code maintainability (includes structural)
    ├── scoring/
    │   └── engine.js                 # Scoring engine with weights
    └── report/
        └── generator.js              # HTML report generator
```

## Performance

- Handles 5+ repositories
- Supports up to 50+ contributors
- 30-day analysis window
- Typical completion: 1-3 minutes (depending on repo size and API limits)
- Batched API calls with concurrency control

## Extending

To add a new metric:

1. Create a new analyzer in `src/analysis/<metric-name>/index.js`
2. Export an analysis function returning `{ score: number, details: object }`
3. Add the metric key to `DEFAULT_WEIGHTS` and `METRIC_LABELS` in `src/scoring/engine.js`
4. Wire it into the analysis loop in `index.js`
5. The report generator will automatically include it

## License

MIT
