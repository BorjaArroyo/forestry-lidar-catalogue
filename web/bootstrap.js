import { mountCatalog } from './catalog/app.js';
import { createTaskSelection } from './catalog/task-selection.js';
import { mountModelView } from './catalog/model-view.js';
import { mountWorkbench } from './workbench/workbench.js';
import { createServiceClient } from './workbench/client.js';
import { mountPreparation } from '../browser-prepare/ui.js';

const catalog = window.LIDAR_CATALOG;
if (!catalog) {
  document.querySelector('main').textContent =
    'Catalog unavailable. Rebuild catalog.js using the documented command.';
} else {
  const selection = createTaskSelection(catalog);
  const localService =
    !window.CANOPY_PUBLIC && ['127.0.0.1', 'localhost'].includes(location.hostname);
  const client = createServiceClient({ fetch: window.fetch.bind(window), enabled: localService });
  const application = mountCatalog({ catalog, document, selection });
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
    getTaskRequest: application.getTaskRequest,
    selection,
  });
  mountPreparation({ catalog, document, selection });
}
