/**
 * SOLID Principles Analyzer (Heuristic-based)
 *
 * Detects violations of SOLID principles:
 * - S: Large classes/modules (Single Responsibility violation)
 * - O: Hardcoded type checks (Open/Closed violation)
 * - L: (Limited detection via type checking patterns)
 * - I: Large interfaces/parameter lists (Interface Segregation)
 * - D: Direct instantiation / tight coupling (Dependency Inversion)
 *
 * Score: 0-10 (10 = best adherence to SOLID)
 */

const CODE_FILE_EXTENSIONS = /\.(js|jsx|ts|tsx|py|java|go|cs|php|rb|kt|swift)$/;

const SRP_INDICATORS = [
  { pattern: /\bclass\b/g, name: 'class-declaration' },
  { pattern: /\bexport\s+(default\s+)?class\b/g, name: 'exported-class' },
];

const GOD_CLASS_PATTERNS = [
  { pattern: /\bManager\b/g, weight: 0.5, name: 'god-class-manager' },
  { pattern: /\bHandler\b/g, weight: 0.3, name: 'god-class-handler' },
  { pattern: /\bController\b.*\bService\b|\bService\b.*\bController\b/g, weight: 0.8, name: 'mixed-concerns' },
  { pattern: /\bUtils?\b/g, weight: 0.3, name: 'util-class' },
  { pattern: /\bHelper\b/g, weight: 0.3, name: 'helper-class' },
];

const OCP_VIOLATIONS = [
  { pattern: /\binstanceof\b/g, weight: 0.5, name: 'instanceof-check' },
  { pattern: /\btypeof\s+\w+\s*===?\s*['"][^'"]+['"]/g, weight: 0.3, name: 'typeof-check' },
  { pattern: /switch\s*\(\s*\w+\.type\b/g, weight: 0.8, name: 'type-switch' },
  { pattern: /if\s*\(\s*\w+\.type\s*===?/g, weight: 0.6, name: 'type-if-check' },
];

const DIP_VIOLATIONS = [
  { pattern: /\bnew\s+[A-Z]\w+\s*\(/g, weight: 0.3, name: 'direct-instantiation' },
  { pattern: /require\s*\(['"]\.{1,2}\//g, weight: 0.1, name: 'relative-require' },
  { pattern: /import\s+.*from\s+['"]\.{1,2}\//g, weight: 0.05, name: 'relative-import' },
];

const ISP_VIOLATIONS = [
  { pattern: /function\s*\([^)]{100,}\)/g, weight: 1, name: 'long-param-list' },
  { pattern: /\(\s*\{[^}]{120,}\}\s*\)/g, weight: 0.8, name: 'large-destructured-param' },
];

const COUPLING_PATTERNS = [
  { pattern: /\bglobal\b|\bwindow\b|\bprocess\.env\b/g, weight: 0.5, name: 'global-access' },
  // Detects chains like $obj->foo->bar->baz or obj.foo.bar.baz
  // Must strip quoted strings before matching to avoid false positives
  // on config keys like config('a.b.c.d.e')
  { pattern: /\.\w+\.\w+\.\w+\.\w+/g, weight: 0.4, name: 'deep-property-chain', stripQuotes: true },
];

export function analyzeSolid(patches) {
  if (!patches || patches.length === 0) {
    return { score: 5, details: { evidence: [{ file: 'Summary', line: 0, snippet: 'No patches available for analysis', issue: 'no-data' }] } };
  }

  const codePatches = patches.filter((p) => CODE_FILE_EXTENSIONS.test(p.filename));
  if (codePatches.length === 0) {
    return { score: 5, details: { note: 'No code files', evidence: [{ file: 'Summary', line: 0, snippet: `${patches.length} files analyzed, none are code files`, issue: 'no-code-files' }] } };
  }

  let totalLines = 0;
  let srpViolations = 0;
  let ocpViolations = 0;
  let ispViolations = 0;
  let dipViolations = 0;
  let couplingViolations = 0;
  let godClassIndicators = 0;
  const violationDetails = [];
  const evidence = [];

  for (const file of codePatches) {
    const addedLines = extractAddedLines(file.patch);
    totalLines += addedLines.length;
    const code = addedLines.join('\n');

    let fileMethodCount = 0;
    const methodPattern = /\b(function|async\s+function|\w+\s*\(.*\)\s*\{|=>\s*\{)/g;
    const methodMatches = code.match(methodPattern);
    if (methodMatches) fileMethodCount = methodMatches.length;

    if (fileMethodCount > 15) {
      srpViolations++;
      violationDetails.push({ type: 'SRP', file: file.filename, detail: `${fileMethodCount} methods in single file` });
      evidence.push({ file: file.filename, repo: file.repo, line: 1, snippet: `${fileMethodCount} methods in single file`, issue: 'SRP-too-many-methods' });
    }

    if (addedLines.length > 300) {
      srpViolations++;
      violationDetails.push({ type: 'SRP', file: file.filename, detail: `Large file: ${addedLines.length} lines added` });
      evidence.push({ file: file.filename, repo: file.repo, line: 1, snippet: `Large file: ${addedLines.length} lines added`, issue: 'SRP-large-file' });
    }

    for (let lineIndex = 0; lineIndex < addedLines.length; lineIndex++) {
      const line = addedLines[lineIndex];

      for (const pattern of GOD_CLASS_PATTERNS) {
        const matches = line.match(pattern.pattern);
        if (matches) {
          godClassIndicators += matches.length * pattern.weight;
          evidence.push({ file: file.filename, repo: file.repo, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: pattern.name });
        }
      }

      for (const pattern of OCP_VIOLATIONS) {
        const matches = line.match(pattern.pattern);
        if (matches) {
          ocpViolations += matches.length;
          evidence.push({ file: file.filename, repo: file.repo, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: pattern.name });
        }
      }

      for (const pattern of ISP_VIOLATIONS) {
        const matches = line.match(pattern.pattern);
        if (matches) {
          ispViolations += matches.length * pattern.weight;
          evidence.push({ file: file.filename, repo: file.repo, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: pattern.name });
        }
      }

      for (const pattern of DIP_VIOLATIONS) {
        const matches = line.match(pattern.pattern);
        if (matches) {
          dipViolations += matches.length * pattern.weight;
          evidence.push({ file: file.filename, repo: file.repo, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: pattern.name });
        }
      }

      for (const pattern of COUPLING_PATTERNS) {
        // Strip quoted strings to avoid false positives on config keys like config('a.b.c.d')
        const testLine = pattern.stripQuotes
          ? line.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '')
          : line;
        const matches = testLine.match(pattern.pattern);
        if (matches) {
          couplingViolations += matches.length * pattern.weight;
          evidence.push({ file: file.filename, repo: file.repo, line: lineIndex + 1, snippet: line.trim().substring(0, 120), issue: pattern.name });
        }
      }
    }
  }

  // Insufficient data: too few lines to meaningfully evaluate SOLID adherence
  if (totalLines < 10) {
    return {
      score: 5,
      details: {
        srpViolations: 0,
        ocpViolations: 0,
        ispViolations: 0,
        dipViolations: 0,
        couplingViolations: 0,
        godClassIndicators: 0,
        violationRate: 0,
        topViolations: [],
        linesAnalyzed: totalLines,
        evidence: [
          { file: 'Summary', line: 0, snippet: `Only ${totalLines} lines analyzed — insufficient data for SOLID evaluation`, issue: 'insufficient-data' },
        ],
      },
    };
  }

  const totalViolationWeight =
    srpViolations * 2 +
    ocpViolations * 1.5 +
    ispViolations * 1 +
    dipViolations * 0.5 +
    couplingViolations * 1 +
    godClassIndicators * 1.5;

  const violationRate = totalLines > 0 ? totalViolationWeight / totalLines : 0;

  // Continuous rate-based scoring using violations per KLOC.
  // This is deterministic and consistent across sessions — same code always
  // produces the same score regardless of teammates.
  // 0 /KLOC → 10, 3/KLOC → 7, 5/KLOC → 5, 8/KLOC → 2, 9+/KLOC → 1
  const violationsPerKLOC = violationRate * 1000;
  const score = Math.max(1, Math.round((10 - violationsPerKLOC) * 10) / 10);

  return {
    score: Math.round(score * 10) / 10,
    details: {
      srpViolations,
      ocpViolations,
      ispViolations: Math.round(ispViolations * 10) / 10,
      dipViolations: Math.round(dipViolations * 10) / 10,
      couplingViolations: Math.round(couplingViolations * 10) / 10,
      godClassIndicators: Math.round(godClassIndicators * 10) / 10,
      violationRate: Math.round(violationRate * 1000) / 1000,
      topViolations: violationDetails.slice(0, 10),
      linesAnalyzed: totalLines,
      evidence: [
        { file: 'Summary', line: 0, snippet: `${totalLines} lines analyzed — SRP: ${srpViolations}, OCP: ${ocpViolations}, ISP: ${Math.round(ispViolations)}, DIP: ${Math.round(dipViolations)}, coupling: ${Math.round(couplingViolations)}, god-class: ${Math.round(godClassIndicators * 10) / 10}`, issue: 'overview' },
        ...evidence,
      ].slice(0, 15),
    },
  };
}

function extractAddedLines(patch) {
  if (!patch) return [];
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.substring(1));
}
