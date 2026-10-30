package ru.godeck.documents;

import static org.assertj.core.api.Assertions.*;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

class MaterialParserTest {
    @TempDir Path directory;

    @Test
    void txtPreservesCyrillicAndNormalizesBomAndLineEndings() throws Exception {
        var file = directory.resolve("source.txt");
        Files.writeString(file, "\uFEFFДоход: 42 млн\r\nВыводы\r\n", StandardCharsets.UTF_8);
        var result = MaterialParser.extract(Files.readAllBytes(file), "txt", "source.txt");
        assertThat(result.text()).isEqualTo("Доход: 42 млн\nВыводы");
        assertThat(result.characters()).isEqualTo(result.text().length());
        assertThat(result.pages()).isNull();
    }

    @Test
    void rejectsUnknownEncodingBinaryEmptyAndOverlongText() throws Exception {
        var file = directory.resolve("source.txt");
        Files.write(file, new byte[] {(byte) 0xD0});
        assertThatThrownBy(() -> MaterialParser.extract(Files.readAllBytes(file), "txt", "x.txt"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("source_encoding");
        Files.writeString(file, "\u0000binary");
        assertThatThrownBy(() -> MaterialParser.extract(Files.readAllBytes(file), "txt", "x.txt"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("source_invalid");
        Files.writeString(file, " \n\t");
        assertThatThrownBy(() -> MaterialParser.extract(Files.readAllBytes(file), "txt", "x.txt"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("source_empty");
        Files.writeString(file, "x".repeat(30_000 + 1));
        assertThatThrownBy(() -> MaterialParser.extract(Files.readAllBytes(file), "txt", "x.txt"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("source_too_long");
    }

    @Test
    void docxKeepsParagraphTableParagraphSourceOrder() throws Exception {
        var file = directory.resolve("source.docx");
        try (var document = new XWPFDocument()) {
            document.createParagraph().createRun().setText("Начало отчёта");
            var table = document.createTable(2, 2);
            table.getRow(0).getCell(0).setText("Период");
            table.getRow(0).getCell(1).setText("Выручка");
            table.getRow(1).getCell(0).setText("Q3");
            table.getRow(1).getCell(1).setText("42 млн");
            document.createParagraph().createRun().setText("Итог отчёта");
            try (var stream = Files.newOutputStream(file)) {
                document.write(stream);
            }
        }
        var text = MaterialParser.extract(Files.readAllBytes(file), "docx", "source.docx").text();
        assertThat(text)
                .containsSubsequence(
                        "Начало отчёта", "Период", "Выручка", "Q3", "42 млн", "Итог отчёта");
    }

    @Test
    void rejectsZipEntryExplosionBeforeParsingXml() throws Exception {
        var file = directory.resolve("source.docx");
        try (var zip = new ZipOutputStream(Files.newOutputStream(file))) {
            for (int index = 0; index <= 1_000; index++) {
                zip.putNextEntry(new ZipEntry("entry" + index));
                zip.closeEntry();
            }
        }
        assertThatThrownBy(() -> MaterialParser.extract(Files.readAllBytes(file), "docx", "x.docx"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("source_limit");
    }

    @Test
    void rejectsZipThatIsNotWord() throws Exception {
        var file = directory.resolve("source.docx");
        try (var zip = new ZipOutputStream(Files.newOutputStream(file))) {
            zip.putNextEntry(new ZipEntry("ppt/presentation.xml"));
            zip.closeEntry();
        }
        assertThatThrownBy(() -> MaterialParser.extract(Files.readAllBytes(file), "docx", "x.docx"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("unsupported_source");
    }

    @Test
    void pdfReturnsTextAndOneBasedWarningForBlankPages() throws Exception {
        var file = pdf(2, false);
        var result = MaterialParser.extract(Files.readAllBytes(file), "pdf", "report.pdf");
        assertThat(result.text()).contains("Revenue: 42 million");
        assertThat(result.pages()).isEqualTo(2);
        assertThat(result.warnings()).hasSize(1);
        assertThat(result.warnings().getFirst().code()).isEqualTo("pdf_pages_without_text");
        assertThat(result.warnings().getFirst().pages()).containsExactly(2);
    }

    @Test
    void rejectsEncryptedPdfAndPageLimit() throws Exception {
        var encrypted = pdf(1, true);
        assertThatThrownBy(
                        () -> MaterialParser.extract(Files.readAllBytes(encrypted), "pdf", "x.pdf"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("source_encrypted");
        var tooMany = pdf(20 + 1, false);
        assertThatThrownBy(
                        () -> MaterialParser.extract(Files.readAllBytes(tooMany), "pdf", "x.pdf"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("source_limit");
    }

    @Test
    void rejectsScanWithoutTextAndDamagedPdf() throws Exception {
        var file = directory.resolve("scan.pdf");
        try (var document = new PDDocument()) {
            document.addPage(new PDPage());
            document.save(file.toFile());
        }
        assertThatThrownBy(
                        () -> MaterialParser.extract(Files.readAllBytes(file), "pdf", "scan.pdf"))
                .extracting(error -> ((MaterialParser.InvalidMaterial) error).code())
                .isEqualTo("source_empty");
        Files.writeString(file, "%PDF-1.7\nnot-a-document");
        assertThatThrownBy(
                        () -> MaterialParser.extract(Files.readAllBytes(file), "pdf", "scan.pdf"))
                .isInstanceOf(java.io.IOException.class);
    }

    private Path pdf(int pages, boolean encrypted) throws Exception {
        Path file = directory.resolve("report-" + pages + "-" + encrypted + ".pdf");
        try (var document = new PDDocument()) {
            var first = new PDPage();
            document.addPage(first);
            try (var stream = new PDPageContentStream(document, first)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.newLineAtOffset(30, 700);
                stream.showText("Revenue: 42 million");
                stream.endText();
            }
            for (int page = 1; page < pages; page++) document.addPage(new PDPage());
            if (encrypted)
                document.protect(
                        new StandardProtectionPolicy("owner", "user", new AccessPermission()));
            document.save(file.toFile());
        }
        return file;
    }
}
