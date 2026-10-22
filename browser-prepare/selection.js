/* Pure selection rules; execution independently checks the pinned source and task. */
export function selectPlots(plots, paths) {
  if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length)
    throw Error('Choose a nonempty selection without duplicate plots');
  const byPath = new Map(plots.map((plot) => [plot.path, plot]));
  return paths.map((path) => {
    if (!byPath.has(path)) throw Error('Selection contains a plot outside the reviewed source');
    return byPath.get(path);
  });
}
export function datasetPlots(plots, allowed, collections, partitions) {
  return plots.filter(
    (p) =>
      allowed.includes(p.published_split) &&
      collections.includes(p.collection) &&
      partitions.includes(p.published_split),
  );
}
