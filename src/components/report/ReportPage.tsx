import { Page, View, Text } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { baseStyles, formatReportDate } from "./styles";

interface ReportPageProps {
  ticker: string;
  generatedAt: string;
  children: ReactNode;
  /** Omit header (used on cover page) */
  hideHeader?: boolean;
}

export default function ReportPage({
  ticker,
  generatedAt,
  children,
  hideHeader,
}: ReportPageProps) {
  const dateStr = formatReportDate(generatedAt);

  return (
    <Page size="LETTER" style={baseStyles.page}>
      {!hideHeader && (
        <View style={baseStyles.header} fixed>
          <Text style={baseStyles.headerLeft}>
            Options Dashboard — Deep Dive Report
          </Text>
          <Text style={baseStyles.headerRight}>
            {ticker} | {dateStr}
          </Text>
        </View>
      )}

      {children}

      <View style={baseStyles.footer} fixed>
        <Text style={baseStyles.footerLeft}>
          Generated {dateStr} • Not financial advice
        </Text>
        <Text
          style={baseStyles.footerRight}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}
