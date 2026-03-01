import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyBayesianSmoothing } from './engine.js';

function makeDev(finalScore, contributionSize) {
  return { login: `dev-${contributionSize}`, finalScore, contributionSize };
}

function makeTeam(entries) {
  return entries.map(([score, size]) => makeDev(score, size));
}

describe('applyBayesianSmoothing', () => {

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(applyBayesianSmoothing([]), []);
  });

  it('contribution_size = 0 returns prior_mean', () => {
    const devs = makeTeam([
      [90, 500],
      [70, 300],
      [100, 0],
    ]);
    const result = applyBayesianSmoothing(devs);
    const priorMean = (90 + 70 + 100) / 3;

    const zeroDev = result.find((d) => d.contributionSize === 0);
    assert.equal(zeroDev.finalScore, Math.round(priorMean * 10) / 10);
    assert.equal(zeroDev.rawScore, 100);
  });

  it('contribution_size << prior_weight stays close to org average', () => {
    const devs = makeTeam([
      [60, 1000],
      [50, 800],
      [40, 600],
      [95, 5],
    ]);
    const result = applyBayesianSmoothing(devs);
    const priorMean = (60 + 50 + 40 + 95) / 4;

    const smallDev = result.find((d) => d.contributionSize === 5);
    const diff = Math.abs(smallDev.finalScore - priorMean);
    assert.ok(diff < Math.abs(95 - priorMean), 'small contributor should be pulled toward mean');
  });

  it('contribution_size ≈ prior_weight gives blended score', () => {
    const devs = makeTeam([
      [80, 200],
      [60, 200],
      [90, 200],
    ]);
    const result = applyBayesianSmoothing(devs);
    const priorMean = (80 + 60 + 90) / 3;

    for (const dev of result) {
      const expected = (dev.rawScore * dev.contributionSize + priorMean * 200)
        / (dev.contributionSize + 200);
      assert.equal(dev.finalScore, Math.round(Math.max(0, Math.min(100, expected)) * 10) / 10);
    }
  });

  it('contribution_size >> prior_weight reflects true quality', () => {
    const devs = makeTeam([
      [50, 100],
      [50, 100],
      [95, 10000],
    ]);
    const result = applyBayesianSmoothing(devs);

    const largeDev = result.find((d) => d.contributionSize === 10000);
    assert.ok(
      Math.abs(largeDev.finalScore - 95) < 3,
      `large contributor score ${largeDev.finalScore} should be very close to raw 95`
    );
  });

  it('extreme quality_score = 0 stays within bounds', () => {
    const devs = makeTeam([
      [50, 200],
      [60, 200],
      [0, 200],
    ]);
    const result = applyBayesianSmoothing(devs);

    for (const dev of result) {
      assert.ok(dev.finalScore >= 0, `score ${dev.finalScore} should be >= 0`);
      assert.ok(dev.finalScore <= 100, `score ${dev.finalScore} should be <= 100`);
    }
  });

  it('extreme quality_score = 100 stays within bounds', () => {
    const devs = makeTeam([
      [50, 200],
      [60, 200],
      [100, 200],
    ]);
    const result = applyBayesianSmoothing(devs);

    for (const dev of result) {
      assert.ok(dev.finalScore >= 0, `score ${dev.finalScore} should be >= 0`);
      assert.ok(dev.finalScore <= 100, `score ${dev.finalScore} should be <= 100`);
    }
  });

  it('uses MIN_BASELINE_WEIGHT when median is very low', () => {
    const devs = makeTeam([
      [90, 2],
      [80, 3],
      [95, 1],
    ]);
    const result = applyBayesianSmoothing(devs);
    const priorMean = (90 + 80 + 95) / 3;

    for (const dev of result) {
      const expected = (dev.rawScore * dev.contributionSize + priorMean * 50)
        / (dev.contributionSize + 50);
      assert.equal(
        dev.finalScore,
        Math.round(Math.max(0, Math.min(100, expected)) * 10) / 10,
        `MIN_BASELINE_WEIGHT=50 should be used instead of median=2`
      );
    }
  });

  it('preserves rawScore on each developer', () => {
    const devs = makeTeam([
      [85, 300],
      [65, 100],
    ]);
    const result = applyBayesianSmoothing(devs);

    assert.equal(result[0].rawScore, 85);
    assert.equal(result[1].rawScore, 65);
  });

  it('single developer returns prior_mean (smoothed toward self)', () => {
    const devs = makeTeam([[75, 200]]);
    const result = applyBayesianSmoothing(devs);
    assert.equal(result[0].finalScore, 75);
    assert.equal(result[0].rawScore, 75);
  });
});
