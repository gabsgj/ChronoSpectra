import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import './index.css'
import App from './App.tsx'
import { shellChildRoutes } from './router/appRoutes.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: shellChildRoutes,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider
      router={router}
      future={{ v7_startTransition: true }}
    />
  </StrictMode>,
)
