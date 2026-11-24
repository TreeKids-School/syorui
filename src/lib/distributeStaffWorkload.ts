export type StaffWorkItem = { id: string; days: number };

export function applyStaffDistribution(current: Record<string, string>, buckets: Record<string, {childIds: string[]}>, childrenWithoutWriting: string[]) {
  const next = {...current};
  for (const [staff, bucket] of Object.entries(buckets)) for (const child of bucket.childIds) next[child] = staff;
  for (const child of childrenWithoutWriting) delete next[child];
  return next;
}

/** 児童は分割せず、日数の差を優先して割り振る。2日以内なら列のまとまりを優先できる。 */
export function distributeStaffWorkload(items: StaffWorkItem[], staffIds: string[], groupAdjacent: boolean, previousAssignments: Record<string, string> = {}) {
  const buckets = Object.fromEntries(staffIds.map(id => [id, { childIds: [] as string[], totalDays: 0 }]));
  if (!staffIds.length || !items.length) return buckets;
  const weights = items.map(item => item.days);
  const total = weights.reduce((sum, days) => sum + days, 0);
  const hasHistory = items.some(item => staffIds.includes(previousAssignments[item.id]));
  const score = (assignment: number[]) => {
    const sums = staffIds.map(() => 0);
    assignment.forEach((staff, index) => { sums[staff] += weights[index]; });
    const range = Math.max(...sums) - Math.min(...sums);
    const variance = sums.reduce((sum, days) => sum + (days - total / staffIds.length) ** 2, 0);
    const boundaries = assignment.slice(1).reduce((sum, staff, index) => sum + Number(staff !== assignment[index]), 0);
    const repeats = assignment.reduce((sum, staff, index) => sum + Number(staffIds[staff] === previousAssignments[items[index].id]), 0);
    if (hasHistory) return groupAdjacent
      ? [Math.max(0, range - 2), repeats, boundaries, variance, range]
      : [Math.max(0, range - 2), repeats, range, variance, boundaries];
    return groupAdjacent ? [Math.max(0, range - 2), boundaries, variance] : [range, variance, boundaries];
  };
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 1e-8) return a[i] < b[i];
    }
    return false;
  };
  const sums = staffIds.map(() => 0);
  let assignment = items.map(() => 0);
  [...items.keys()].sort((a, b) => weights[b] - weights[a] || a - b).forEach(index => {
    const staff = sums.indexOf(Math.min(...sums));
    assignment[index] = staff;
    sums[staff] += weights[index];
  });
  if (groupAdjacent) {
    let running = 0;
    const adjacent = items.map(item => {
      const staff = Math.min(staffIds.length - 1, Math.floor((running + item.days / 2) / (total / staffIds.length)));
      running += item.days;
      return staff;
    });
    if (better(score(adjacent), score(assignment))) assignment = adjacent;
  }
  // スタッフ名だけを循環させれば、日数配分と列のまとまりを保って前月担当を避けられる。
  if (hasHistory) {
    const seed = [...assignment];
    for (let offset = 1; offset < staffIds.length; offset++) {
      const rotated = seed.map(staff => (staff + offset) % staffIds.length);
      if (better(score(rotated), score(assignment))) assignment = rotated;
    }
  }
  // 日数の多い児童の移動・交換を含め、全スタッフの差を見ながら改善する。
  for (let pass = 0; pass < 100; pass++) {
    let best = assignment;
    let bestScore = score(assignment);
    for (let i = 0; i < items.length; i++) {
      for (let staff = 0; staff < staffIds.length; staff++) {
        if (staff === assignment[i]) continue;
        const next = [...assignment]; next[i] = staff;
        const nextScore = score(next);
        if (better(nextScore, bestScore)) { best = next; bestScore = nextScore; }
      }
      for (let j = i + 1; j < items.length; j++) {
        if (assignment[i] === assignment[j]) continue;
        const next = [...assignment]; [next[i], next[j]] = [next[j], next[i]];
        const nextScore = score(next);
        if (better(nextScore, bestScore)) { best = next; bestScore = nextScore; }
      }
    }
    if (best === assignment) break;
    assignment = best;
  }
  assignment.forEach((staff, index) => {
    buckets[staffIds[staff]].childIds.push(items[index].id);
    buckets[staffIds[staff]].totalDays += items[index].days;
  });
  return buckets;
}
