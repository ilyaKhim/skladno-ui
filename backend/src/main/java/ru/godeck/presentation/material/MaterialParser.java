package ru.godeck.presentation.material;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackageAccess;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;

import ru.godeck.presentation.dto.ExtractedMaterial;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.GenerationInput;

import java.io.IOException;
import java.io.Writer;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipFile;

/**
 * Text-only parsers used inside a disposable JVM, never a full document renderer. No links,
 * scripts, embedded objects, image rendering, or external relationships are followed.
 */
public final class MaterialParser {
    private MaterialParser() {}

    /**
     * Extracts only the supported text subset; failures never return a silently truncated result.
     */
    public static ExtractedMaterial extract(Path file, String format, String name)
            throws Exception {
        return switch (format) {
            case "pdf" -> pdf(file, name);
            case "docx" -> docx(file, name);
            case "txt" -> txt(file, name);
            default -> throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
        };
    }

    private static ExtractedMaterial txt(Path file, String name) throws IOException {
        String text;
        try {
            text =
                    StandardCharsets.UTF_8
                            .newDecoder()
                            .onMalformedInput(CodingErrorAction.REPORT)
                            .onUnmappableCharacter(CodingErrorAction.REPORT)
                            .decode(ByteBuffer.wrap(Files.readAllBytes(file)))
                            .toString();
        } catch (CharacterCodingException e) {
            throw new GenerationException(GenerationError.SOURCE_ENCODING);
        }
        // Binary formats renamed to .txt must not slip through UTF-8 decoding as source text.
        if (text.startsWith("%PDF-") || text.startsWith("PK\u0003\u0004"))
            throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
        return result("txt", name, text, null, List.of());
    }

    private static ExtractedMaterial pdf(Path file, String name) throws IOException {
        try (var document = Loader.loadPDF(file.toFile())) {
            if (document.isEncrypted())
                throw new GenerationException(GenerationError.SOURCE_ENCRYPTED);
            int pages = document.getNumberOfPages();
            if (pages > MaterialPolicy.MAX_PDF_PAGES)
                throw new GenerationException(GenerationError.SOURCE_LIMIT);
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
            throw new GenerationException(GenerationError.SOURCE_ENCRYPTED);
        }
    }

    private static ExtractedMaterial docx(Path file, String name) throws Exception {
        try (var input = Files.newInputStream(file)) {
            byte[] signature = input.readNBytes(4);
            if (signature.length == 4
                    && signature[0] == (byte) 0xD0
                    && signature[1] == (byte) 0xCF) {
                try (var ole = new POIFSFileSystem(file.toFile(), true)) {
                    throw new GenerationException(
                            ole.getRoot().hasEntry("EncryptedPackage")
                                    ? GenerationError.SOURCE_ENCRYPTED
                                    : GenerationError.UNSUPPORTED_SOURCE);
                }
            }
        }
        checkZip(file);
        try (var pkg = OPCPackage.open(file.toFile(), PackageAccess.READ);
                var document = new XWPFDocument(pkg)) {
            if (!"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
                    .equals(document.getPackagePart().getContentType()))
                throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
            var text = new LimitedText();
            appendBody(document.getBodyElements(), text);
            return result("docx", name, text.toString(), null, List.of());
        }
    }

    /** Checks actual inflated bytes before XML parsing; advertised ZIP sizes are not trusted. */
    private static void checkZip(Path file) throws IOException {
        long inflated = 0;
        int count = 0;
        boolean hasDocument = false;
        try (var zip = new ZipFile(file.toFile())) {
            var entries = zip.entries();
            var buffer = new byte[8192];
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                if (++count > MaterialPolicy.MAX_ZIP_ENTRIES)
                    throw new GenerationException(GenerationError.SOURCE_LIMIT);
                if (entry.getName().equals("word/document.xml")) hasDocument = true;
                if (entry.isDirectory()) continue;
                try (var stream = zip.getInputStream(entry)) {
                    int read;
                    while ((read = stream.read(buffer)) != -1) {
                        inflated += read;
                        if (inflated > MaterialPolicy.MAX_INFLATED_BYTES)
                            throw new GenerationException(GenerationError.SOURCE_LIMIT);
                    }
                }
            }
        }
        if (!hasDocument) throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
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
        String text = GenerationInput.sourceText(raw);
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
            if ((long) value.length() + length > MaterialPolicy.MAX_TEXT_CHARACTERS + 2048L)
                throw new GenerationException(GenerationError.SOURCE_TOO_LONG);
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
