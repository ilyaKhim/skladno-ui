package ru.godeck.presentation.template;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.junit.jupiter.api.Test;
import ru.godeck.presentation.model.PresentationContent;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class TemplateSlideNumbersTest {
    @Test
    void changesOnlyTheNamedFolioAndRetainsItsSourceFormatting() throws Exception {
        var templates = new PresentationTemplateService(new ObjectMapper(), new PresentationContentValidator());
        try (var show = new XMLSlideShow(new ByteArrayInputStream(templates.source("opal")))) {
            var slide = show.getSlides().get(8);
            var folio = TemplateSlideNumbers.find(slide).orElseThrow();
            var run = folio.getTextParagraphs().getFirst().getTextRuns().getFirst();
            var family = run.getFontFamily();
            var size = run.getFontSize();
            var anchor = folio.getAnchor();
            var metric = slide.createTextBox();
            metric.setText("2026");
            TemplateSlideNumbers.apply(slide, 1);
            assertThat(folio.getText()).isEqualTo("01");
            assertThat(run.getFontFamily()).isEqualTo(family);
            assertThat(run.getFontSize()).isEqualTo(size);
            assertThat(folio.getAnchor()).isEqualTo(anchor);
            assertThat(metric.getText()).isEqualTo("2026");
            assertThat(TemplateSlideNumbers.find(show.getSlides().getFirst())).isEmpty();
        }
    }

    @Test
    void projectedFoliosAndExportFollowIncludedSlideOrderRatherThanSourceNumbers() throws Exception {
        var templates = new PresentationTemplateService(new ObjectMapper(), new PresentationContentValidator());
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields("opal").keySet().forEach(key -> fields.put(key, "Тест"));
        List<PresentationContent.Slide> slides = new ArrayList<>();
        for (int source : List.of(13, 9, 1)) slides.add(new PresentationContent.Slide(source, true, "Reordered"));
        for (int source = 2; source <= 12; source++)
            if (source != 9) slides.add(new PresentationContent.Slide(source, false, "Not included"));
        var content = new PresentationContent(fields, slides);
        var deck = templates.editorDeck("opal", UUID.randomUUID(), "Test", 1, 0, Map.of(), content);
        assertThat(deck.slides()).extracting(slide -> slide.sourceSlideNumber()).containsExactly(13, 9, 1);
        assertThat(deck.slides().getFirst().slideNumber().minimumDigits()).isEqualTo(2);
        assertThat(deck.slides().getFirst().slideNumber().y()).isGreaterThan(90);
        assertThat(deck.slides().getLast().slideNumber()).isNull();
        try (var show = new XMLSlideShow(new ByteArrayInputStream(templates.render("opal", content)))) {
            assertThat(TemplateSlideNumbers.find(show.getSlides().getFirst()).orElseThrow().getText()).isEqualTo("01");
            assertThat(TemplateSlideNumbers.find(show.getSlides().get(1)).orElseThrow().getText()).isEqualTo("02");
            assertThat(TemplateSlideNumbers.find(show.getSlides().getLast())).isEmpty();
        }
    }
}
