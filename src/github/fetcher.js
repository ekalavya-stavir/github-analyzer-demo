import { paginate, request } from './client.js';

export async function fetchRepoData(owner, repo, sinceDate) {
  const since = sinceDate.toISOString();

  console.log(`  Fetching data for ${owner}/${repo}...`);

  const [commits, pullRequests] = await Promise.all([
    fetchCommits(owner, repo, since),
    fetchPullRequests(owner, repo, sinceDate),
  ]);

  console.log(`    ${commits.length} commits, ${pullRequests.length} PRs found`);

  const prDetails = await fetchPRDetails(owner, repo, pullRequests);

  return {
    owner,
    repo,
    commits,
    pullRequests: prDetails,
  };
}

async function fetchCommits(owner, repo, since) {
  try {
    const commits = await paginate('GET /repos/{owner}/{repo}/commits', {
      owner,
      repo,
      since,
      per_page: 100,
    });
    return commits.map((c) => ({
      sha: c.sha,
      message: c.commit?.message || '',
      author: c.author?.login || c.commit?.author?.name || 'unknown',
      authorAvatar: c.author?.avatar_url || '',
      date: c.commit?.author?.date || '',
      additions: c.stats?.additions || 0,
      deletions: c.stats?.deletions || 0,
    }));
  } catch (err) {
    console.warn(`    Warning: Could not fetch commits for ${owner}/${repo}: ${err.message}`);
    return [];
  }
}

async function fetchPullRequests(owner, repo, sinceDate) {
  try {
    const prs = await paginate('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    });
    return prs.filter((pr) => {
      const created = new Date(pr.created_at);
      const updated = new Date(pr.updated_at);
      return created >= sinceDate || updated >= sinceDate;
    });
  } catch (err) {
    console.warn(`    Warning: Could not fetch PRs for ${owner}/${repo}: ${err.message}`);
    return [];
  }
}

async function fetchPRDetails(owner, repo, pullRequests) {
  const results = [];
  const batchSize = 5;

  for (let i = 0; i < pullRequests.length; i += batchSize) {
    const batch = pullRequests.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (pr) => {
        try {
          const [files, reviews, reviewComments] = await Promise.all([
            fetchPRFiles(owner, repo, pr.number),
            fetchPRReviews(owner, repo, pr.number),
            fetchPRReviewComments(owner, repo, pr.number),
          ]);

          const totalAdditions = files.reduce((sum, f) => sum + (f.additions || 0), 0);
          const totalDeletions = files.reduce((sum, f) => sum + (f.deletions || 0), 0);

          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login || 'unknown',
            authorAvatar: pr.user?.avatar_url || '',
            state: pr.state,
            merged: pr.merged_at != null,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            mergedAt: pr.merged_at,
            additions: totalAdditions,
            deletions: totalDeletions,
            changedFiles: files.length,
            files,
            reviews,
            reviewComments,
            body: pr.body || '',
          };
        } catch (err) {
          console.warn(`    Warning: Could not fetch details for PR #${pr.number}: ${err.message}`);
          return null;
        }
      })
    );
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

async function fetchPRFiles(owner, repo, prNumber) {
  try {
    const files = await paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return files.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch || '',
    }));
  } catch {
    return [];
  }
}

async function fetchPRReviews(owner, repo, prNumber) {
  try {
    const reviews = await paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return reviews.map((r) => ({
      user: r.user?.login || 'unknown',
      state: r.state,
      body: r.body || '',
      submittedAt: r.submitted_at,
    }));
  } catch {
    return [];
  }
}

async function fetchPRReviewComments(owner, repo, prNumber) {
  try {
    const comments = await paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return comments.map((c) => ({
      user: c.user?.login || 'unknown',
      body: c.body || '',
      path: c.path || '',
      line: c.line || c.original_line || 0,
      createdAt: c.created_at,
    }));
  } catch {
    return [];
  }
}

export async function fetchCommitDetail(owner, repo, sha) {
  try {
    const { data } = await request('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner,
      repo,
      ref: sha,
    });
    return {
      sha: data.sha,
      files: (data.files || []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch || '',
      })),
      stats: data.stats || { additions: 0, deletions: 0, total: 0 },
    };
  } catch {
    return null;
  }
}
