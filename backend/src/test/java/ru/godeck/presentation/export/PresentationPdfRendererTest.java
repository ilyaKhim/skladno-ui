package ru.godeck.presentation.export;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.sl.usermodel.ShapeType;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import ru.godeck.presentation.exception.GenerationException;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.geom.Rectangle2D;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.*;

class PresentationPdfRendererTest {
    @TempDir Path directory;
    private final PresentationPdfRenderer renderer = new PresentationPdfRenderer(new PdfExportSettings(72, 1));

    @Test
    void preservesPageDimensionsOrderAndImagesWithoutModifyingThePublishedFile() throws Exception {
        Path pptx = slides(false);
        byte[] original = Files.readAllBytes(pptx);
        try (var pdf = Loader.loadPDF(renderer.render(pptx, false))) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(2);
            assertThat(pdf.getPage(0).getMediaBox().getWidth()).isEqualTo(320);
            assertThat(pdf.getPage(0).getMediaBox().getHeight()).isEqualTo(180);
            var raster = new PDFRenderer(pdf);
            assertThat(raster.renderImage(0).getRGB(20, 20) & 0xffffff).isEqualTo(0xff0000);
            assertThat(raster.renderImage(1).getRGB(20, 20) & 0xffffff).isEqualTo(0x0000ff);
            assertThat(new PDFTextStripper().getText(pdf)).isBlank();
        }
        try (var pdf = Loader.loadPDF(renderer.render(pptx, true))) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(3);
            assertThat(new PDFRenderer(pdf).renderImage(1).getRGB(20, 20) & 0xffffff).isEqualTo(0x00ff00);
        }
        assertThat(Files.readAllBytes(pptx)).isEqualTo(original);
    }

    @Test
    void allHiddenSlidesRequireExplicitInclusion() throws Exception {
        Path pptx = slides(true);
        assertThatThrownBy(() -> renderer.render(pptx, false)).isInstanceOfSatisfying(GenerationException.class,
                error -> assertThat(error.code()).isEqualTo("pdf_empty"));
        try (var pdf = Loader.loadPDF(renderer.render(pptx, true))) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(3);
        }
    }

    @Test
    void renderingFailureReleasesTheSlotAndDoesNotExposeInternalPaths() throws Exception {
        assertThatThrownBy(() -> renderer.render(directory.resolve("missing.pptx"), false))
                .isInstanceOfSatisfying(GenerationException.class, error -> {
                    assertThat(error.code()).isEqualTo("pdf_failed");
                    assertThat(error.getMessage()).doesNotContain(directory.toString());
                });
        try (var pdf = Loader.loadPDF(renderer.render(slides(false), false))) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(2);
        }
    }

    private Path slides(boolean allHidden) throws Exception {
        Path file = directory.resolve("published.pptx");
        try (var show = new XMLSlideShow()) {
            show.setPageSize(new Dimension(320, 180));
            Color[] colors = { Color.RED, Color.GREEN, Color.BLUE };
            for (int index = 0; index < colors.length; index++) {
                var slide = show.createSlide();
                slide.setHidden(allHidden || index == 1);
                var shape = slide.createAutoShape();
                shape.setShapeType(ShapeType.RECT);
                shape.setAnchor(new Rectangle2D.Double(0, 0, 320, 180));
                shape.setFillColor(colors[index]);
                shape.setLineColor(colors[index]);
            }
            try (var output = Files.newOutputStream(file)) { show.write(output); }
        }
        return file;
    }
}
