import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { ReportData } from "@/types/report";
import ReportDocument from "@/components/report/ReportDocument";

/**
 * Generate a PDF report from aggregated report data.
 * Uses @react-pdf/renderer to assemble and render the document,
 * returning a Blob suitable for download.
 *
 * @param reportData  Fully aggregated report data with chart screenshots already populated
 * @returns PDF as a Blob
 */
export async function generateDeepDiveReport(
  reportData: ReportData,
): Promise<Blob> {
  const doc = createElement(ReportDocument, {
    data: reportData,
  }) as unknown as ReactElement<DocumentProps>;
  const blob = await pdf(doc).toBlob();
  return blob;
}
