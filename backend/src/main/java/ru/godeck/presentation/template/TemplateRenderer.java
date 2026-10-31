package ru.godeck.presentation.template;

import static ru.godeck.presentation.template.TemplateShapes.allShapes;
import static ru.godeck.presentation.template.TemplateShapes.pageBounds;
import static ru.godeck.presentation.template.TemplateShapes.textLayoutId;
import static ru.godeck.presentation.template.TemplateShapes.TOKEN;

import org.apache.poi.sl.usermodel.PictureData;
import org.apache.poi.sl.usermodel.TextParagraph.TextAlign;
import org.apache.poi.sl.usermodel.VerticalAlignment;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.apache.poi.xslf.usermodel.XSLFTextShape;

import ru.godeck.presentation.model.PresentationContent;

import java.awt.Color;
import java.awt.geom.Rectangle2D;
import java.io.ByteArrayOutputStream;
import java.util.function.Function;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;

/** Mutates a fresh PPTX copy; never changes the cached template or editor metadata. */
final class TemplateRenderer {
    private final TemplateCatalog catalog;
    private static final String UNKNOWN_FIELD_PREFIX = "Unknown template field ";

    TemplateRenderer(TemplateCatalog catalog) {
        this.catalog = catalog;
    }

    /**
     * Renders with an explicit length policy for template field text.
     * The editor export uses {@link TextLengthMode#ALLOW_OVERFLOW} so the
     * PPTX contains the full text the user saved.
     */
    byte[] render(
            String id,
            PresentationContent content,
            Function<String, byte[]> imageResolver,
            TextLengthMode mode)
            throws Exception {
        PresentationContent plan = catalog.normalize(id, content, mode);
        Map<String, String> normalized = plan.fields();
        try (XMLSlideShow show = catalog.open(id)) {
            Map<Integer, XSLFSlide> bySourceNumber = new LinkedHashMap<>();
            for (int i = 0; i < show.getSlides().size(); i++)
                bySourceNumber.put(i + 1, show.getSlides().get(i));
            var included =
                    plan.slides().stream()
                            .filter(s -> Boolean.TRUE.equals(s.include()))
                            .map(PresentationContent.Slide::slide)
                            .collect(java.util.stream.Collectors.toSet());
            for (int i = show.getSlides().size() - 1; i >= 0; i--)
                if (!included.contains(i + 1)) show.removeSlide(i);
            int order = 0;
            for (var decision : plan.slides()) {
                if (!Boolean.TRUE.equals(decision.include())) continue;
                XSLFSlide slide = bySourceNumber.get(decision.slide());
                show.setSlideOrder(slide, order++);
                slide.setHidden(decision.hiddenOrFalse());
            }
            for (var decision : plan.slides()) {
                if (!Boolean.TRUE.equals(decision.include())) continue;
                XSLFSlide slide = bySourceNumber.get(decision.slide());
                applyTextLayouts(
                        slide,
                        decision.slide(),
                        decision.textLayoutsOrEmpty(),
                        pageBounds(show).getWidth(),
                        pageBounds(show).getHeight());
                for (XSLFShape shape : allShapes(slide.getShapes())) {
                    if (shape instanceof XSLFTextShape textShape) {
                        for (XSLFTextParagraph paragraph : textShape.getTextParagraphs()) {
                            replaceParagraph(paragraph, normalized);
                        }
                    }
                }
            }
            var page = pageBounds(show);
            for (var decision : plan.slides()) {
                if (!Boolean.TRUE.equals(decision.include())) continue;
                XSLFSlide slide = bySourceNumber.get(decision.slide());
                for (var block : decision.textBlocksOrEmpty()) {
                    addTextBlock(slide, block, page.getWidth(), page.getHeight(), id);
                }
                for (var image : decision.imageBlocksOrEmpty()) {
                    addImageBlock(
                            show,
                            slide,
                            image,
                            page.getWidth(),
                            page.getHeight(),
                            imageResolver);
                }
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            show.write(output);
            return output.toByteArray();
        }
    }

    /** Applies percentage-based overrides to template-owned marker shapes before text replacement. */
    private static void applyTextLayouts(
            XSLFSlide slide,
            int slideNumber,
            List<PresentationContent.TextLayout> layouts,
            double pageWidth,
            double pageHeight) {
        if (layouts.isEmpty()) return;
        Map<String, PresentationContent.TextLayout> byId =
                layouts.stream()
                        .collect(
                                java.util.stream.Collectors.toMap(
                                        PresentationContent.TextLayout::id, Function.identity()));
        int layoutIndex = 0;
        for (XSLFShape shape : allShapes(slide.getShapes())) {
            if (!(shape instanceof XSLFTextShape textShape)
                    || !TOKEN.matcher(textShape.getText()).find()) continue;
            var layout = byId.get(textLayoutId(slideNumber, ++layoutIndex));
            if (layout == null) continue;
            textShape.setAnchor(
                    new Rectangle2D.Double(
                            pageWidth * layout.x() / 100,
                            pageHeight * layout.y() / 100,
                            pageWidth * layout.width() / 100,
                            pageHeight * layout.height() / 100));
        }
    }

    /** Creates a new PPTX text box for a user-created editor block. */
    private static void addTextBlock(
            XSLFSlide slide,
            PresentationContent.TextBlock block,
            double pageWidth,
            double pageHeight,
            String templateId) {
        var box = slide.createTextBox();
        box.setAnchor(
                new Rectangle2D.Double(
                        pageWidth * block.x() / 100,
                        pageHeight * block.y() / 100,
                        pageWidth * block.width() / 100,
                        pageHeight * block.height() / 100));
        box.setLeftInset(0);
        box.setRightInset(0);
        box.setTopInset(0);
        box.setBottomInset(0);
        box.setWordWrap(true);
        box.setVerticalAlignment(VerticalAlignment.TOP);
        XSLFTextRun run = box.setText(block.text());
        run.setFontSize(block.fontSize() * pageWidth / 960.0);
        run.setBold(block.weight() >= 700);
        run.setFontFamily("Arial");
        run.setFontColor(textColor(templateId, block.color()));
        XSLFTextParagraph paragraph = run.getParagraph();
        paragraph.setTextAlign(
                switch (block.align()) {
                    case "center" -> TextAlign.CENTER;
                    case "right" -> TextAlign.RIGHT;
                    default -> TextAlign.LEFT;
                });
        paragraph.setSpaceBefore(0d);
        paragraph.setSpaceAfter(0d);
    }

    /** Resolves a normalized asset and creates a positioned PNG picture shape in the slide. */
    private static void addImageBlock(
            XMLSlideShow show,
            XSLFSlide slide,
            PresentationContent.ImageBlock image,
            double pageWidth,
            double pageHeight,
            Function<String, byte[]> resolver) {
        byte[] bytes = resolver.apply(image.assetId());
        var pictureData = show.addPicture(bytes, PictureData.PictureType.PNG);
        var picture = slide.createPicture(pictureData);
        picture.setAnchor(
                new Rectangle2D.Double(
                        pageWidth * image.x() / 100,
                        pageHeight * image.y() / 100,
                        pageWidth * image.width() / 100,
                        pageHeight * image.height() / 100));
    }

    private static Color textColor(String templateId, String color) {
        boolean dark = "monolith".equals(templateId);
        return switch (color) {
            case "brand" -> dark ? new Color(0xD7F36A) : new Color(0x335CC5);
            case "muted" -> dark ? new Color(0xB4C0D3) : new Color(0x5B6675);
            default -> dark ? new Color(0xF5F7FB) : new Color(0x142033);
        };
    }

    /**
     * Replaces markers after concatenating paragraph runs, then retains formatting from the first
     * run. Concatenation is necessary because PowerPoint may split one marker across XML runs.
     */
    private static void replaceParagraph(XSLFTextParagraph paragraph, Map<String, String> values) {
        List<XSLFTextRun> runs = paragraph.getTextRuns();
        if (runs.isEmpty()) return;
        String text = runs.stream().map(XSLFTextRun::getRawText).reduce("", String::concat);
        Matcher matcher = TOKEN.matcher(text);
        StringBuffer replaced = new StringBuffer();
        while (matcher.find()) {
            String value = values.get(matcher.group(1));
            if (value == null)
                throw new IllegalArgumentException(UNKNOWN_FIELD_PREFIX + matcher.group(1));
            matcher.appendReplacement(replaced, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(replaced);
        if (replaced.toString().equals(text)) return;
        runs.getFirst().setText(replaced.toString());
        for (int i = 1; i < runs.size(); i++) runs.get(i).setText("");
    }}
