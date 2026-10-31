package ru.godeck.presentation.model;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** A table or grouped bar chart. Both views use the same editable rectangular dataset. */
public record DataBlock(String id, String type, double x, double y, double width, double height,
        List<String> headers, List<List<String>> rows, boolean horizontal) {
    public static final int MAX_BLOCKS = 10;
    public static final int MAX_ROWS = 12;
    public static final int MAX_COLUMNS = 6;
    public static final int MAX_CELL_LENGTH = 160;
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,119}");
    private static final Pattern NUMBER = Pattern.compile("[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?");

    /** Rejects malformed or unbounded datasets before storage, AI application, or file rendering. */
    public DataBlock validated() {
        if (id == null || !ID.matcher(id).matches() || !Set.of("table", "bar").contains(type)
                || !Double.isFinite(x) || !Double.isFinite(y)
                || !Double.isFinite(width) || !Double.isFinite(height)
                || x < 0 || y < 0 || width < 20 || height < 15
                || x + width > 100.001 || y + height > 100.001
                || headers == null || headers.size() < 2 || headers.size() > MAX_COLUMNS
                || rows == null || rows.isEmpty() || rows.size() > MAX_ROWS)
            throw new IllegalArgumentException("Invalid data block");
        headers.forEach(DataBlock::validateCell);
        for (var row : rows) {
            if (row == null || row.size() != headers.size())
                throw new IllegalArgumentException("Unequal data columns");
            row.forEach(DataBlock::validateCell);
            if (type.equals("bar")) for (int column = 1; column < row.size(); column++) number(row.get(column));
        }
        return new DataBlock(id, type, x, y, width, height,
                List.copyOf(headers), rows.stream().map(List::copyOf).toList(), horizontal);
    }

    /** Numbers have no locale-specific separators, units, formulas, or non-finite values. */
    public static double number(String value) {
        if (value == null || !NUMBER.matcher(value.strip()).matches())
            throw new IllegalArgumentException("Invalid chart value");
        double number = Double.parseDouble(value);
        if (!Double.isFinite(number) || Math.abs(number) > 1e12)
            throw new IllegalArgumentException("Invalid chart value");
        return number;
    }

    private static void validateCell(String value) {
        if (value == null || value.length() > MAX_CELL_LENGTH)
            throw new IllegalArgumentException("Invalid table cell");
    }

}
