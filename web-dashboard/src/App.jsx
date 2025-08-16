import React, { useState, useEffect } from 'react'
import FileUpload from './components/FileUpload'
import ProgressBar from './components/ProgressBar'
import AnalysisResults from './components/AnalysisResults'
import apiService from './services/api'
import './App.css'

function App() {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [analysisResults, setAnalysisResults] = useState(null)
  const [error, setError] = useState(null)
  const [isComplete, setIsComplete] = useState(false)
  const [analysisId, setAnalysisId] = useState(null)

  useEffect(() => {
    // Test API connection on app start
    testApiConnection()
  }, [])

  const testApiConnection = async () => {
    try {
      const health = await apiService.healthCheck()
      console.log('API Health Check:', health)
    } catch (error) {
      console.error('API connection failed:', error)
    }
  }

  const handleFileUploaded = async (file) => {
    setIsUploading(true)
    setProgress(0)
    setStage('Uploading file...')
    setError(null)
    setAnalysisResults(null)
    setIsComplete(false)

    try {
      // Connect WebSocket for real-time updates FIRST
      const socket = apiService.connectWebSocket({
        onConnect: () => {
          console.log('WebSocket connected, ready for analysis updates')
        },
        onSubscribed: (data) => {
          console.log('Subscribed to analysis updates:', data)
          setStage('Connected to real-time updates...')
        },
        onProgress: (data) => {
          console.log('Progress update:', data)
          setProgress(data.progress || 0)
          setStage(data.stage || 'Processing...')
        },
        onComplete: (data) => {
          console.log('Analysis complete:', data)
          setAnalysisResults(data.result)
          setIsComplete(true)
          setIsUploading(false)
          setProgress(100)
          setStage('Analysis complete!')
        },
        onError: (data) => {
          console.error('WebSocket error:', data)
          setError(data.message || data.error || 'Analysis failed')
          setIsUploading(false)
          setStage('')
        }
      })

      // Wait a moment for WebSocket to connect
      await new Promise(resolve => setTimeout(resolve, 100))
      
      setProgress(2)
      setStage('Connecting to analysis engine...')

      // Upload file and get immediate response with analysisId
      const response = await apiService.uploadFile(file)
      console.log('Upload response:', response)
      
      if (!response.analysisId) {
        throw new Error('No analysis ID received')
      }

      setAnalysisId(response.analysisId)
      setProgress(5)
      setStage('Subscribing to real-time updates...')
      
      // Join analysis room for real-time updates
      const subscribed = apiService.joinAnalysis(response.analysisId)
      if (!subscribed) {
        console.warn('Failed to subscribe to WebSocket room')
        setStage('WebSocket subscription failed, analysis may continue without updates...')
      }
      
      // The analysis is now running in the background
      // Progress updates will come through WebSocket events
      
    } catch (error) {
      console.error('Upload error:', error)
      setError(error.message)
      setIsUploading(false)
      setStage('')
    }
  }

  const handleExport = async (format) => {
    if (!analysisId) return

    try {
      const exportData = await apiService.exportAnalysis(analysisId, format)
      
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        })
        downloadBlob(blob, `analysis_${analysisId}.json`)
      } else {
        // For CSV and PDF, the API should return the appropriate data
        const blob = new Blob([exportData], { 
          type: format === 'csv' ? 'text/csv' : 'application/pdf' 
        })
        downloadBlob(blob, `analysis_${analysisId}.${format}`)
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed: ' + error.message)
    }
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const resetAnalysis = () => {
    setIsUploading(false)
    setProgress(0)
    setStage('')
    setAnalysisResults(null)
    setError(null)
    setIsComplete(false)
    setAnalysisId(null)
    apiService.disconnectWebSocket()
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>G-Code Analyzer</h1>
        <p>Advanced analysis and optimization for 3D printing G-code files</p>
      </header>

      <main className="App-main">
        {!analysisResults && !isUploading && !error && (
          <FileUpload 
            onFileUploaded={handleFileUploaded}
            isUploading={isUploading}
          />
        )}

        {(isUploading || progress > 0 || error) && (
          <ProgressBar
            progress={progress}
            stage={stage}
            isComplete={isComplete}
            hasError={!!error}
            errorMessage={error}
          />
        )}

        {error && (
          <div className="error-actions">
            <button onClick={resetAnalysis} className="retry-btn">
              Try Again
            </button>
          </div>
        )}

        {analysisResults && (
          <>
            <AnalysisResults 
              results={analysisResults}
              onExport={handleExport}
            />
            <div className="analysis-actions">
              <button onClick={resetAnalysis} className="new-analysis-btn">
                Analyze Another File
              </button>
            </div>
          </>
        )}
      </main>

      <footer className="App-footer">
        <p>Built with ❤️ for the 3D printing community</p>
      </footer>
    </div>
  )
}

export default App
