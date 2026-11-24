export type AdoptionCandidate = { day: number; individual: boolean; score: number };
type Candidate = AdoptionCandidate;
export type AdoptionShortagePolicy = 'partial' | 'relax-gap' | 'allow-consecutive' | 'keep';
type Selection = { days: number[]; score: number };

// 日付順の動的計画法で、間隔を厳守しつつ採用可能な日数を最大化する。
export const selectSpacedAdoptionDays = (candidates: Candidate[], target: number, minimumGap: number, minimizeConsecutive = false): number[] => {
  if (!Number.isInteger(minimumGap) || minimumGap < 1 || minimumGap > 31) throw new Error('間隔は1〜31日の整数で指定してください。');
  const sorted = [...candidates].sort((a, b) => a.day - b.day);
  const limit = Math.max(0, Math.min(6, Math.floor(target)));
  const paths: (Selection | undefined)[][] = Array.from({ length: limit + 1 }, () => []);
  const weight = (candidate: Candidate) => (candidate.individual ? 1_000_000 : 0) + candidate.score * 0.3;
  for (let count = 1; count <= limit; count++) {
    for (let last = 0; last < sorted.length; last++) {
      const candidate = sorted[last];
      if (count === 1) {
        paths[count][last] = { days: [candidate.day], score: weight(candidate) };
        continue;
      }
      for (let previous = 0; previous < last; previous++) {
        const prefix = paths[count - 1][previous];
        const gap = candidate.day - sorted[previous].day;
        if (!prefix || gap < minimumGap) continue;
        // 最大6日分の個別優先スコアより大きく減点し、連日の組数を最小にする。
        const consecutivePenalty = minimizeConsecutive && gap === 1 ? 100_000_000 : 0;
        const score = prefix.score + weight(candidate) + Math.log2(gap) * 150 - consecutivePenalty;
        if (!paths[count][last] || score > paths[count][last]!.score) {
          paths[count][last] = { days: [...prefix.days, candidate.day], score };
        }
      }
    }
  }
  for (let count = limit; count > 0; count--) {
    const best = paths[count].reduce<Selection | undefined>((best, path) => path && (!best || path.score > best.score) ? path : best, undefined);
    if (best) return best.days;
  }
  return [];
};

export const resolveAdoptionShortage = (options: {
  candidates: Candidate[]; target: number; initialDays: number[]; existingDays: number[];
  policy: AdoptionShortagePolicy; minimumGap?: number; relaxedMinimumGap: number;
}) => {
  const { candidates, target, initialDays, existingDays, policy } = options;
  if (initialDays.length >= target || policy === 'partial') return { days: initialDays, kept: false, gap: options.minimumGap };
  if (policy === 'keep') return { days: [...existingDays], kept: true, gap: options.minimumGap };
  const startingGap = options.minimumGap ?? 1;
  if (policy === 'allow-consecutive') {
    // まず連日なしで補い、それでも不足するときだけ連日を最小限許可する。
    for (let gap = Math.max(2, startingGap - 1); gap >= 2; gap--) {
      const days = selectSpacedAdoptionDays(candidates, target, gap);
      if (days.length >= target) return { days, kept: false, gap };
    }
    return { days: selectSpacedAdoptionDays(candidates, target, 1, true), kept: false, gap: 1 };
  }
  for (let gap = startingGap - 1; gap >= options.relaxedMinimumGap; gap--) {
    const days = selectSpacedAdoptionDays(candidates, target, gap);
    if (days.length >= target) return { days, kept: false, gap };
  }
  const gap = Math.min(startingGap, options.relaxedMinimumGap);
  return { days: selectSpacedAdoptionDays(candidates, target, gap), kept: false, gap };
};
