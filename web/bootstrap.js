import { mountCatalog } from './catalog/app.js';
import { mountWorkbench } from './workbench/workbench.js';

const catalog = window.LIDAR_CATALOG;
if (!catalog) {
  document.querySelector('main').textContent =
    'Catalog unavailable. Rebuild catalog.js using the documented command.';
} else {
  const application = mountCatalog({ catalog, document });
  mountWorkbench({
    catalog,
    document,
    getTaskRequest: application.getTaskRequest,
    selection: application.selection,
  });
}
