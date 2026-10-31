package ru.godeck.presentation.template;

import org.apache.poi.sl.usermodel.TextParagraph.TextAlign;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import ru.godeck.presentation.model.TextStyle;

import java.awt.Color;

/** Applies the same explicit text-box formatting for editor projection and PPTX export. */
final class TemplateTextStyles {
    private TemplateTextStyles() {}

    static void apply(XSLFTextShape shape, TextStyle style, double pageWidth) {
        if (style == null) return;
        style.validate();
        for (var paragraph : shape.getTextParagraphs()) {
            if (style.align() != null) {
                paragraph.setTextAlign(switch (style.align()) {
                    case "center" -> TextAlign.CENTER;
                    case "right" -> TextAlign.RIGHT;
                    default -> TextAlign.LEFT;
                });
            }
            for (var run : paragraph.getTextRuns()) {
                if (style.fontFamily() != null) run.setFontFamily(style.fontFamily());
                if (style.fontSize() != null) run.setFontSize(style.fontSize() * pageWidth / 960.0);
                if (style.weight() != null) run.setBold(style.weight() >= 700);
                if (style.color() != null) run.setFontColor(Color.decode(style.color()));
                if (style.italic() != null) run.setItalic(style.italic());
                if (style.underline() != null) run.setUnderlined(style.underline());
            }
        }
    }
}
