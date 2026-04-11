# PDF Library Evaluation — Story 44.1

## Approaches Evaluated

### Approach A — Ghost Element → Image PDF (`html2pdf.js`)

**How it works**: Render a hidden DOM element (the "ghost") with all report content styled via CSS. `html2pdf.js` (which wraps `html2canvas` + `jsPDF`) captures the DOM as a canvas bitmap, slices it into pages, and saves as PDF.

**Pros**:

- Reuses existing React components and Tailwind CSS — minimal new code
- Styling fidelity: what you see in the browser is what you get in the PDF
- Simple API: `html2pdf().from(element).save()`
- Page-break control via CSS `break-before`, `break-after`, `break-inside`
- Active: v0.14.0 published 3 months ago, 895K weekly downloads

**Cons**:

- **Text is NOT selectable** — entire page is rasterized to a single image per page
- **Large file sizes** — each page is a full-resolution JPEG/PNG bitmap
- **Canvas size limits** — HTML5 canvas has max dimensions (~16K px); a 12-page report at high DPI could exceed this, producing blank output (documented known issue #6)
- Rendering is approximate — `html2canvas` doesn't support all CSS (e.g. `backdrop-filter`, some gradients)
- No vector graphics — everything is pixels
- Client-side only (no Node.js support)
- **html2canvas last published 4 years ago** (v1.4.1) — effectively unmaintained

**Verdict**: ❌ **Not recommended**. Non-selectable text and canvas size limits are dealbreakers for a data-dense multi-page report.

---

### Approach B — React PDF Primitives (`@react-pdf/renderer`)

**How it works**: Build PDF-specific React components using `<Document>`, `<Page>`, `<View>`, `<Text>`, `<Image>`, `<Canvas>` primitives from `@react-pdf/renderer`. The library renders directly to PDF vector output — no DOM required.

**Pros**:

- **Selectable, searchable text** — native PDF text rendering
- **Small file sizes** — vector text + embedded images only
- **No canvas size limits** — renders page-by-page via its own layout engine
- **Image component accepts base64 data URLs** — perfect for `takeScreenshot()` output
- **SVG support** built-in — can draw custom graphics
- **Canvas component** with pdfkit drawing primitives — can draw charts programmatically
- Works on both **client and server** (Node + browser)
- `PDFDownloadLink` and `BlobProvider` components for one-click download
- **Very active**: v4.4.1, 2.2M weekly downloads, 16.5K GitHub stars, 164 contributors
- Flexbox layout engine — familiar from React Native
- Page wrapping, orphan/widow protection, bookmarks, dynamic content

**Cons**:

- **Cannot reuse existing React components** — need PDF-specific component tree
- Limited CSS subset (no `grid`, no `position: absolute`, no `z-index`)
- Custom fonts require explicit registration
- Learning curve for `StyleSheet.create()` API (but straightforward)
- Bundle size: ~300KB (reasonable for a feature behind user action)
- Dark theme needs careful color management (background fills on every `<View>`)

**Verdict**: ✅ **Recommended**. Selectable text, correct pagination, robust Image support for chart screenshots, and active ecosystem make this the strongest choice.

---

### Approach C — Low-Level PDF Builder (`jsPDF` direct)

**How it works**: Programmatically construct the PDF using `jsPDF`'s imperative API: `doc.text()`, `doc.addImage()`, `doc.addPage()`, etc.

**Pros**:

- Full control over exact placement
- Selectable text
- Very popular (10.6M weekly downloads)
- Can run in both browser and Node.js
- Small core library

**Cons**:

- **Imperative, not declarative** — no React component model, no layout engine
- Manual coordinate math for every element (x, y positions in millimeters)
- No automatic text wrapping or page overflow handling
- Complex tables require additional library (`jspdf-autotable`)
- No flexbox — all positioning is manual
- Much more code to write and maintain than Approach B
- Error-prone for multi-page layouts with dynamic content

**Verdict**: ❌ **Not recommended**. Manual positioning for a 12+ page report with tables, badges, and dynamic content would be extremely tedious and fragile.

---

### Approach D — Headless Browser (Puppeteer / Playwright)

**How it works**: Render the report as a full HTML page, launch a headless Chrome instance, and call `page.pdf()` to produce a native PDF.

**Pros**:

- Perfect CSS fidelity — Chrome renders exactly like the browser
- Selectable text
- Supports all CSS features (grid, flexbox, animations, etc.)
- Can reuse existing React components with SSR

**Cons**:

- **Server-side only** — requires a Chrome binary (~300MB) on the server
- Cannot run client-side in the browser
- Heavy deployment dependency (Chromium binary)
- Slow startup time (~2-5s for Chrome instance)
- Memory intensive (~200MB per Chrome process)
- Requires API endpoint to generate PDF — adds server load
- Complex to deploy on edge/serverless platforms
- Overkill for our use case

**Verdict**: ❌ **Not recommended**. Server dependency, deployment complexity, and resource cost are unjustified when client-side generation works.

---

## Evaluation Matrix

| Criterion              | Weight | A (html2pdf)   | B (react-pdf)  | C (jsPDF) | D (Puppeteer) |
| ---------------------- | ------ | -------------- | -------------- | --------- | ------------- |
| Text selectable in PDF | High   | ❌             | ✅             | ✅        | ✅            |
| Chart image embedding  | High   | ✅             | ✅             | ✅        | ✅            |
| Client-side only       | High   | ✅             | ✅             | ✅        | ❌            |
| Styling fidelity       | Med    | ✅             | ⚠️ (subset)    | ⚠️        | ✅            |
| Page break control     | Med    | ⚠️             | ✅             | Manual    | ✅            |
| Bundle size impact     | Med    | ~200KB         | ~300KB         | ~150KB    | N/A (server)  |
| Active maintenance     | Med    | ⚠️             | ✅             | ✅        | ✅            |
| Developer experience   | Med    | Easy           | Good           | Tedious   | Complex       |
| File size output       | Low    | Large (bitmap) | Small (vector) | Small     | Medium        |

---

## Recommendation

**Use `@react-pdf/renderer` (Approach B).**

### Rationale

1. **Selectable text** is critical — users need to copy ticker names, prices, and analysis text from the PDF
2. **Image component** natively supports base64 data URLs from `canvas.toDataURL()`, which is exactly what `takeScreenshot()` produces
3. **Declarative React model** matches our existing development patterns — we build a component tree that maps 1:1 to the report structure
4. **Built-in pagination** with `wrap`, `break`, `fixed` props handles multi-page layout automatically
5. **`PDFDownloadLink`** provides a zero-config download experience — no manual blob handling needed (though we'll use `BlobProvider` for progress tracking)
6. **Active ecosystem** with 2.2M weekly downloads, regular releases, and strong community
7. **Bundle size** (~300KB) is acceptable since PDF generation is an on-demand feature behind a button click — can be code-split with dynamic import

### Chart Integration Strategy

Charts will be captured as PNG images using `takeScreenshot()` from lightweight-charts and embedded via `@react-pdf/renderer`'s `<Image src={dataUrl} />` component. This hybrid approach gives us:

- **Vector text** for all analysis content (selectable, searchable, small file size)
- **Raster charts** embedded at high resolution (1200×600px) for visual fidelity
- No dependency on headless browser or server-side rendering

### Installation

```bash
npm install @react-pdf/renderer
```

No additional peer dependencies needed — it works with React 18+ (React 19 compatibility confirmed via their CI).
