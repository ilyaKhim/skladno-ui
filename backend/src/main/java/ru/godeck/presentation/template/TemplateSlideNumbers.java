package ru.godeck.presentation.template;

import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextShape;

import java.util.Optional;

/** Recognizes the explicit Folio element in our bundled templates, never arbitrary numeric content. */
public final class TemplateSlideNumbers {
    private TemplateSlideNumbers() {}

    public static Optional<XSLFTextShape> find(XSLFSlide slide) {
        return TemplateShapes.allShapes(slide.getShapes()).stream()
                .filter(XSLFTextShape.class::isInstance)
                .map(XSLFTextShape.class::cast)
                .filter(shape -> "Folio".equals(shape.getShapeName()) && shape.getText().strip().matches("\\d{1,3}"))
                .findFirst();
    }

    /** Replaces the number without resetting the template's font, color, or position. */
    public static void apply(XSLFSlide slide, int position) {
        find(slide).ifPresent(shape -> {
            String number = String.format(java.util.Locale.ROOT, "%0" + shape.getText().strip().length() + "d", position);
            boolean first = true;
            for (var paragraph : shape.getTextParagraphs()) {
                for (var run : paragraph.getTextRuns()) {
                    run.setText(first ? number : "");
                    first = false;
                }
            }
        });
    }
}
