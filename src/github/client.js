import { Octokit } from 'octokit';

let octokitInstance = null;

export function initClient(token) {
  octokitInstance = new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Rate limit hit for ${options.method} ${options.url}`);
        if (retryCount < 3) {
          octokit.log.info(`Retrying after ${retryAfter} seconds...`);
          return true;
        }
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Secondary rate limit hit for ${options.method} ${options.url}`);
        return true;
      },
    },
  });
  return octokitInstance;
}

export function getClient() {
  if (!octokitInstance) {
    throw new Error('GitHub client not initialized. Call initClient(token) first.');
  }
  return octokitInstance;
}

export async function paginate(method, params) {
  const client = getClient();
  try {
    return await client.paginate(method, params);
  } catch (err) {
    if (err.status === 403 && err.message?.includes('rate limit')) {
      const resetTime = err.response?.headers?.['x-ratelimit-reset'];
      if (resetTime) {
        const waitMs = (parseInt(resetTime) * 1000) - Date.now() + 1000;
        if (waitMs > 0 && waitMs < 120000) {
          console.warn(`Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s...`);
          await new Promise((r) => setTimeout(r, waitMs));
          return await client.paginate(method, params);
        }
      }
    }
    throw err;
  }
}

export async function request(route, params) {
  const client = getClient();
  try {
    return await client.request(route, params);
  } catch (err) {
    if (err.status === 403 && err.message?.includes('rate limit')) {
      const resetTime = err.response?.headers?.['x-ratelimit-reset'];
      if (resetTime) {
        const waitMs = (parseInt(resetTime) * 1000) - Date.now() + 1000;
        if (waitMs > 0 && waitMs < 120000) {
          console.warn(`Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s...`);
          await new Promise((r) => setTimeout(r, waitMs));
          return await client.request(route, params);
        }
      }
    }
    throw err;
  }
}
