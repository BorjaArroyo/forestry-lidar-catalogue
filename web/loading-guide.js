export function mountLoadingGuide({ document: doc = document, application }) {
  const panel = doc.getElementById('workspace-loading-guide');
  const code = doc.getElementById('loading-code');
  function render() {
    const species = application.selection.task.id === 'species';
    const joint = application.getExperiment().tasks.length > 1;
    panel.hidden =
      application.getState().view !== 'workbench' ||
      !['review', 'runs'].includes(application.getState().section);
    doc.getElementById('loading-install').textContent =
      'uv sync --frozen' + (species ? ' --extra classification' : '');
    code.textContent = `from canopy.loader import LoaderConfig, open_dataset

dataset = open_dataset(
    "./dataset",  # Extract the downloaded ZIP here.
    LoaderConfig(block_points=65536),
)
print(dataset.info)  # Available partitions, sources, fields and modalities.
dataset.validate()  # Checks the complete export before reading.
for block in dataset:
    xyz = block["arrays"]["xyz"]
    print(block["source_ref"], block["published_split"], xyz.shape)
    ${joint ? 'print(block["tree_arrays"]["species"], block["tree_arrays"]["species_valid"])\n    print(block["tree_arrays"]["leaf_group"], block["vocabularies"]["leaf_group"])' : species ? 'print(block["tree_id"], block["modality"], block["taxonomy"], block["reference_valid"])' : '# Supervised outputs also include instance and instance_valid.'}
`;
    doc.getElementById('loading-context').textContent = joint
      ? 'Instance and point-to-tree arrays have N rows. Tree labels and masks have T rows and remain plot-scoped when point blocks are sliced. Reference relationships are supervision, not default model inputs.'
      : species
        ? 'Blocks belong to sensor observations. Taxonomy and rank validity belong to the tree; paired sensors remain separate.'
        : 'Blocks retain source and scene identity. Instance and optional feature masks stay with their arrays.';
  }
  doc.getElementById('loading-copy').addEventListener('click', async () => {
    const status = doc.getElementById('loading-copy-status');
    try {
      await navigator.clipboard.writeText(code.textContent);
      status.textContent = 'Python example copied.';
    } catch {
      status.textContent = 'Copy is unavailable. Select the code or download the example.';
    }
  });
  for (const event of ['canopy-view', 'canopy-task-change', 'canopy-experiment-change'])
    doc.addEventListener(event, render);
  render();
}
