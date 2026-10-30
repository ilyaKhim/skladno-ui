package ru.godeck.documents;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.Writer;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipInputStream;

/**
 * Text-only parsers owned by the document worker, never loaded by the product API. No links,
 * scripts, embedded objects, image rendering, or external relationships are followed.
 */
public final class MaterialParser {
    private MaterialParser() {}

    public record ExtractedMaterial(
            String format,
            String name,
            String text,
            int characters,
            Integer pages,
            List<Warning> warnings) {
        public record Warning(String code, String message, List<Integer> pages) {}
    }

    public static final class InvalidMaterial extends RuntimeException {
        private final String code;

        InvalidMaterial(String code) {
            super(code);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }

    /**
     * Extracts only the supported text subset; failures never return a silently truncated result.
     */
    public static ExtractedMaterial extract(byte[] file, String format, String name)
            throws Exception {
        return switch (format) {
            case "pdf" -> pdf(file, name);
            case "docx" -> docx(file, name);
            case "txt" -> txt(file, name);
            default -> throw new InvalidMaterial("unsupported_source");
        };
    }

    private static ExtractedMaterial txt(byte[] file, String name) throws IOException {
        String text;
        try {
            text =
                    StandardCharsets.UTF_8
                            .newDecoder()
                            .onMalformedInput(CodingErrorAction.REPORT)
                            .onUnmappableCharacter(CodingErrorAction.REPORT)
                            .decode(ByteBuffer.wrap(file))
                            .toString();
        } catch (CharacterCodingException e) {
            throw new InvalidMaterial("source_encoding");
        }
        // Binary formats renamed to .txt must not slip through UTF-8 decoding as source text.
        if (text.startsWith("%PDF-") || text.startsWith("PK\u0003\u0004"))
            throw new InvalidMaterial("unsupported_source");
        return result("txt", name, text, null, List.of());
    }

    private static ExtractedMaterial pdf(byte[] file, String name) throws IOException {
        try (var document = Loader.loadPDF(file)) {
            if (document.isEncrypted()) throw new InvalidMaterial("source_encrypted");
            int pages = document.getNumberOfPages();
            if (pages > 20) throw new InvalidMaterial("source_limit");
            var text = new LimitedText();
            var missing = new ArrayList<Integer>();
            var stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            for (int page = 1; page <= pages; page++) {
                int before = text.length();
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                stripper.writeText(document, text);
                if (text.substring(before).isBlank()) missing.add(page);
            }
            List<ExtractedMaterial.Warning> warnings =
                    missing.isEmpty()
                            ? List.of()
                            : List.of(
                                    new ExtractedMaterial.Warning(
                                            "pdf_pages_without_text",
                                            "На некоторых страницах текст не извлечён. Изображения"
                                                    + " и сканы не распознаются.",
                                            List.copyOf(missing)));
            return result("pdf", name, text.toString(), pages, warnings);
        } catch (InvalidPasswordException e) {
            throw new InvalidMaterial("source_encrypted");
        }
    }

    private static ExtractedMaterial docx(byte[] file, String name) throws Exception {
        try (var input = new ByteArrayInputStream(file)) {
            byte[] signature = input.readNBytes(4);
            if (signature.length == 4
                    && signature[0] == (byte) 0xD0
                    && signature[1] == (byte) 0xCF) {
                try (var ole = new POIFSFileSystem(new ByteArrayInputStream(file))) {
                    throw new InvalidMaterial(
                            ole.getRoot().hasEntry("EncryptedPackage")
                                    ? "source_encrypted"
                                    : "unsupported_source");
                }
            }
        }
        checkZip(file);
        try (var pkg = OPCPackage.open(new ByteArrayInputStream(file));
                var document = new XWPFDocument(pkg)) {
            if (!"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
                    .equals(document.getPackagePart().getContentType()))
                throw new InvalidMaterial("unsupported_source");
            var text = new LimitedText();
            appendBody(document.getBodyElements(), text);
            return result("docx", name, text.toString(), null, List.of());
        }
    }

    /** Checks actual inflated bytes before XML parsing; advertised ZIP sizes are not trusted. */
    private static void checkZip(byte[] file) throws IOException {
        long inflated = 0;
        int count = 0;
        boolean hasDocument = false;
        try (var zip = new ZipInputStream(new ByteArrayInputStream(file))) {
            var buffer = new byte[8192];
            java.util.zip.ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > 1_000) throw new InvalidMaterial("source_limit");
                if (entry.getName().equals("word/document.xml")) hasDocument = true;
                if (entry.isDirectory()) continue;
                int read;
                while ((read = zip.read(buffer)) != -1) {
                    inflated += read;
                    if (inflated > 50L * 1024 * 1024) throw new InvalidMaterial("source_limit");
                }
            }
        }
        if (!hasDocument) throw new InvalidMaterial("unsupported_source");
    }

    private static void appendBody(List<IBodyElement> elements, LimitedText text)
            throws IOException {
        for (var element : elements) {
            if (element instanceof XWPFParagraph paragraph) {
                text.write(paragraph.getText());
                text.write("\n");
            } else if (element instanceof XWPFTable table) {
                for (var row : table.getRows()) {
                    boolean first = true;
                    for (var cell : row.getTableCells()) {
                        if (!first) text.write("\t");
                        first = false;
                        appendBody(cell.getBodyElements(), text);
                    }
                    text.write("\n");
                }
            }
        }
    }

    private static ExtractedMaterial result(
            String format,
            String name,
            String raw,
            Integer pages,
            List<ExtractedMaterial.Warning> warnings) {
        String text =
                raw.replaceFirst("^\uFEFF", "").replace("\r\n", "\n").replace('\r', '\n').strip();
        if (text.length() > 30_000) throw new InvalidMaterial("source_too_long");
        if (text.isBlank()) throw new InvalidMaterial("source_empty");
        if (text.codePoints().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\t'))
            throw new InvalidMaterial("source_invalid");
        return new ExtractedMaterial(format, name, text, text.length(), pages, warnings);
    }

    /**
     * Stops text output growth during parsing, rather than constructing an unbounded string first.
     */
    private static final class LimitedText extends Writer {
        private final StringBuilder value = new StringBuilder();

        @Override
        public void write(char[] chars, int offset, int length) {
            // A little space for parser-added surrounding whitespace; final text is checked again.
            if ((long) value.length() + length > 30_000 + 2048L)
                throw new InvalidMaterial("source_too_long");
            value.append(chars, offset, length);
        }

        int length() {
            return value.length();
        }

        String substring(int start) {
            return value.substring(start);
        }

        @Override
        public String toString() {
            return value.toString();
        }

        @Override
        public void flush() {}

        @Override
        public void close() {}
    }
}
