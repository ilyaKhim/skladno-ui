package ru.godeck.presentation.template;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFGroupShape;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.springframework.stereotype.Service;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import javax.imageio.ImageIO;

import java.awt.RenderingHints;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Renders the immutable template artwork behind editable browser text.
 *
 * <p>Only bundled template bytes are accepted. Each slide is rendered once per application process
 * and cached as PNG, so requests never launch an office process or rasterize private user content.
 * Marker text is cleared before drawing to prevent duplicate text underneath the editable fields.
 */
@Service
public class TemplateSlideBackgrounds {
    private static final int WIDTH = 960;
    private static final int HEIGHT = 540;
    private final PresentationTemplateService templates;
    private final Map<String, byte[]> cache = new ConcurrentHashMap<>();

    public TemplateSlideBackgrounds(PresentationTemplateService templates) {
        this.templates = templates;
    }

    /** Returns a cached, defensive PNG copy for a validated one-based source slide. */
    public byte[] png(String templateId, int sourceSlide) {
        if (sourceSlide < 1 || sourceSlide > templates.slideManifest(templateId).size())
            throw new GenerationException(GenerationError.TEMPLATE_NOT_FOUND);
        return cache.computeIfAbsent(templateId + ":" + sourceSlide,
                ignored -> render(templateId, sourceSlide)).clone();
    }

    private byte[] render(String templateId, int sourceSlide) {
        try (var show = new XMLSlideShow(new ByteArrayInputStream(templates.source(templateId)))) {
            var slide = show.getSlides().get(sourceSlide - 1);
            clearMarkers(slide.getShapes());
            var size = PresentationTemplateService.pageBounds(show);
            var image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
            var graphics = image.createGraphics();
            try {
                graphics.setColor(Color.WHITE);
                graphics.fillRect(0, 0, WIDTH, HEIGHT);
                graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                        RenderingHints.VALUE_ANTIALIAS_ON);
                graphics.setRenderingHint(RenderingHints.KEY_RENDERING,
                        RenderingHints.VALUE_RENDER_QUALITY);
                graphics.scale(WIDTH / size.getWidth(), HEIGHT / size.getHeight());
                slide.draw(graphics);
            } finally {
                graphics.dispose();
            }
            var output = new ByteArrayOutputStream();
            ImageIO.write(image, "png", output);
            return output.toByteArray();
        } catch (Exception failure) {
            throw new IllegalStateException("Could not render template slide background", failure);
        }
    }

    private static void clearMarkers(List<XSLFShape> shapes) {
        for (var shape : shapes) {
            if (shape instanceof XSLFTextShape text && text.getText().contains("{{"))
                text.clearText();
            if (shape instanceof XSLFGroupShape group) clearMarkers(group.getShapes());
        }
    }
}
