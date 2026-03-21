/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
} from 'react'

import { useTrainingReports } from '../hooks/useTrainingReports'

const TRAINING_RUNTIME_POLL_MS = 15_000

type SharedTrainingReportsValue = ReturnType<typeof useTrainingReports>

const SharedTrainingReportsContext = createContext<SharedTrainingReportsValue | null>(
  null,
)

export const SharedTrainingReportsProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const trainingReports = useTrainingReports()
  const trainingRuntime = trainingReports.data?.runtime ?? null

  const refreshTrainingReports = useEffectEvent(() => {
    trainingReports.retry()
  })

  useEffect(() => {
    if (!trainingRuntime?.is_running) {
      return
    }

    const intervalId = window.setInterval(() => {
      refreshTrainingReports()
    }, TRAINING_RUNTIME_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [trainingRuntime?.is_running])

  return (
    <SharedTrainingReportsContext.Provider value={trainingReports}>
      {children}
    </SharedTrainingReportsContext.Provider>
  )
}

export const useSharedTrainingReports = () => {
  const context = useContext(SharedTrainingReportsContext)
  if (context === null) {
    throw new Error(
      'useSharedTrainingReports must be used inside SharedTrainingReportsProvider.',
    )
  }
  return context
}
