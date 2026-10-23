import { mountClassification } from '../browser-prepare/classification-ui.js';

// Keep the admitted coordinator and its historical execution evidence immutable.
// Workspace objectives own restoration; an explicit plan import can replace them.
export function mountClassificationWorkspace({ document: doc = document }) {
  const document = new Proxy(doc, {
    get(target, key) {
      if (key === 'dispatchEvent')
        return (event) => {
          if (event.type === 'canopy-set-task-request') {
            if (!doc.getElementById('classification-import').files.length) return true;
            return doc.dispatchEvent(
              new CustomEvent(event.type, {
                detail: { ...event.detail, task_ref: 'task:species' },
              }),
            );
          }
          return doc.dispatchEvent(event);
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  mountClassification({ document });
}
