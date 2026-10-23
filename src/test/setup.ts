import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest globals are disabled, so RTL's automatic cleanup is not registered for us.
afterEach(() => cleanup())

// jsdom does not implement matchMedia; the theme toggle and i18n rely on it.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

// jsdom does not implement dialog.showModal used by ConfirmDialog.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')) }
}
