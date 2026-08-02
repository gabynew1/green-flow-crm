import { toast } from "sonner";

/** True when the browser can share actual files (Android Chrome, iOS Safari 15+). */
export function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined" || !navigator.canShare || !navigator.share) return false;
    const probe = new File([new Blob(["x"], { type: "application/pdf" })], "probe.pdf", {
      type: "application/pdf",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Opens the OS share sheet (WhatsApp, Telegram, Mail, Drive…) with the file attached.
 * Falls back to a plain download when the platform can't share files.
 */
export async function shareFile(
  blob: Blob,
  filename: string,
  title: string,
  text?: string,
): Promise<void> {
  if (canShareFiles()) {
    try {
      const file = new File([blob], filename, { type: blob.type || "application/pdf" });
      await navigator.share({ files: [file], title, text });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return; // user dismissed the sheet
    }
  }
  downloadBlob(blob, filename);
  toast.info("Partajarea nu este disponibilă aici — fișierul a fost descărcat.");
}
