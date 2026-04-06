const DB_NAME = "slashfigure";
const STORE_NAME = "autosave";
const KEY = "current_project";
const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Autosave to IndexedDB with debounce.
 * Saves 1.5 seconds after the last change -- drag operations
 * don't trigger writes until the user stops.
 */
export class AutoSave {
  private database: IDBDatabase | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled: boolean = true;
  onSaved: (() => void) | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        this.database = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /** Schedule a save. Resets the debounce timer on each call.
   *  Accepts a lazy getter so serialization only runs when the debounce fires. */
  scheduleSave(getData: (() => object) | object): void {
    if (!this.enabled || !this.database) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const data = typeof getData === "function" ? getData() : getData;
      this.writeToDB(data);
      this.debounceTimer = null;
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /** Force an immediate save (e.g. on page unload) */
  saveNow(data: object): void {
    if (!this.enabled || !this.database) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.writeToDB(data);
  }

  /** Load the last autosaved project, or null if none exists */
  async load(): Promise<object | null> {
    if (!this.database) return null;

    return new Promise((resolve) => {
      const transaction = this.database!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private writeToDB(data: object): void {
    if (!this.database) return;
    const transaction = this.database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(data, KEY);
    transaction.oncomplete = () => { this.onSaved?.(); };
  }
}
