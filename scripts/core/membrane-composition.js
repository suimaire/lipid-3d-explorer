/* The patch and closed cell share the same illustrative leaflet composition. */
export const OUTER_MIX = { PC: 17, SM: 11, PE: 8 };
export const INNER_MIX = { PE: 13, PC: 9, PS: 8, PI: 4, PIP2: 2 };

export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Largest-remainder allocation preserves the proportions at every density. */
export function expandMix(mix, total, rand) {
  const sum = Object.values(mix).reduce((a, b) => a + b, 0);
  const shares = Object.entries(mix).map(([id, n]) => ({ id, exact: n / sum * total }));
  shares.forEach((s) => { s.count = Math.floor(s.exact); });
  let left = total - shares.reduce((n, s) => n + s.count, 0);
  [...shares].sort((a, b) => (b.exact - b.count) - (a.exact - a.count))
    .forEach((s) => { if (left-- > 0) s.count++; });
  return shuffle(shares.flatMap((s) => Array(s.count).fill(s.id)), rand);
}
