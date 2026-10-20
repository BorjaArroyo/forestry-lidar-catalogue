import {emptyDraft, readDraft, addSubset, reviewDraft, sameRequest} from './dataset-draft.js';

const storageKey = 'canopy-dataset-draft-v1';
export class DraftPanel {
  constructor({document, storage, normalize, getRequest, setRequest, context, sourceName, onChange, isRunning}) {
    Object.assign(this, {document, normalize, getRequest, setRequest, context, sourceName, onChange, isRunning});
    this.draft = emptyDraft(getRequest());
    this.notice = ''; this.loadError = ''; this.storageError = '';
    try {
      this.storage = storage();
      const saved = this.storage.getItem(storageKey);
      if (saved) this.draft = readDraft(saved, normalize);
    } catch (error) {
      if (this.storage) this.loadError = 'Saved dataset could not be read. Clear it to start again: ' + error.message;
      else this.storageError = 'Browser storage is unavailable; this selection only lasts while the page stays open.';
    }
    this.element('dataset-draft-clear').onclick = () => {
      if (isRunning()) return;
      this.draft = emptyDraft(getRequest()); this.loadError = ''; this.notice = 'Dataset selection cleared.';
      this.save(); onChange();
    };
    this.element('dataset-draft-restore').onclick = () => {
      if (isRunning()) return;
      try { setRequest(this.draft.request); this.notice = 'Saved requirements restored.'; }
      catch (error) { this.notice = error.message; }
      onChange();
    };
  }
  element(id) { return this.document.getElementById(id); }
  get hasSubsets() { return this.draft.subsets.length > 0; }
  get blockedStorage() { return Boolean(this.loadError); }
  restoreRequest() {
    if (this.hasSubsets && !this.loadError) this.setRequest(this.draft.request);
  }
  review() {
    if (this.loadError) return {status: 'blocked', error: this.loadError};
    try { return reviewDraft(this.draft, {request: this.getRequest(), ...this.context()}); }
    catch (error) { return {status: 'blocked', error: error.message}; }
  }
  save() {
    try {
      if (this.hasSubsets) this.storage.setItem(storageKey, JSON.stringify(this.draft));
      else this.storage?.removeItem(storageKey);
      this.storageError = '';
    } catch { this.storageError = 'Could not save in this browser; keep the page open to retain this selection.'; }
  }
  add(subset) {
    if (this.isRunning() || this.loadError) return;
    try {
      this.draft = addSubset(this.draft, this.getRequest(), subset);
      this.notice = 'Subset added. Only saved subsets are included when preparing My dataset.';
      this.save();
    } catch (error) { this.notice = error.message; }
    this.onChange();
  }
  remove(index) {
    if (this.isRunning()) return;
    this.draft = {...this.draft, subsets: this.draft.subsets.filter((_,i) => i !== index)};
    if (!this.hasSubsets) this.draft = emptyDraft(this.getRequest());
    this.notice = 'Subset removed.'; this.save(); this.onChange();
  }
  render(running) {
    const review = this.review(), list = this.element('dataset-draft-list');
    list.replaceChildren();
    for (const [index, subset] of this.draft.subsets.entries()) {
      const row = this.document.createElement('li');
      const label = this.document.createElement('span');
      label.textContent = `${this.sourceName(subset.record_id)} · ${subset.collections.join(', ')} · ${subset.partitions.join(', ')} · ${subset.paths.length} plots`;
      const button = this.document.createElement('button');
      button.className = 'button small'; button.textContent = `Remove subset ${index + 1}`;
      button.disabled = running; button.onclick = () => this.remove(index);
      row.append(label, button); list.append(row);
    }
    this.element('dataset-draft-summary').textContent = review.status === 'ready' ?
      `${this.draft.subsets.length} subsets · ${review.paths.length} unique plots · ${review.points.toLocaleString()} points · ${(review.bytes / 1048576).toFixed(1)} MiB source LAS. ${review.overlaps} overlapping plot selections will be retrieved once.` :
      this.hasSubsets ? `${this.draft.subsets.length} saved subsets · ${review.error}` :
      'No saved subsets yet. Add a selection above, then choose another collection or partition.';
    this.element('dataset-draft-status').textContent = [this.loadError || this.notice, this.storageError].filter(Boolean).join(' ');
    this.element('dataset-draft-clear').disabled = running || (!this.hasSubsets && !this.loadError);
    const restore = this.element('dataset-draft-restore');
    restore.hidden = !this.hasSubsets || sameRequest(this.draft.request, this.getRequest());
    restore.disabled = running;
    return review;
  }
}
