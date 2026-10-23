import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { I18nProvider } from './contexts/I18nContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { ConnectionGate } from './components/ConnectionGate'
import './index.css'

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="top-center" richColors theme={theme} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConnectionGate>
        <BrowserRouter>
          <I18nProvider>
            <AuthProvider>
              <App />
              <ThemedToaster />
            </AuthProvider>
          </I18nProvider>
        </BrowserRouter>
      </ConnectionGate>
    </ThemeProvider>
  </React.StrictMode>
)
