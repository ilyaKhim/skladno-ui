package ru.godeck.presentation.export;

import org.apache.poi.sl.draw.DrawFactory;
import org.apache.poi.sl.draw.DrawGraphicalFrame;
import org.apache.poi.sl.usermodel.GraphicalFrame;
import org.apache.poi.xddf.usermodel.chart.BarDirection;
import org.apache.poi.xddf.usermodel.chart.XDDFBarChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFLineChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFDoughnutChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFChartData;
import org.apache.poi.xslf.usermodel.XSLFGraphicFrame;
import ru.godeck.presentation.template.DataBlockRenderer;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.geom.Rectangle2D;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/** POI does not paint native charts. Paint only GoDeck charts, preserving slide z-order. */
final class ChartDrawFactory extends DrawFactory {
    @Override
    public DrawGraphicalFrame getDrawable(GraphicalFrame<?, ?> shape) {
        if (!(shape instanceof XSLFGraphicFrame frame) || !frame.getShapeName().matches("godeck-(bar|line|doughnut)-.*")
                || !frame.hasChart()) return super.getDrawable(shape);
        return new DrawGraphicalFrame(shape) {
            @Override public void draw(Graphics2D graphics) {
                var copy = (Graphics2D) graphics.create();
                try { paint(copy, frame); } finally { copy.dispose(); }
            }
        };
    }

    private static void paint(Graphics2D graphics, XSLFGraphicFrame frame) {
        var chart = frame.getChart();
        var data = chart.getChartSeries().getFirst();
        var anchor = frame.getAnchor();
        graphics.translate(anchor.getX(), anchor.getY());
        if (data instanceof XDDFDoughnutChartData) {
            graphics.setColor(Color.WHITE); graphics.fill(new Rectangle2D.Double(0, 0, anchor.getWidth(), anchor.getHeight()));
            double scale = Math.min(anchor.getWidth() / 600, anchor.getHeight() / 320);
            graphics.translate((anchor.getWidth() - 600 * scale) / 2, (anchor.getHeight() - 320 * scale) / 2);
            graphics.scale(scale, scale);
            paintDoughnut(graphics, data);
            return;
        }
        graphics.scale(anchor.getWidth() / 600, anchor.getHeight() / 320);
        graphics.setClip(0, 0, 600, 320);
        graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, 600, 320);
        graphics.setFont(new Font("Arial", Font.PLAIN, 12));
        boolean horizontal = data instanceof XDDFBarChartData bars && bars.getBarDirection() == BarDirection.BAR;
        boolean line = data instanceof XDDFLineChartData;
        int count = data.getSeries(0).getCategoryData().getPointCount();
        double min = 0, max = 0;
        for (int series = 0; series < data.getSeriesCount(); series++)
            for (int row = 0; row < count; row++) {
                double value = data.getSeries(series).getValuesData().getPointAt(row).doubleValue();
                min = Math.min(min, value); max = Math.max(max, value);
            }
        if (min == max) max = min + 1;
        double left = horizontal ? 110 : 65, top = 15, width = horizontal ? 460 : 505, height = 250;
        for (int tick = 0; tick <= 4; tick++) {
            double fraction = tick / 4.0;
            double value = min + fraction * (max - min);
            graphics.setColor(Color.decode("#D9DEE7"));
            if (horizontal) {
                int x = (int) (left + fraction * width);
                graphics.drawLine(x, (int) top, x, (int) (top + height));
                graphics.setColor(Color.decode("#5B6675")); graphics.drawString(formatValue(value), x - 10, 282);
            } else {
                int y = (int) (top + (1 - fraction) * height);
                graphics.drawLine((int) left, y, (int) (left + width), y);
                graphics.setColor(Color.decode("#5B6675")); graphics.drawString(formatValue(value), 3, y + 4);
            }
        }
        double group = (horizontal ? height : width) / count;
        double barSize = group * .7 / data.getSeriesCount();
        if (line) {
            graphics.setStroke(new java.awt.BasicStroke(2.5f));
            for (int series = 0; series < data.getSeriesCount(); series++) {
                var path = new java.awt.geom.Path2D.Double();
                for (int row = 0; row < count; row++) {
                    double x = left + (count == 1 ? width / 2 : row * width / (count - 1));
                    double y = top + (1 - (data.getSeries(series).getValuesData().getPointAt(row).doubleValue() - min) / (max - min)) * height;
                    if (row == 0) path.moveTo(x, y); else path.lineTo(x, y);
                }
                graphics.setColor(DataBlockRenderer.seriesColor(series)); graphics.draw(path);
            }
        }
        for (int row = 0; row < count; row++) {
            String label = String.valueOf(data.getSeries(0).getCategoryData().getPointAt(row));
            graphics.setColor(Color.decode("#142033"));
            int limit = horizontal ? 14 : Math.max(2, Math.min(14, (int) (group / 7)));
            String shortLabel = label.length() > limit ? label.substring(0, limit - 1) + "…" : label;
            double pointX = left + (count == 1 ? width / 2 : row * width / (count - 1));
            double labelX = horizontal ? 3 : left + group * row;
            if (line) labelX = pointX - graphics.getFontMetrics().stringWidth(shortLabel) *
                    (count == 1 ? .5 : row == 0 ? 0 : row == count - 1 ? 1 : .5);
            graphics.drawString(shortLabel, (float) labelX,
                    horizontal ? (float) (top + group * (row + .55)) : 282);
            for (int series = 0; series < data.getSeriesCount(); series++) {
                double value = data.getSeries(series).getValuesData().getPointAt(row).doubleValue();
                double zero = (0 - min) / (max - min), end = (value - min) / (max - min);
                graphics.setColor(DataBlockRenderer.seriesColor(series));
                if (line) {
                    graphics.fill(new java.awt.geom.Ellipse2D.Double(pointX - 3.5, top + (1 - end) * height - 3.5, 7, 7));
                    continue;
                }
                graphics.fill(horizontal
                        ? new Rectangle2D.Double(left + Math.min(zero, end) * width,
                                top + row * group + group * .15 + series * barSize,
                                Math.abs(end - zero) * width, barSize)
                        : new Rectangle2D.Double(left + row * group + group * .15 + series * barSize,
                                top + (1 - Math.max(zero, end)) * height,
                                barSize, Math.abs(end - zero) * height));
            }
        }
        for (int series = 0; series < data.getSeriesCount(); series++) {
            int x = 12 + series * 118;
            graphics.setColor(DataBlockRenderer.seriesColor(series)); graphics.fillRect(x, 304, 9, 9);
            graphics.setColor(Color.decode("#142033"));
            var plot = chart.getCTChart().getPlotArea();
            var title = line ? plot.getLineChartArray(0).getSerArray(series).getTx() : plot.getBarChartArray(0).getSerArray(series).getTx();
            String text = title.isSetV() ? title.getV() : title.getStrRef().getStrCache().getPtArray(0).getV();
            graphics.drawString(text.length() > 14 ? text.substring(0, 13) + "…" : text, x + 14, 313);
        }
    }

    private static void paintDoughnut(Graphics2D graphics, XDDFChartData data) {
        graphics.setClip(0, 0, 600, 320);
        graphics.setFont(new Font("Arial", Font.PLAIN, 12));
        var series = data.getSeries(0);
        int count = series.getCategoryData().getPointCount();
        double total = java.util.stream.IntStream.range(0, count)
                .mapToDouble(index -> series.getValuesData().getPointAt(index).doubleValue()).sum();
        double start = 90;
        for (int row = 0; row < count; row++) {
            double fraction = series.getValuesData().getPointAt(row).doubleValue() / total;
            graphics.setColor(DataBlockRenderer.seriesColor(row));
            // SVG uses a stroked circle; Arc2D uses the same outer radius and clockwise angles.
            graphics.fill(new java.awt.geom.Arc2D.Double(29, 24, 272, 272, start, -360 * fraction, java.awt.geom.Arc2D.PIE));
            start -= 360 * fraction;
            graphics.fillRect(320, 22 + row * 23, 9, 9);
            String label = String.valueOf(series.getCategoryData().getPointAt(row));
            if (label.length() > 22) label = label.substring(0, 21) + "…";
            graphics.setColor(Color.decode("#142033"));
            graphics.drawString(label + ": " + formatValue(fraction * 100) + "%", 337, 31 + row * 23);
        }
        graphics.setColor(Color.WHITE);
        graphics.fill(new java.awt.geom.Ellipse2D.Double(81, 76, 168, 168));
    }

    private static String formatValue(double value) {
        if (value == 0) return "0";
        if (Math.abs(value) < .01 || Math.abs(value) >= 1e6)
            return new DecimalFormat("0.##E0", DecimalFormatSymbols.getInstance(Locale.ROOT)).format(value).replace('E', 'e');
        return java.math.BigDecimal.valueOf(value).round(new java.math.MathContext(3)).stripTrailingZeros().toPlainString();
    }
}
