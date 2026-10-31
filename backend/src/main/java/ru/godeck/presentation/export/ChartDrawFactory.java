package ru.godeck.presentation.export;

import org.apache.poi.sl.draw.DrawFactory;
import org.apache.poi.sl.draw.DrawGraphicalFrame;
import org.apache.poi.sl.usermodel.GraphicalFrame;
import org.apache.poi.xddf.usermodel.chart.BarDirection;
import org.apache.poi.xddf.usermodel.chart.XDDFBarChartData;
import org.apache.poi.xslf.usermodel.XSLFGraphicFrame;
import ru.godeck.presentation.template.DataBlockRenderer;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.geom.Rectangle2D;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/** POI does not paint native charts. Paint our grouped bars in-place, preserving slide z-order. */
final class ChartDrawFactory extends DrawFactory {
    @Override
    public DrawGraphicalFrame getDrawable(GraphicalFrame<?, ?> shape) {
        if (!(shape instanceof XSLFGraphicFrame frame) || !frame.getShapeName().startsWith("godeck-bar-")
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
        var data = (XDDFBarChartData) chart.getChartSeries().getFirst();
        var anchor = frame.getAnchor();
        graphics.translate(anchor.getX(), anchor.getY());
        graphics.scale(anchor.getWidth() / 600, anchor.getHeight() / 320);
        graphics.setClip(0, 0, 600, 320);
        graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, 600, 320);
        graphics.setFont(new Font("Arial", Font.PLAIN, 12));
        boolean horizontal = data.getBarDirection() == BarDirection.BAR;
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
        for (int row = 0; row < count; row++) {
            String label = String.valueOf(data.getSeries(0).getCategoryData().getPointAt(row));
            graphics.setColor(Color.decode("#142033"));
            int limit = horizontal ? 14 : Math.max(2, Math.min(14, (int) (group / 7)));
            String shortLabel = label.length() > limit ? label.substring(0, limit - 1) + "…" : label;
            graphics.drawString(shortLabel, horizontal ? 3 : (float) (left + group * row),
                    horizontal ? (float) (top + group * (row + .55)) : 282);
            for (int series = 0; series < data.getSeriesCount(); series++) {
                double value = data.getSeries(series).getValuesData().getPointAt(row).doubleValue();
                double zero = (0 - min) / (max - min), end = (value - min) / (max - min);
                graphics.setColor(DataBlockRenderer.seriesColor(series));
                graphics.fill(horizontal
                        ? new Rectangle2D.Double(left + Math.min(zero, end) * width,
                                top + row * group + group * .15 + series * barSize,
                                Math.abs(end - zero) * width, barSize)
                        : new Rectangle2D.Double(left + row * group + group * .15 + series * barSize,
                                top + (1 - Math.max(zero, end)) * height,
                                barSize, Math.abs(end - zero) * height));
            }
        }
        var seriesXml = chart.getCTChart().getPlotArea().getBarChartArray(0);
        for (int series = 0; series < data.getSeriesCount(); series++) {
            int x = 12 + series * 118;
            graphics.setColor(DataBlockRenderer.seriesColor(series)); graphics.fillRect(x, 304, 9, 9);
            graphics.setColor(Color.decode("#142033"));
            var title = seriesXml.getSerArray(series).getTx();
            String text = title.isSetV() ? title.getV() : title.getStrRef().getStrCache().getPtArray(0).getV();
            graphics.drawString(text.length() > 14 ? text.substring(0, 13) + "…" : text, x + 14, 313);
        }
    }

    private static String formatValue(double value) {
        if (value == 0) return "0";
        if (Math.abs(value) < .01 || Math.abs(value) >= 1e6)
            return new DecimalFormat("0.##E0", DecimalFormatSymbols.getInstance(Locale.ROOT)).format(value).replace('E', 'e');
        return java.math.BigDecimal.valueOf(value).round(new java.math.MathContext(3)).stripTrailingZeros().toPlainString();
    }
}
