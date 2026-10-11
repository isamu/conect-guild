/** Whether the page is shown, and a way to hear when that changes. */
export interface PageVisibility {
  isHidden(): boolean;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** The document's visibility. The canvas and the message queue both stop on it. */
export const documentVisibility: PageVisibility = {
  isHidden: () => document.visibilityState === 'hidden',
  subscribe(listener) {
    document.addEventListener('visibilitychange', listener);
    return () => {
      document.removeEventListener('visibilitychange', listener);
    };
  },
};
