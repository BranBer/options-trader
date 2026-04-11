/**
 * Generate a timestamped filename for the PDF report.
 * Format: DeepDive_{TICKER}_{YYYY-MM-DD}.pdf
 */
export function generateReportFilename(
  ticker: string,
  date: Date = new Date(),
): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `DeepDive_${ticker.toUpperCase()}_${yyyy}-${mm}-${dd}.pdf`;
}

/**
 * Trigger a browser download for a Blob.
 * Creates a temporary object URL, clicks a hidden anchor, then revokes
 * the URL to free memory.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  // Clean up — small delay so the browser can start the download
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
  }, 100);
}
