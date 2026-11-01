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
    void lineAndDoughnutHaveNativeSeriesEditableWorkbooksAndVisiblePdfGraphics() throws Exception {
        for (String type : List.of("line", "doughnut")) {
            var block = new DataBlock("new-" + type, type, 15, 35, 70, 50,
                    List.of("Квартал", "Продажи"), List.of(List.of("Q1", "30"), List.of("Q2", "70")), false);
            var bytes = templates.render("opal", plan(List.of(block)));
            try (var show = new XMLSlideShow(new ByteArrayInputStream(bytes))) {
                var chart = show.getCharts().getFirst();
                var nativeData = chart.getChartSeries().getFirst();
                assertThat(nativeData.getClass().getSimpleName()).isEqualTo(type.equals("line") ? "XDDFLineChartData" : "XDDFDoughnutChartData");
                assertThat(nativeData.getSeries(0).getValuesData().getPointAt(1).doubleValue()).isEqualTo(70);
                assertThat(chart.getWorkbook().getSheetAt(0).getRow(1).getCell(1).getNumericCellValue()).isEqualTo(30);
                if (type.equals("line")) {
                    var series = chart.getCTChart().getPlotArea().getLineChartArray(0).getSerArray(0);
                    assertThat(series.getSmooth().getVal()).isFalse();
                    assertThat(series.getSpPr().getLn().getSolidFill().getSrgbClr().getVal()).containsExactly((byte) 0x33, (byte) 0x5c, (byte) 0xc5);
                } else {
                    var ring = chart.getCTChart().getPlotArea().getDoughnutChartArray(0);
                    assertThat(ring.getSerArray(0).getDPtList()).hasSize(2);
                    assertThat(ring.getFirstSliceAng().getVal()).isZero();
                }
            }
            var file = directory.resolve(type + ".pptx");
            Files.write(file, bytes);
            try (var pdf = Loader.loadPDF(new PresentationPdfRenderer(new PdfExportSettings(72, 1)).render(file, false))) {
                var image = new PDFRenderer(pdf).renderImage(0);
                int blue = 0;
                for (int y = 0; y < image.getHeight(); y++) for (int x = 0; x < image.getWidth(); x++)
                    if ((image.getRGB(x, y) & 0xffffff) == 0x335cc5) blue++;
                assertThat(blue).as(type + " PDF pixels").isGreaterThan(type.equals("line") ? 100 : 500);
            }
            assertThat(Files.readAllBytes(file)).isEqualTo(bytes);
        }
    }

    @Test
    void kpiAndComparisonExportAsEditableTextAndCells() throws Exception {
        var kpi = new DataBlock("kpi", "kpi", 15, 35, 70, 50, List.of("Показатель", "Значение"), List.of(List.of("Конверсия", "42%")), false);
        var comparison = new DataBlock("compare", "comparison", 15, 35, 70, 50,
                List.of("Критерий", "Старт", "Бизнес"), List.of(List.of("Поддержка", "Email", "24/7")), false);
        try (var show = new XMLSlideShow(new ByteArrayInputStream(templates.render("opal", plan(List.of(kpi, comparison)))))) {
            assertThat(show.getCharts()).isEmpty();
            var slide = show.getSlides().getFirst();
            assertThat(slide.getShapes().stream().filter(org.apache.poi.xslf.usermodel.XSLFTextShape.class::isInstance)
                    .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast).map(org.apache.poi.xslf.usermodel.XSLFTextShape::getText).toList())
                    .contains("42%", "Конверсия");
            var table = slide.getShapes().stream().filter(XSLFTable.class::isInstance).map(XSLFTable.class::cast).findFirst().orElseThrow();
            assertThat(table.getCell(1, 2).getText()).isEqualTo("24/7");
            assertThat(table.getCell(1, 0).getTextParagraphs().getFirst().getTextRuns().getFirst().isBold()).isTrue();
        }
    }

    @Test
    void newTypesRejectMisleadingDistributionsAndInvalidKpiComparisonShapes() {
        var headers = List.of("Категория", "Число");
        for (var invalid : List.of(
                new DataBlock("bad", "doughnut", 15, 35, 70, 50, headers, List.of(List.of("A", "0")), false),
                new DataBlock("bad", "doughnut", 15, 35, 70, 50, headers, List.of(List.of("A", "-1"), List.of("B", "20")), false),
                new DataBlock("bad", "doughnut", 15, 35, 70, 50, List.of("A", "B", "C"), List.of(List.of("A", "1", "2")), false),
                new DataBlock("bad", "kpi", 15, 35, 70, 50, headers, List.of(List.of("A", "1"), List.of("B", "2")), false),
                new DataBlock("bad", "kpi", 15, 35, 70, 50, headers, List.of(List.of("A", "x".repeat(41))), false),
                new DataBlock("bad", "kpi", 15, 35, 70, 50, headers, List.of(List.of("x".repeat(81), "42%")), false),
                new DataBlock("bad", "comparison", 15, 35, 70, 50, headers, List.of(List.of("A", "B")), false),
                new DataBlock("bad", "line", 15, 35, 70, 50, headers, List.of(List.of("A", "NaN")), false)))
            assertThatThrownBy(() -> templates.normalizeEditor("opal", plan(List.of(invalid))))
                    .isInstanceOf(ru.godeck.presentation.exception.GenerationException.class);
    }

    @Test
    void kpiUsesOneUndistortedViewportForWideAndTallBlocks() throws Exception {
        for (double width : List.of(70.0, 30.0)) {
            var kpi = new DataBlock("kpi", "kpi", 15, 30, width, 60, List.of("Показатель", "Значение"), List.of(List.of("Конверсия", "89%")), false);
            try (var show = new XMLSlideShow(new ByteArrayInputStream(templates.render("opal", plan(List.of(kpi)))))) {
                var value = show.getSlides().getFirst().getShapes().stream()
                        .filter(org.apache.poi.xslf.usermodel.XSLFTextShape.class::isInstance)
                        .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast).filter(shape -> shape.getText().equals("89%")).findFirst().orElseThrow();
                var page = TemplateShapes.pageBounds(show);
                double scale = Math.min(page.getWidth() * width / 100 / 600, page.getHeight() * .6 / 320);
                assertThat(value.getTextParagraphs().getFirst().getTextRuns().getFirst().getFontSize()).isCloseTo(76 * scale, within(.01));
                assertThat(value.getAnchor().getCenterX()).isCloseTo(page.getWidth() * (.15 + width / 200), within(.01));
            }
        }
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
