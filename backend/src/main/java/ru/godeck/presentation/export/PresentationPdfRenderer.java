package ru.godeck.presentation.export;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.template.TemplateSlideNumbers;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Semaphore;

/** Visual PDF copy of an already-authorized, immutable PPTX; never publishes or modifies a version. */
@Service
public class PresentationPdfRenderer {
    private static final Logger log = LoggerFactory.getLogger(PresentationPdfRenderer.class);
    private final PdfExportSettings settings;
    private final Semaphore slots;

    public PresentationPdfRenderer(PdfExportSettings settings) {
        this.settings = settings;
        slots = new Semaphore(settings.maxConcurrentExports());
    }

    public byte[] render(Path publishedPptx, boolean includeHidden) {
        if (!slots.tryAcquire()) throw new GenerationException(GenerationError.PDF_BUSY);
        try (var input = Files.newInputStream(publishedPptx);
                var show = new XMLSlideShow(input);
                var pdf = new PDDocument()) {
            var size = show.getCTPresentation().getSldSz();
            float width = (float) (size.getCx() / 12_700.0);
            float height = (float) (size.getCy() / 12_700.0);
            double scale = settings.dpi() / 72.0;
            int position = 0;
            for (var slide : show.getSlides()) {
                if (slide.isHidden() && !includeHidden) continue;
                TemplateSlideNumbers.apply(slide, ++position);
                var image = new BufferedImage((int) Math.ceil(width * scale),
                        (int) Math.ceil(height * scale), BufferedImage.TYPE_INT_RGB);
                var graphics = image.createGraphics();
                try {
                    graphics.setColor(Color.WHITE);
                    graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
                    graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                    graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                    graphics.scale(scale, scale);
                    slide.draw(graphics);
                } finally {
                    graphics.dispose();
                }
                var page = new PDPage(new PDRectangle(width, height));
                pdf.addPage(page);
                try (var stream = new PDPageContentStream(pdf, page)) {
                    stream.drawImage(LosslessFactory.createFromImage(pdf, image), 0, 0, width, height);
                } finally {
                    image.flush();
                }
            }
            if (pdf.getNumberOfPages() == 0) throw new GenerationException(GenerationError.PDF_EMPTY);
            var output = new ByteArrayOutputStream();
            pdf.save(output);
            return output.toByteArray();
        } catch (GenerationException known) {
            throw known;
        } catch (Exception failure) {
            log.warn("Could not render presentation PDF", failure);
            throw new GenerationException(GenerationError.PDF_FAILED);
        } finally {
            slots.release();
        }
    }
}
