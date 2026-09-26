import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  onScan: (code: string) => void;
};

/**
 * Two ways to capture an IMEI without typing:
 *  - a handheld / USB barcode gun (acts like a keyboard, ends with Enter)
 *  - the device camera, using the browser's built-in barcode detection
 */
export function ImeiScanner({ onScan }: Props) {
  const [gunValue, setGunValue] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    if (typeof window !== "undefined" && !("BarcodeDetector" in window)) {
      setCameraSupported(false);
    }
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => () => stopCamera(), []);

  function accept(raw: string) {
    const code = raw.replace(/\D/g, "");
    if (code.length < 10 || code.length > 20) {
      toast.error("That code doesn't look like an IMEI (10–20 digits)");
      return;
    }
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 2500) return;
    lastRef.current = { code, at: now };
    onScan(code);
    toast.success(`Scanned ${code}`);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(60);
  }

  async function startCamera() {
    const Detector = (window as unknown as { BarcodeDetector?: new (o?: unknown) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (!Detector) {
      setCameraSupported(false);
      toast.error("This browser can't read barcodes with the camera. Use a scanner gun or type the numbers.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setCameraOn(true);
      const detector = new Detector({
        formats: ["code_128", "code_39", "ean_13", "itf", "qr_code", "data_matrix"],
      });
      requestAnimationFrame(async function loop() {
        const video = videoRef.current;
        if (!streamRef.current || !video) return;
        if (video.srcObject !== streamRef.current) {
          video.srcObject = streamRef.current;
          try {
            await video.play();
          } catch {
            /* autoplay retry on next frame */
          }
        }
        if (video.readyState >= 2) {
          try {
            const found = await detector.detect(video);
            if (found.length > 0 && found[0]?.rawValue) accept(found[0].rawValue);
          } catch {
            /* transient decode failure — keep scanning */
          }
        }
        requestAnimationFrame(loop);
      });
    } catch {
      toast.error("Couldn't open the camera. Check the camera permission for this site.");
      stopCamera();
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="scan-gun">Scan with a barcode scanner</Label>
        <Input
          id="scan-gun"
          value={gunValue}
          onChange={(e) => setGunValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (gunValue.trim()) accept(gunValue);
              setGunValue("");
            }
          }}
          placeholder="Click here, then scan a box"
          className="font-mono text-sm"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Each scan is added to the list below automatically.
        </p>
      </div>

      <div className="space-y-2">
        {cameraOn ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full rounded-md bg-black object-cover"
            />
            <Button type="button" variant="secondary" onClick={stopCamera}>
              Stop camera
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={startCamera} disabled={!cameraSupported}>
            Scan with camera
          </Button>
        )}
        {!cameraSupported && (
          <p className="text-xs text-muted-foreground">
            Camera scanning isn't available in this browser. A scanner gun still works.
          </p>
        )}
      </div>
    </div>
  );
}
