import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { ScanLine, X, Loader2 } from 'lucide-react'

const DEFAULT_ERROR = 'Unable to open camera. Please check browser camera permission.'

const requestCameraAccess = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera access.')
  }

  if (!window.isSecureContext) {
    throw new Error('Camera access requires a secure page. Open the app from localhost or HTTPS.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  })

  stream.getTracks().forEach((track) => track.stop())
}

const BarcodeScanner = ({
  open,
  elementId,
  onDetected,
  onClose,
  title = 'Scan Barcode',
  description = 'Point the camera at a barcode or type the code below.',
  closeOnDetect = true,
  variant = 'inline'
}) => {
  const scannerRef = useRef(null)
  const lastScanRef = useRef({ value: '', at: 0 })
  const [isStarting, setIsStarting] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [manualCode, setManualCode] = useState('')

  const isOverlay = variant === 'overlay'

  const qrConfig = useMemo(() => ({
    fps: 12,
    qrbox: { width: 220, height: 220 },
    aspectRatio: 1.333334
  }), [])

  const cleanupScanner = async (scanner) => {
    if (!scanner) return

    try {
      await scanner.stop()
    } catch (error) {
      if (!String(error?.message || error).includes('scanner is not running or paused')) {
        console.error('Scanner stop error:', error)
      }
    }

    try {
      await scanner.clear()
    } catch (error) {
      console.error('Scanner clear error:', error)
    }
  }

  const submitCode = useCallback(async (rawCode) => {
    const code = String(rawCode || '').trim()
    if (!code) return

    setManualCode(code)

    const now = Date.now()
    if (lastScanRef.current.value === code && now - lastScanRef.current.at < 1200) {
      return
    }
    lastScanRef.current = { value: code, at: now }

    try {
      await onDetected(code)
      if (closeOnDetect) {
        onClose?.()
      }
    } catch (error) {
      console.error('Barcode handler error:', error)
      setScannerError(error?.message || 'The scanned code could not be processed.')
    }
  }, [closeOnDetect, onClose, onDetected])

  useEffect(() => {
    if (!open) {
      setIsStarting(false)
      setScannerError('')
      setManualCode('')
      lastScanRef.current = { value: '', at: 0 }
      return
    }

    let cancelled = false

    const startScanner = async () => {
      setIsStarting(true)
      setScannerError('')

      const isPermissionError = (error) => {
        const text = `${String(error?.name || '')} ${String(error?.message || error || '')}`
        return /notallowed|permission|denied/i.test(text)
      }

      const startWithDevice = async (scanner) => {
        try {
          await scanner.start(
            { facingMode: 'environment' },
            qrConfig,
            (decodedText) => submitCode(decodedText),
            () => {}
          )
          return
        } catch (primaryError) {
          if (isPermissionError(primaryError)) {
            throw new Error('Camera permission was denied. Please allow camera access in your browser and try again.')
          }
          console.warn('Primary camera start failed, retrying with fallback camera selection...', primaryError)
        }

        const cameras = await Html5Qrcode.getCameras()
        if (!cameras.length) {
          throw new Error('No camera detected on this device.')
        }

        const preferredCamera = cameras.find((camera) =>
          /back|rear|environment/i.test(camera.label)
        ) || cameras[0]

        await scanner.start(
          preferredCamera.id,
          qrConfig,
          (decodedText) => submitCode(decodedText),
          () => {}
        )
      }

      try {
        const element = document.getElementById(elementId)
        if (!element) {
          throw new Error('Scanner area could not be prepared.')
        }

        await requestCameraAccess()
        if (cancelled) return

        const scanner = new Html5Qrcode(elementId)
        scannerRef.current = scanner
        await startWithDevice(scanner)
      } catch (error) {
        console.error('Scanner error:', error)
        if (!cancelled) {
          setScannerError(error?.message || DEFAULT_ERROR)
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false)
        }
      }
    }

    startScanner()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      scannerRef.current = null
      cleanupScanner(scanner)
    }
  }, [open, elementId, qrConfig, submitCode])

  if (!open) return null

  return (
    <div style={isOverlay ? {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      zIndex: 3000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      backdropFilter: 'blur(5px)'
    } : undefined}>
      <div style={isOverlay ? {
        width: '100%',
        maxWidth: '360px',
        position: 'relative'
      } : {
        marginBottom: '16px',
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#000'
      }}>
        <div
          id={elementId}
          style={{
            width: '100%',
            minHeight: isOverlay ? '280px' : '320px',
            borderRadius: isOverlay ? '20px' : '12px',
            overflow: 'hidden',
            border: isOverlay ? '3px solid var(--primary)' : 'none',
            boxShadow: isOverlay ? '0 0 24px rgba(0,0,0,0.28)' : 'none'
          }}
        />
        <button
          type="button"
          onClick={onClose}
          style={isOverlay ? {
            position: 'absolute',
            top: '-15px',
            right: '-15px',
            background: 'var(--danger)',
            color: 'white',
            border: '4px solid white',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
          } : {
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 10,
            background: 'white',
            padding: '5px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <X size={20} color={isOverlay ? 'currentColor' : 'black'} />
        </button>

        {isStarting && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.58)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            <Loader2 size={24} className="spin" />
          </div>
        )}

        <div style={{
          padding: isOverlay ? '24px 8px 0' : '16px',
          color: isOverlay ? 'white' : 'inherit',
          background: isOverlay ? 'transparent' : 'var(--surface-elevated)'
        }}>
          <div style={{ textAlign: isOverlay ? 'center' : 'left', marginBottom: '12px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: isOverlay ? '20px' : '16px', fontWeight: '800' }}>{title}</h3>
            <p style={{ margin: 0, fontSize: '13px', opacity: isOverlay ? 0.82 : 1, color: isOverlay ? 'inherit' : 'var(--text-muted)' }}>
              {description}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitCode(manualCode)
                }
              }}
              placeholder="Type or paste barcode"
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                outline: 'none',
                background: 'white',
                color: '#111827'
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => submitCode(manualCode)}
              style={{ background: 'var(--primary)', color: 'white', border: 'none' }}
            >
              <ScanLine size={18} />
            </button>
          </div>

          {scannerError && (
            <p style={{ fontSize: '12px', color: isOverlay ? '#fecaca' : 'var(--danger)', margin: '10px 0 0' }}>
              {scannerError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default BarcodeScanner
