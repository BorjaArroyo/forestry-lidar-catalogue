// In-memory OPFS boundary with real truncation, close and missing-file behavior.
export class MemoryDirectory {
  kind = 'directory';
  children = new Map();
  constructor(name = '') {
    this.name = name;
  }
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.children.has(name) && create) this.children.set(name, new MemoryDirectory(name));
    const value = this.children.get(name);
    if (!value) throw new DOMException('Missing ' + name, 'NotFoundError');
    if (value.kind !== 'directory') throw Error('Expected directory');
    return value;
  }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.children.has(name) && create) this.children.set(name, new MemoryFile(name));
    const value = this.children.get(name);
    if (!value) throw new DOMException('Missing ' + name, 'NotFoundError');
    if (value.kind !== 'file') throw Error('Expected file');
    return value;
  }
  async removeEntry(name) {
    if (!this.children.delete(name)) throw new DOMException('Missing ' + name, 'NotFoundError');
  }
  async *entries() {
    yield* this.children;
  }
  async *values() {
    yield* this.children.values();
  }
}
class MemoryFile {
  kind = 'file';
  bytes = new Uint8Array();
  constructor(name) {
    this.name = name;
  }
  async getFile() {
    return new File([this.bytes], this.name);
  }
  async createSyncAccessHandle() {
    return {
      truncate: (size) => {
        this.bytes = this.bytes.slice(0, size);
      },
      flush() {},
      close() {},
      write: (bytes, { at }) => {
        const next = new Uint8Array(Math.max(this.bytes.length, at + bytes.length));
        next.set(this.bytes);
        next.set(bytes, at);
        this.bytes = next;
        return bytes.length;
      },
    };
  }
}
