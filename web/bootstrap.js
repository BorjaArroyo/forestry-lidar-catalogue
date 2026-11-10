import { mountCatalog } from './catalog/app.js?v=joint-v1';
import { createTaskSelection } from './catalog/task-selection.js?v=joint-v1';
import { mountModelView } from './catalog/model-view.js';
import { mountWorkbench } from './workbench/workbench.js';
import { createServiceClient } from './workbench/client.js';
import { mountClassificationWorkspace } from './classification-workspace.js';
import { mountPreparation } from '../browser-prepare/ui.js';
import { mountWorkspace } from './workspace.js?v=joint-v1';
import { mountJointWorkspace } from './joint-workspace.js';
import { mountLoadingGuide } from './loading-guide.js';

const catalog = window.LIDAR_CATALOG;
if (!catalog) {
  document.querySelector('main').textContent =
    'Catalog unavailable. Rebuild catalog.js using the documented command.';
} else {
  let jointSource = null;
  try {
    const response = await fetch(new URL('../data/joint/source-lock.json', import.meta.url), {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Joint scope unavailable');
    const bytes = await response.arrayBuffer();
    const manifestResponse = await fetch(new URL('../publication-manifest.json', import.meta.url), {
      signal: AbortSignal.timeout(10000),
    });
    if (!manifestResponse.ok) throw Error('Publication manifest unavailable');
    const manifest = await manifestResponse.json();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if (manifest.files['data/joint/source-lock.json'] !== hash) throw Error('Joint scope changed');
    const source = JSON.parse(new TextDecoder().decode(bytes));
    jointSource = source;
  } catch {
    jointSource = null;
  }
  const selection = createTaskSelection(
    catalog,
    new URLSearchParams(location.search).get('task') === 'species' ? 'species' : 'instances',
  );
  const instanceSelection = createTaskSelection(catalog);
  const localService =
    !window.CANOPY_PUBLIC && ['127.0.0.1', 'localhost'].includes(location.hostname);
  const client = createServiceClient({ fetch: window.fetch.bind(window), enabled: localService });
  const application = mountCatalog({ catalog, document, selection, jointSource });
  const modelView = mountModelView({ document, fetch: window.fetch.bind(window) });
  document.addEventListener('canopy-view', (event) => {
    if (event.detail.view === 'model') modelView.open();
  });
  if (location.hash === '#model') modelView.open();
  mountWorkbench({
    catalog,
    document,
    client,
    localService,
    getTaskRequest: () =>
      application.getTaskRequest().task_ref === 'task:species'
        ? instanceSelection.normalize()
        : application.getTaskRequest(),
    selection: instanceSelection,
  });
  mountPreparation({
    catalog,
    document,
    selection: instanceSelection,
    initialRequest:
      application.selection.task.id === 'instances' ? application.getTaskRequest() : null,
  });
  mountClassificationWorkspace({ document });
  const jointWorkspace = mountJointWorkspace({ application, document });
  mountWorkspace({ application, document, jointWorkspace });
  mountLoadingGuide({ application, document });
}

/* Set after every mount: e2e interactions wait for this marker because native
   control events dispatched before the module graph runs are silently lost. */
document.documentElement.dataset.canopyReady = 'true';
