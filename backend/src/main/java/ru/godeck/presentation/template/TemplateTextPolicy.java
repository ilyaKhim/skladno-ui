package ru.godeck.presentation.template;

final class TemplateTextPolicy {
    static final double DEFAULT_FONT_POINTS = 20;
    static final double AVERAGE_CHARACTER_WIDTH_EM = 0.55;
    static final double LINE_HEIGHT_EM = 1.3;
    static final int FALLBACK_FIELD_LENGTH = 100;
    static final int MIN_FIELD_LENGTH = 12;
    static final int MAX_FIELD_LENGTH = 600;
    static final int MIN_LENGTH_FOR_ELLIPSIS = 3;
    static final double WORD_BOUNDARY_MINIMUM_FRACTION = 0.5;

    private TemplateTextPolicy() {}
}
