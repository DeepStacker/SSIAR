import React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] p-8">
          <Card className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
            <div className="rounded-full bg-red-50 p-3 dark:bg-red-900/20">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error.message || 'An unexpected error occurred'}
            </p>
            <Button
              variant="default"
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload Page
            </Button>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}
