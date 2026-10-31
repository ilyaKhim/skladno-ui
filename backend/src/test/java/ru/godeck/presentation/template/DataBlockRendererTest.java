package ru.godeck.presentation.template;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFGraphicFrame;
import org.apache.poi.xslf.usermodel.XSLFTable;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import ru.godeck.presentation.export.PdfExportSettings;
import ru.godeck.presentation.export.PresentationPdfRenderer;
import ru.godeck.presentation.model.DataBlock;
import ru.godeck.presentation.model.PresentationContent;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.*;

class DataBlockRendererTest {
    @TempDir Path directory;
    private final PresentationTemplateService templates = new PresentationTemplateService(
            new ObjectMapper(), new PresentationContentValidator());

    DataBlockRendererTest() throws Exception {}

    @Test
    void tableAndChartSurviveProjectionAndExportWithRealCellsSeriesAndWorkbook() throws Exception {
        var table = block("table", false);
        var chart = block("bar", false);
        var plan = plan(List.of(table, chart));
        var projected = templates.editorDeck("opal", UUID.randomUUID(), "Data", 1, 0, Map.of(), plan);
        assertThat(projected.slides().getFirst().dataBlocks()).containsExactly(table, chart);
        try (var show = new XMLSlideShow(new ByteArrayInputStream(templates.render("opal", plan)))) {
            var slide = show.getSlides().getFirst();
            var nativeTable = slide.getShapes().stream().filter(XSLFTable.class::isInstance)
                    .map(XSLFTable.class::cast).findFirst().orElseThrow();
            assertThat(nativeTable.getNumberOfRows()).isEqualTo(4);
            assertThat(nativeTable.getCell(1, 0).getText()).isEqualTo("Январь");
            assertThat(nativeTable.getCell(2, 1).getText()).isEqualTo("-5");
            var frame = slide.getShapes().stream().filter(XSLFGraphicFrame.class::isInstance)
                    .map(XSLFGraphicFrame.class::cast).filter(XSLFGraphicFrame::hasChart).findFirst().orElseThrow();
            assertThat(frame.getShapeName()).isEqualTo("godeck-bar-bar-false");
            assertThat(frame.getAnchor().getWidth() / show.getPageSize().getWidth()).isCloseTo(.7, within(.001));
            assertThat(frame.getAnchor().getX() / show.getPageSize().getWidth()).isCloseTo(.15, within(.001));
            var nativeChart = frame.getChart();
            assertThat(nativeChart.getChartSeries()).hasSize(1);
            var data = nativeChart.getChartSeries().getFirst();
            assertThat(data.getSeriesCount()).isEqualTo(2);
            assertThat(data.getSeries(0).getCategoryData().getPointAt(0)).isEqualTo("Январь");
            assertThat(data.getSeries(0).getValuesData().getPointAt(1).doubleValue()).isEqualTo(-5);
            assertThat(nativeChart.getWorkbook().getSheetAt(0).getRow(2).getCell(1).getNumericCellValue()).isEqualTo(-5);
            assertThat(nativeChart.getWorkbook().getSheetAt(0).getRow(0).getCell(2).getStringCellValue()).isEqualTo("План");
        }
    }

    @Test
    void bothOrientationsPaintBarsInPdfWithoutChangingThePublishedPptx() throws Exception {
        for (boolean horizontal : List.of(false, true)) {
            var file = directory.resolve("chart-" + horizontal + ".pptx");
            var bytes = templates.render("opal", plan(List.of(block("bar", horizontal))));
            Files.write(file, bytes);
            var renderer = new PresentationPdfRenderer(new PdfExportSettings(72, 1));
            try (var pdf = Loader.loadPDF(renderer.render(file, false))) {
                var image = new PDFRenderer(pdf).renderImage(0);
                int blue = 0, green = 0;
                for (int y = 0; y < image.getHeight(); y++) for (int x = 0; x < image.getWidth(); x++) {
                    int color = image.getRGB(x, y) & 0xffffff;
                    if (color == 0x335cc5) blue++;
                    if (color == 0x008577) green++;
                }
                assertThat(blue).isGreaterThan(500);
                assertThat(green).isGreaterThan(500);
            }
            assertThat(Files.readAllBytes(file)).isEqualTo(bytes);
        }
    }

    private static DataBlock block(String type, boolean horizontal) {
        return new DataBlock(type + "-" + horizontal, type, 15, 35, 70, 50,
                List.of("Месяц", "Факт", "План"),
                List.of(List.of("Январь", "10", "12"), List.of("Февраль", "-5", "15"),
                        List.of("Март", "0", "20")), horizontal);
    }

    @Test
    void rejectsNonRectangularNonFiniteDuplicateAndOversizedDataBeforeRendering() {
        var valid = block("bar", false);
        for (String value : List.of("", "NaN", "Infinity", "10%", "1,5", "0x1p2", "1000000000001")) {
            var invalid = new DataBlock("bad", "bar", 10, 10, 50, 50,
                    List.of("Category", "Value"), List.of(List.of("A", value)), false);
            assertThatThrownBy(() -> templates.normalizeEditor("opal", plan(List.of(invalid))))
                    .isInstanceOf(ru.godeck.presentation.exception.GenerationException.class);
        }
        for (var invalid : List.of(
                new DataBlock("bad", "table", 10, 10, 50, 50, valid.headers(), List.of(List.of("A")), false),
                new DataBlock("bad", "table", 90, 10, 50, 50, valid.headers(), valid.rows(), false),
                new DataBlock("bad", "table", 10, 10, 50, 50, valid.headers(), java.util.Collections.nCopies(13, valid.rows().getFirst()), false),
                new DataBlock("bad", "table", 10, 10, 50, 50, List.of("A", "B"), List.of(List.of("A", "x".repeat(161))), false))) {
            assertThatThrownBy(() -> templates.normalizeEditor("opal", plan(List.of(invalid))))
                    .isInstanceOf(ru.godeck.presentation.exception.GenerationException.class);
        }
        assertThatThrownBy(() -> templates.normalizeEditor("opal", plan(List.of(valid, valid))))
                .isInstanceOf(ru.godeck.presentation.exception.GenerationException.class);
    }

    private PresentationContent plan(List<DataBlock> blocks) {
        var fields = new LinkedHashMap<String, String>();
        templates.fields("opal").keySet().forEach(key -> fields.put(key, "Test"));
        return new PresentationContent(fields, IntStream.rangeClosed(1, 13).mapToObj(number ->
                new PresentationContent.Slide(number, number == 1, "Test", false, List.of(), List.of(),
                        List.of(), number == 1 ? blocks : List.of())).toList());
    }
}
