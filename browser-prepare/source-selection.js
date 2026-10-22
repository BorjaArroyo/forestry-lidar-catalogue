import { datasetPlots } from './selection.js';

export function renderPlotOptions({ document, plots, allowed, profile, resetFilters = true }) {
  const $ = (id) => document.getElementById(id);
  const selectedValues = (id) =>
    [...$(id).options].filter((option) => option.selected).map((option) => option.value);
  function options(id, values) {
    $(id).replaceChildren();
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      option.selected = true;
      $(id).append(option);
    }
  }
  if (resetFilters) {
    options('prepare-collections', [...new Set(plots.map((p) => p.collection))].sort());
    options(
      'prepare-partitions',
      [...new Set(plots.map((p) => p.published_split))].filter((p) => allowed.includes(p)).sort(),
    );
  }
  $('prepare-plot').replaceChildren();
  const chosen = datasetPlots(
    plots,
    allowed,
    selectedValues('prepare-collections'),
    selectedValues('prepare-partitions'),
  );
  for (const plot of chosen) {
    const option = document.createElement('option');
    option.value = plot.path;
    option.selected = true;
    option.textContent = `${profile.plotLabel(plot.path)} · ${plot.published_split} · ${(plot.size_bytes / 1048576).toFixed(1)} MiB`;
    $('prepare-plot').append(option);
  }
}
