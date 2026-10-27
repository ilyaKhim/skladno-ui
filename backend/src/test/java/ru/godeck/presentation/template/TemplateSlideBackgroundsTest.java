package ru.godeck.presentation.template;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import ru.godeck.presentation.exception.GenerationException;

import javax.imageio.ImageIO;

import java.io.ByteArrayInputStream;

class TemplateSlideBackgroundsTest {
    private final PresentationTemplateService templates = new PresentationTemplateService(
            new tools.jackson.databind.ObjectMapper(), new PresentationContentValidator());
    private final TemplateSlideBackgrounds backgrounds = new TemplateSlideBackgrounds(templates);

    TemplateSlideBackgroundsTest() throws Exception {}

    @ParameterizedTest
    @ValueSource(strings = {"aurora", "atlas", "monolith", "nord", "opal"})
    void rendersRealTemplateArtworkAndReturnsDefensiveCachedBytes(String template) throws Exception {
        for (int slide = 1; slide <= templates.slideManifest(template).size(); slide++) {
            byte[] png = backgrounds.png(template, slide);
            var image = ImageIO.read(new ByteArrayInputStream(png));
            assertThat(image).isNotNull();
            assertThat(image.getWidth()).isEqualTo(960);
            assertThat(image.getHeight()).isEqualTo(540);
            assertThat(png.length).isGreaterThan(1_000);
            assertThat(backgrounds.png(template, slide)).isEqualTo(png).isNotSameAs(png);
            png[0] = 0;
            assertThat(backgrounds.png(template, slide)[0]).isEqualTo((byte) 0x89);
        }
    }

    @Test
    void opalListKeepsItsColoredBackgroundAndDivider() throws Exception {
        var image = ImageIO.read(new ByteArrayInputStream(backgrounds.png("opal", 9)));
        assertThat(image.getRGB(50, 300) & 0xffffff).isNotEqualTo(0xffffff);
        assertThat(image.getRGB(454, 300)).isNotEqualTo(image.getRGB(450, 300));
    }

    @Test
    void rejectsUnknownTemplatesAndOutOfRangeSlidesBeforeRendering() {
        assertThatThrownBy(() -> backgrounds.png("unknown", 1)).isInstanceOf(GenerationException.class);
        assertThatThrownBy(() -> backgrounds.png("opal", 0)).isInstanceOf(GenerationException.class);
        assertThatThrownBy(() -> backgrounds.png("opal", 14)).isInstanceOf(GenerationException.class);
    }
}
