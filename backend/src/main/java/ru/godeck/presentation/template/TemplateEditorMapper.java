package ru.godeck.presentation.template;

import ru.godeck.presentation.editor.EditorTextLimits;

import static ru.godeck.presentation.template.TemplateShapes.allShapes;
import static ru.godeck.presentation.template.TemplateShapes.pageBounds;
import static ru.godeck.presentation.template.TemplateShapes.textLayoutId;
import static ru.godeck.presentation.template.TemplateShapes.TOKEN;

import org.apache.poi.sl.usermodel.PaintStyle;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.apache.poi.xslf.usermodel.XSLFTextShape;

import ru.godeck.presentation.editor.dto.EditorDeckView;
import ru.godeck.presentation.model.PresentationContent;

import java.awt.Color;
import java.awt.geom.Rectangle2D;
import java.util.ArrayList;
import java.util.function.Function;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;

/** Projects the same source shapes into browser blocks, preserving layout IDs and paragraph metrics. */
final class TemplateEditorMapper {
    private final TemplateCatalog catalog;

    TemplateEditorMapper(TemplateCatalog catalog) {
        this.catalog = catalog;
    }

    /**
     * Builds the browser editor projection from the same template and semantic snapshot used for
     * export.
     *
     * <p>Template marker shapes become editable text blocks with percentage geometry; user-created
     * blocks are appended unchanged. Using one projection method prevents the canvas and exported
     * PPTX from developing different coordinate systems or shape identities.
     */
    EditorDeckView editorDeck(
            String templateId,
            java.util.UUID presentationId,
            String title,
            int baseVersion,
            long draftRevision,
            Map<Integer, String> slideNames,
            PresentationContent content)
            throws Exception {
        PresentationContent plan = catalog.normalizeEditor(templateId, content);
        try (XMLSlideShow show = catalog.open(templateId)) {
            var page = pageBounds(show);
            List<EditorDeckView.Slide> slides = new ArrayList<>();
            for (var decision : plan.slides()) {
                if (!Boolean.TRUE.equals(decision.include())) continue;
                int source = decision.slide();
                XSLFSlide slide = show.getSlides().get(source - 1);
                List<EditorDeckView.TextBlock> blocks = new ArrayList<>();
                Map<String, Integer> occurrences = new LinkedHashMap<>();
                Map<String, PresentationContent.TextLayout> layoutOverrides =
                        decision.textLayoutsOrEmpty().stream()
                                .collect(
                                        java.util.stream.Collectors.toMap(
                                                PresentationContent.TextLayout::id,
                                                Function.identity()));
                int layoutIndex = 0;
                for (XSLFShape shape : allShapes(slide.getShapes())) {
                    if (!(shape instanceof XSLFTextShape textShape)) continue;
                    List<XSLFTextParagraph> editableParagraphs =
                            textShape.getTextParagraphs().stream()
                                    .filter(paragraph -> TOKEN.matcher(paragraph.getText()).find())
                                    .toList();
                    if (editableParagraphs.isEmpty()) continue;
                    String layoutId = textLayoutId(source, ++layoutIndex);
                    PresentationContent.TextLayout override = layoutOverrides.get(layoutId);
                    if (override != null) TemplateTextStyles.apply(textShape, override.textStyle(), page.getWidth());
                    Rectangle2D anchor = textShape.getAnchor();
                    double x =
                            override != null
                                    ? override.x()
                                    : anchor == null ? 8 : percent(anchor.getX(), page.getWidth());
                    double y =
                            override != null
                                    ? override.y()
                                    : anchor == null
                                            ? 8 + blocks.size() * 8
                                            : percent(anchor.getY(), page.getHeight());
                    double width =
                            override != null
                                    ? override.width()
                                    : anchor == null
                                            ? 84
                                            : percent(anchor.getWidth(), page.getWidth());
                    double height =
                            override != null
                                    ? override.height()
                                    : anchor == null
                                            ? 7
                                            : percent(anchor.getHeight(), page.getHeight());
                    int paragraphIndex = 0;
                    for (XSLFTextParagraph paragraph : editableParagraphs) {
                        Matcher matcher = TOKEN.matcher(paragraph.getText());
                        XSLFTextRun run = firstRun(paragraph);
                        double pixelsPerPoint = 960.0 / page.getWidth();
                        int renderedFontSize = fontSize(run, pixelsPerPoint);
                        var paragraphStyle =
                                paragraphStyle(paragraph, paragraphIndex++, renderedFontSize, pixelsPerPoint);
                        while (matcher.find()) {
                            String field = matcher.group(1);
                            int occurrence = occurrences.merge(field, 1, Integer::sum);
                            String role = role(field);
                            int maxChars = catalog.fields(templateId).get(field);
                            blocks.add(
                                    new EditorDeckView.TextBlock(
                                            "slide-"
                                                    + source
                                                    + "-field-"
                                                    + field
                                                    + "-"
                                                    + occurrence,
                                            field,
                                            layoutId,
                                            maxChars,
                                            EditorTextLimits.hard(maxChars),
                                            role,
                                            plan.fields().get(field),
                                            x,
                                            y,
                                            width,
                                            height,
                                            renderedFontSize,
                                            run != null && run.isBold() ? 700 : 400,
                                            alignment(paragraph),
                                            color(role),
                                            run == null ? null : paintColor(run.getFontColor()),
                                            paragraphStyle,
                                            run == null ? null : run.getFontFamily(),
                                            run != null && run.isItalic(),
                                            run != null && run.isUnderlined(),
                                            override == null ? null : override.textStyle()));
                        }
                    }
                }
                for (var block : decision.textBlocksOrEmpty()) {
                    blocks.add(
                            new EditorDeckView.TextBlock(
                                    block.id(),
                                    null,
                                    null,
                                    EditorTextLimits.ABSOLUTE_MAX,
                                    EditorTextLimits.ABSOLUTE_MAX,
                                    "body",
                                    block.text(),
                                    block.x(),
                                    block.y(),
                                    block.width(),
                                    block.height(),
                                    block.fontSize(),
                                    block.weight(),
                                    block.align(),
                                    block.color(),
                                    null,
                                    null,
                                    block.textStyle() == null ? "Arial" : block.textStyle().fontFamily(),
                                    block.textStyle() != null && Boolean.TRUE.equals(block.textStyle().italic()),
                                    block.textStyle() != null && Boolean.TRUE.equals(block.textStyle().underline()),
                                    block.textStyle()));
                }
                List<EditorDeckView.ImageBlock> images =
                        decision.imageBlocksOrEmpty().stream()
                                .map(
                                        image ->
                                                new EditorDeckView.ImageBlock(
                                                        image.id(),
                                                        image.assetId(),
                                                        "/api/generation/v1/presentations/"
                                                                + presentationId
                                                                + "/editor/assets/"
                                                                + image.assetId(),
                                                        image.alt(),
                                                        image.x(),
                                                        image.y(),
                                                        image.width(),
                                                        image.height()))
                                .toList();
                slides.add(
                        new EditorDeckView.Slide(
                                "slide-" + source,
                                source,
                                slideNames.getOrDefault(source, "Слайд " + source),
                                "monolith".equals(templateId) ? "navy" : "paper",
                                catalog.backgroundUrl(templateId, source),
                                decision.hiddenOrFalse(),
                                List.copyOf(blocks),
                                images,
                                slideNumber(slide, page),
                                decision.dataBlocksOrEmpty()));
            }
            return new EditorDeckView(
                    presentationId,
                    title,
                    baseVersion,
                    draftRevision,
                    new EditorDeckView.SlideSize(960, 540),
                    List.copyOf(slides));
        }
    }

    private static EditorDeckView.SlideNumber slideNumber(XSLFSlide slide, Rectangle2D page) {
        var shape = TemplateSlideNumbers.find(slide).orElse(null);
        if (shape == null || shape.getAnchor() == null || shape.getTextParagraphs().isEmpty()) return null;
        var anchor = shape.getAnchor();
        var paragraph = shape.getTextParagraphs().getFirst();
        var run = firstRun(paragraph);
        double points = run == null || run.getFontSize() == null ? 8 : run.getFontSize();
        return new EditorDeckView.SlideNumber(percent(anchor.getX(), page.getWidth()),
                percent(anchor.getY(), page.getHeight()), percent(anchor.getWidth(), page.getWidth()),
                percent(anchor.getHeight(), page.getHeight()), points * 960 / page.getWidth(),
                run == null ? null : run.getFontFamily(), run == null ? null : paintColor(run.getFontColor()),
                run != null && run.isBold() ? 700 : 400, alignment(paragraph), shape.getText().strip().length());
    }

    private static XSLFTextRun firstRun(XSLFTextParagraph paragraph) {
        return paragraph.getTextRuns().stream().findFirst().orElse(null);
    }

    private static int fontSize(XSLFTextRun run, double pixelsPerPoint) {
        double points = run == null || run.getFontSize() == null ? 14 : run.getFontSize();
        return Math.clamp((int) Math.round(points * pixelsPerPoint), 8, 96);
    }

    /**
     * Converts the paragraph metrics that affect browser flow without leaking POI types into the
     * public editor contract. PowerPoint reports percentage line spacing as positive values and
     * absolute point spacing as negative values; the browser receives a unitless line-height plus
     * canonical-slide pixels.
     */
    private static EditorDeckView.ParagraphStyle paragraphStyle(
            XSLFTextParagraph paragraph, int index, int fontSize, double pixelsPerPoint) {
        return new EditorDeckView.ParagraphStyle(
                index,
                paragraph.isBullet() ? paragraph.getBulletCharacter() : null,
                paintColor(paragraph.getBulletFontColor()),
                lineHeight(paragraph.getLineSpacing(), fontSize, pixelsPerPoint),
                spacingPixels(paragraph.getSpaceBefore(), fontSize, pixelsPerPoint),
                spacingPixels(paragraph.getSpaceAfter(), fontSize, pixelsPerPoint),
                pointsPixels(paragraph.getLeftMargin(), pixelsPerPoint),
                pointsPixels(paragraph.getIndent(), pixelsPerPoint));
    }

    private static Double lineHeight(Double spacing, int fontSize, double pixelsPerPoint) {
        if (spacing == null) return null;
        double value = spacing >= 0 ? spacing / 100 : (-spacing * pixelsPerPoint) / fontSize;
        return Math.round(Math.max(0.5, value) * 100.0) / 100.0;
    }

    private static double spacingPixels(Double spacing, int fontSize, double pixelsPerPoint) {
        if (spacing == null) return 0;
        double value = spacing >= 0 ? fontSize * spacing / 100 : -spacing * pixelsPerPoint;
        return Math.round(value * 100.0) / 100.0;
    }

    private static double pointsPixels(Double points, double pixelsPerPoint) {
        if (points == null) return 0;
        return Math.round(points * pixelsPerPoint * 100.0) / 100.0;
    }

    private static String paintColor(PaintStyle paint) {
        if (!(paint instanceof PaintStyle.SolidPaint solid)
                || solid.getSolidColor() == null
                || solid.getSolidColor().getColor() == null) return null;
        Color color = solid.getSolidColor().getColor();
        return String.format("#%02x%02x%02x", color.getRed(), color.getGreen(), color.getBlue());
    }

    private static double percent(double value, double total) {
        return Math.round(value / total * 10_000.0) / 100.0;
    }

    private static String alignment(XSLFTextParagraph paragraph) {
        if (paragraph == null || paragraph.getTextAlign() == null) return "left";
        return switch (paragraph.getTextAlign()) {
            case CENTER -> "center";
            case RIGHT -> "right";
            default -> "left";
        };
    }

    private static String role(String field) {
        if (field.contains("VALUE") || field.matches(".*(?:METRIC|NUM)_?\\d*$")) return "metric";
        if (field.contains("SUBTITLE") || field.contains("INTRO")) return "subtitle";
        if (field.contains("TITLE") || field.equals("STATEMENT")) return "title";
        if (field.contains("FOOTER")
                || field.contains("AUTHOR")
                || field.contains("CONTACT")
                || field.contains("CAPTION")) return "caption";
        return "body";
    }

    private static String color(String role) {
        return switch (role) {
            case "metric" -> "brand";
            case "caption" -> "muted";
            default -> "ink";
        };
    }

}
