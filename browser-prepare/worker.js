/* Connect worker messages to the preparation controller. */
import { createPreparationController } from './controller.js';

const controller = createPreparationController({ scope: self, browser: navigator, cryptoProvider: crypto });
self.onmessage = controller.onmessage;
