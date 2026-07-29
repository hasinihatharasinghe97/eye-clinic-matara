import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
};

export function CameraCapture({ open, busy, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [session, setSession] = useState(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setBlob(null);
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      clearPreview();
      setError('');
      return;
    }

    if (previewUrl) return;

    let cancelled = false;

    async function start() {
      setError('');
      try {
        stopCamera();
        if (!navigator.mediaDevices?.getUserMedia) {
          setError(
            'Camera is not supported in this browser. Use Upload instead, or try Chrome / Edge.'
          );
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('Camera permission denied. Allow camera access in the browser, then try again.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('No camera was found on this device.');
        } else {
          const msg = err instanceof Error ? err.message : 'Could not open camera';
          setError(`Could not open camera: ${msg}`);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, facingMode, session, previewUrl, stopCamera, clearPreview]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError('Camera is not ready yet. Wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (next) => {
        if (!next) {
          setError('Could not capture photo.');
          return;
        }
        clearPreview();
        setBlob(next);
        setPreviewUrl(URL.createObjectURL(next));
        stopCamera();
        setError('');
      },
      'image/jpeg',
      0.92
    );
  }

  function retake() {
    clearPreview();
    setSession((s) => s + 1);
  }

  async function save() {
    if (!blob) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = new File([blob], `camera-${stamp}.jpg`, { type: 'image/jpeg' });
    await onCapture(file);
  }

  if (!open) return null;

  return (
    <div className="camera-overlay" role="dialog" aria-modal="true" aria-label="Take photo">
      <div className="camera-modal">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Take photo</h3>
          <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="camera-viewport">
          {previewUrl ? (
            <img src={previewUrl} alt="Captured preview" className="camera-preview" />
          ) : (
            <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
          )}
        </div>

        <div className="row" style={{ marginTop: '0.85rem', justifyContent: 'center' }}>
          {!previewUrl ? (
            <>
              <button
                className="btn secondary"
                type="button"
                disabled={busy || Boolean(error && !streamRef.current)}
                onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
              >
                Flip camera
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || Boolean(error)}
                onClick={takePhoto}
              >
                Capture
              </button>
            </>
          ) : (
            <>
              <button className="btn secondary" type="button" disabled={busy} onClick={retake}>
                Retake
              </button>
              <button className="btn" type="button" disabled={busy || !blob} onClick={() => void save()}>
                {busy ? 'Saving…' : 'Save photo'}
              </button>
            </>
          )}
        </div>

        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}>
          Allow camera access when the browser asks. On phones, “Upload image” can also open the camera.
        </p>
      </div>
    </div>
  );
}
