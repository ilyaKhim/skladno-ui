package ru.godeck.presentation;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

class PresentationTemplateServiceTest {
    @Test
    void inspectsAndFillsEveryPlaceholderInBundledTemplate() throws Exception {
        var service = new PresentationTemplateService();
        assertTrue(service.fields().containsKey("TITLE"));
        assertTrue(service.fields().get("TITLE") > 12, "POI anchors must be measured in points");
        assertTrue(service.fields().values().stream().anyMatch(limit -> limit > 100));
        Map<String, String> values = new LinkedHashMap<>();
        service.fields().keySet().forEach(field -> values.put(field, "Demo " + field));
        int count = (Integer) service.catalog().get("available_slides");
        List<Map<String, Object>> slides = new ArrayList<>();
        for (int number = 1; number <= count; number++) {
            slides.add(Map.of("slide", number, "include", true, "reason", "Test slide"));
        }

        byte[] rendered =
                service.render(
                        new PresentationContent(
                                values,
                                slides.stream()
                                        .map(
                                                slide ->
                                                        new PresentationContent.Slide(
                                                                (Integer) slide.get("slide"),
                                                                (Boolean) slide.get("include"),
                                                                (String) slide.get("reason")))
                                        .toList()));
        try (XMLSlideShow show = new XMLSlideShow(new ByteArrayInputStream(rendered))) {
            assertTrue(show.getSlides().size() == count);
            for (var slide : show.getSlides()) {
                for (XSLFShape shape : slide.getShapes()) {
                    if (shape instanceof XSLFTextShape text)
                        assertFalse(text.getText().contains("{{"));
                }
            }
        }
    }
}
