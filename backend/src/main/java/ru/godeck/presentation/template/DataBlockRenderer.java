package ru.godeck.presentation.template;

import org.apache.poi.sl.usermodel.TableCell.BorderEdge;
import org.apache.poi.sl.usermodel.VerticalAlignment;
import org.apache.poi.xddf.usermodel.XDDFColor;
import org.apache.poi.xddf.usermodel.XDDFShapeProperties;
import org.apache.poi.xddf.usermodel.XDDFSolidFillProperties;
import org.apache.poi.xddf.usermodel.XDDFLineProperties;
import org.apache.poi.xddf.usermodel.chart.AxisCrossBetween;
import org.apache.poi.xddf.usermodel.chart.AxisCrosses;
import org.apache.poi.xddf.usermodel.chart.AxisOrientation;
import org.apache.poi.xddf.usermodel.chart.AxisPosition;
import org.apache.poi.xddf.usermodel.chart.BarDirection;
import org.apache.poi.xddf.usermodel.chart.BarGrouping;
import org.apache.poi.xddf.usermodel.chart.ChartTypes;
import org.apache.poi.xddf.usermodel.chart.LegendPosition;
import org.apache.poi.xddf.usermodel.chart.XDDFBarChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFDoughnutChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFLineChartData;
import org.apache.poi.xddf.usermodel.chart.Grouping;
import org.apache.poi.xddf.usermodel.chart.MarkerStyle;
import org.apache.poi.xddf.usermodel.chart.XDDFDataSourcesFactory;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.CellReference;
import ru.godeck.presentation.model.DataBlock;

import java.awt.Color;
import java.awt.geom.Rectangle2D;

/** Writes real PowerPoint tables and charts with an embedded, editable Excel workbook. */
public final class DataBlockRenderer {
    private DataBlockRenderer() {}

    public static Color seriesColor(int index) {
        return Color.decode(new String[]{"#335CC5", "#008577", "#C57525", "#9167BD", "#BD4566"}[index % 5]);
    }

    public static void add(XMLSlideShow show, XSLFSlide slide, DataBlock block) throws Exception {
        var page = TemplateShapes.pageBounds(show);
        var anchor = new Rectangle2D.Double(page.getWidth() * block.x() / 100,
                page.getHeight() * block.y() / 100, page.getWidth() * block.width() / 100,
                page.getHeight() * block.height() / 100);
        switch (block.type()) {
            case "table", "comparison" -> addTable(slide, block, anchor);
            case "kpi" -> addKpi(slide, block, anchor);
            default -> addChart(show, slide, block, anchor);
        }
    }

    private static void addTable(XSLFSlide slide, DataBlock block, Rectangle2D anchor) {
        var table = slide.createTable(block.rows().size() + 1, block.headers().size());
        table.setAnchor(anchor);
        double rowHeight = anchor.getHeight() / table.getNumberOfRows();
        double fontSize = tableFontSize(block) * anchor.getWidth() / (block.width() * 9.6);
        for (int column = 0; column < table.getNumberOfColumns(); column++)
            table.setColumnWidth(column, anchor.getWidth() / table.getNumberOfColumns());
        for (int row = 0; row < table.getNumberOfRows(); row++) {
            table.setRowHeight(row, rowHeight);
            for (int column = 0; column < table.getNumberOfColumns(); column++) {
                var cell = table.getCell(row, column);
                var run = cell.setText(row == 0 ? block.headers().get(column) : block.rows().get(row - 1).get(column));
                run.setFontFamily("Arial");
                run.setFontSize(fontSize);
                boolean criterion = block.type().equals("comparison") && column == 0;
                run.setBold(row == 0 || criterion);
                run.setFontColor(row == 0 ? Color.WHITE : Color.decode("#142033"));
                var paragraph = cell.getTextParagraphs().getFirst();
                paragraph.setSpaceBefore(0.0); paragraph.setSpaceAfter(0.0); paragraph.setLineSpacing(120.0);
                cell.setFillColor(row == 0 ? seriesColor(0) : row % 2 == 0 || criterion ? Color.decode("#EEF0F2") : Color.WHITE);
                cell.setVerticalAlignment(VerticalAlignment.MIDDLE);
                cell.setLeftInset(5); cell.setRightInset(5);
                cell.setTopInset(2); cell.setBottomInset(2);
                for (var edge : BorderEdge.values()) {
                    cell.setBorderColor(edge, Color.decode("#D9DEE7"));
                    cell.setBorderWidth(edge, .5);
                }
            }
        }
    }

    private static void addKpi(XSLFSlide slide, DataBlock block, Rectangle2D anchor) {
        var background = slide.createAutoShape();
        background.setShapeType(org.apache.poi.sl.usermodel.ShapeType.RECT);
        background.setAnchor(anchor);
        background.setFillColor(Color.WHITE);
        background.setLineColor(null);
        // Fit the same undistorted 600x320 viewport used by the browser, even after resizing.
        double scale = Math.min(anchor.getWidth() / 600, anchor.getHeight() / 320);
        var content = new Rectangle2D.Double(anchor.getCenterX() - 300 * scale,
                anchor.getCenterY() - 160 * scale, 600 * scale, 320 * scale);
        var pair = block.rows().getFirst();
        addKpiText(slide, content, pair.get(1), 45, 150, 76, true);
        addKpiText(slide, content, pair.getFirst(), 205, 80, 28, false);
    }

    private static void addKpiText(XSLFSlide slide, Rectangle2D anchor, String source,
            double y, double height, double maxFont, boolean value) {
        String text = source.replaceAll("\\s+", " ");
        var box = slide.createTextBox();
        double scale = anchor.getWidth() / 600;
        box.setAnchor(new Rectangle2D.Double(anchor.getX() + 14 * scale,
                anchor.getY() + y * anchor.getHeight() / 320, 572 * scale, height * anchor.getHeight() / 320));
        box.setInsets(new org.apache.poi.sl.usermodel.Insets2D(0, 0, 0, 0));
        box.setWordWrap(false);
        box.setVerticalAlignment(VerticalAlignment.MIDDLE);
        var run = box.setText(text);
        run.setFontFamily("Arial"); run.setBold(value);
        run.setFontColor(value ? seriesColor(0) : Color.decode("#142033"));
        double font = Math.max(8, Math.min(maxFont, Math.min(572.0 /
                Math.max(1, text.codePointCount(0, text.length())) / .65, height / 1.3)));
        run.setFontSize(font * scale);
        var paragraph = box.getTextParagraphs().getFirst();
        paragraph.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        paragraph.setSpaceBefore(0.0); paragraph.setSpaceAfter(0.0);
    }

    /** Conservative wrapping estimate, also used by the browser, in pixels on a 960px slide. */
    private static double tableFontSize(DataBlock block) {
        double availableWidth = block.width() * 9.6 / block.headers().size() - 14;
        double availableHeight = block.height() * 5.4 / (block.rows().size() + 1) - 6;
        var cells = java.util.stream.Stream.concat(block.headers().stream(), block.rows().stream().flatMap(java.util.List::stream)).toList();
        for (double size = 18.5; size >= 8; size -= .5) {
            final double font = size;
            boolean fits = cells.stream().allMatch(cell -> {
                int lines = cell.lines().mapToInt(line -> Math.max(1,
                        (int) Math.ceil(line.codePointCount(0, line.length()) * font * .65 / availableWidth))).sum();
                return Math.max(1, lines) * font * 1.2 <= availableHeight;
            });
            if (fits) return size;
        }
        return 8;
    }

    private static void addChart(XMLSlideShow show, XSLFSlide slide, DataBlock block,
            Rectangle2D anchor) throws Exception {
        var chart = show.createChart(slide);
        chart.getOrAddShapeProperties().setFillProperties(new XDDFSolidFillProperties(
                XDDFColor.from(new byte[]{(byte) 255, (byte) 255, (byte) 255})));
        // Unlike table/text anchors, POI's addChart rectangle is expressed in EMUs, not points.
        slide.addChart(chart, new Rectangle2D.Double(org.apache.poi.util.Units.toEMU(anchor.getX()),
                org.apache.poi.util.Units.toEMU(anchor.getY()), org.apache.poi.util.Units.toEMU(anchor.getWidth()),
                org.apache.poi.util.Units.toEMU(anchor.getHeight())));
        // A recognizable name lets the PDF renderer handle only charts produced by GoDeck.
        // addChart updates XML, but POI's already-initialized getShapes() list is stale until reopen.
        var tree = slide.getXmlObject().getCSld().getSpTree();
        var xml = tree.getGraphicFrameArray(tree.sizeOfGraphicFrameArray() - 1);
        xml.getNvGraphicFramePr().getCNvPr().setName("godeck-" + block.type() + "-" + block.id());
        var sheet = chart.getWorkbook().getSheetAt(0);
        var header = sheet.createRow(0);
        for (int column = 0; column < block.headers().size(); column++)
            header.createCell(column).setCellValue(block.headers().get(column));
        for (int row = 0; row < block.rows().size(); row++) {
            var target = sheet.createRow(row + 1);
            target.createCell(0).setCellValue(block.rows().get(row).getFirst());
            for (int column = 1; column < block.headers().size(); column++)
                target.createCell(column).setCellValue(DataBlock.number(block.rows().get(row).get(column)));
        }
        var data = createChartData(chart, block);
        int last = block.rows().size();
        var labels = XDDFDataSourcesFactory.fromStringCellRange(sheet, new CellRangeAddress(1, last, 0, 0));
        for (int column = 1; column < block.headers().size(); column++) {
            var series = data.addSeries(labels, XDDFDataSourcesFactory.fromNumericCellRange(sheet,
                    new CellRangeAddress(1, last, column, column)));
            series.setTitle(block.headers().get(column), new CellReference(sheet.getSheetName(), 0, column, true, true));
            var color = seriesColor(column - 1);
            var properties = new XDDFShapeProperties();
            properties.setFillProperties(new XDDFSolidFillProperties(XDDFColor.from(
                    new byte[]{(byte) color.getRed(), (byte) color.getGreen(), (byte) color.getBlue()})));
            if (series instanceof XDDFLineChartData.Series line) {
                var stroke = new XDDFLineProperties();
                stroke.setFillProperties(properties.getFillProperties());
                stroke.setWidth(2.5); properties.setLineProperties(stroke);
                line.setSmooth(false); line.setMarkerStyle(MarkerStyle.CIRCLE); line.setMarkerSize((short) 6);
            }
            if (series instanceof XDDFDoughnutChartData.Series ring) {
                for (int index = 0; index < block.rows().size(); index++) {
                    var point = ring.getCTPieSer().addNewDPt();
                    point.addNewIdx().setVal(index);
                    var fill = seriesColor(index);
                    point.addNewSpPr().addNewSolidFill().addNewSrgbClr().setVal(
                            new byte[]{(byte) fill.getRed(), (byte) fill.getGreen(), (byte) fill.getBlue()});
                }
            }
            series.setShapeProperties(properties);
        }
        chart.getOrAddLegend().setPosition(block.type().equals("doughnut") ? LegendPosition.RIGHT : LegendPosition.BOTTOM);
        chart.plot(data);
    }

    /** Cartesian charts share axes; a distribution has a single series and no axes. */
    private static XDDFChartData createChartData(org.apache.poi.xslf.usermodel.XSLFChart chart, DataBlock block) {
        if (block.type().equals("doughnut")) {
            var ring = (XDDFDoughnutChartData) chart.createData(ChartTypes.DOUGHNUT, null, null);
            // OOXML measures clockwise from twelve o'clock, matching the browser and PDF.
            ring.setHoleSize(62); ring.setFirstSliceAngle(0); ring.setVaryColors(true);
            return ring;
        }
        boolean horizontal = block.type().equals("bar") && block.horizontal();
        var categories = chart.createCategoryAxis(horizontal ? AxisPosition.LEFT : AxisPosition.BOTTOM);
        var values = chart.createValueAxis(horizontal ? AxisPosition.BOTTOM : AxisPosition.LEFT);
        var summary = block.rows().stream().flatMap(row -> row.stream().skip(1)).mapToDouble(DataBlock::number).summaryStatistics();
        double min = Math.min(0, summary.getMin()), max = Math.max(0, summary.getMax());
        if (min == max) max = min + 1;
        values.setMinimum(min); values.setMaximum(max); values.setMajorUnit((max - min) / 4);
        for (var axis : java.util.List.of(categories, values)) {
            axis.getOrAddTextProperties().setFontSize(10.0);
            axis.getOrAddTextProperties().setFillProperties(new XDDFSolidFillProperties(XDDFColor.from(new byte[]{20, 32, 51})));
        }
        if (horizontal) categories.setOrientation(AxisOrientation.MAX_MIN);
        categories.crossAxis(values); values.crossAxis(categories);
        values.setCrosses(AxisCrosses.AUTO_ZERO);
        values.setCrossBetween(block.type().equals("line") ? AxisCrossBetween.MIDPOINT_CATEGORY : AxisCrossBetween.BETWEEN);
        XDDFChartData data;
        if (block.type().equals("line")) {
            var lines = (XDDFLineChartData) chart.createData(ChartTypes.LINE, categories, values);
            lines.setGrouping(Grouping.STANDARD);
            data = lines;
        } else {
            var bars = (XDDFBarChartData) chart.createData(ChartTypes.BAR, categories, values);
            bars.setBarDirection(horizontal ? BarDirection.BAR : BarDirection.COL);
            bars.setBarGrouping(BarGrouping.CLUSTERED);
            data = bars;
        }
        data.setVaryColors(false);
        return data;
    }
}
