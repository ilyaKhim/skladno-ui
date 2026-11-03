package ru.godeck.presentation;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.TestConfiguration;

import ru.godeck.presentation.aiedit.config.AiEditSettings;
import ru.godeck.presentation.aiedit.config.TextEditPromptSettings;
import ru.godeck.presentation.generation.GenerationSettings;
import ru.godeck.presentation.generation.PresentationRequestFactory;
import ru.godeck.presentation.material.MaterialJobSettings;
import ru.godeck.presentation.storage.ImageSettings;

import java.time.Duration;
import java.util.List;
import java.util.Map;

class RuntimeSettingsTest {
    private final ApplicationContextRunner context =
            new ApplicationContextRunner().withUserConfiguration(SettingsConfiguration.class);

    @Test
    void defaultsPreserveTheExistingOperationalBehaviour() {
        context.run(app -> {
            assertThat(app).hasNotFailed();
            var generation = app.getBean(GenerationSettings.class);
            assertThat(generation.maxGenerationsPerWindow()).isEqualTo(10);
            assertThat(generation.maxActivePresentations()).isEqualTo(3);
            assertThat(generation.maxEditsPerWindow()).isEqualTo(30);
            assertThat(generation.quotaWindow()).isEqualTo(Duration.ofDays(1));
            assertThat(generation.connectTimeout()).isEqualTo(Duration.ofSeconds(10));
            assertThat(generation.readTimeout()).isEqualTo(Duration.ofMinutes(2));
            assertThat(generation.jobTimeout()).isEqualTo(Duration.ofMinutes(5));
            assertThat(generation.editLeaseTimeout()).isEqualTo(Duration.ofMinutes(5));
            assertThat(generation.sourceRetention()).isEqualTo(Duration.ofDays(30));
            assertThat(generation.maxOutputTokens()).isEqualTo(12000);
            var edits = app.getBean(AiEditSettings.class);
            assertThat(edits.maxEditsPerWindow()).isEqualTo(100);
            assertThat(edits.quotaWindow()).isEqualTo(Duration.ofDays(1));
            assertThat(edits.connectTimeout()).isEqualTo(Duration.ofSeconds(10));
            assertThat(edits.readTimeout()).isEqualTo(Duration.ofSeconds(30));
            assertThat(edits.staleAfter()).isEqualTo(Duration.ofMinutes(2));
            assertThat(edits.retention()).isEqualTo(Duration.ofDays(90));
            assertThat(edits.retentionBatchSize()).isEqualTo(1000);
            var jobs = app.getBean(MaterialJobSettings.class);
            assertThat(jobs.maxActive()).isEqualTo(20);
            assertThat(jobs.maxActivePerUser()).isEqualTo(2);
            assertThat(jobs.queueTimeout()).isEqualTo(Duration.ofSeconds(60));
            assertThat(jobs.resultTtl()).isEqualTo(Duration.ofHours(1));
            var images = app.getBean(ImageSettings.class);
            assertThat(images.maxUploadSize().toBytes()).isEqualTo(10 * 1024 * 1024);
            assertThat(images.maxStorageSize().toBytes()).isEqualTo(100 * 1024 * 1024);
            assertThat(images.maxPerPresentation()).isEqualTo(100);
            assertThat(images.maxDimension()).isEqualTo(8192);
            assertThat(images.maxPixels()).isEqualTo(32000000);
            var prompt = app.getBean(TextEditPromptSettings.class);
            assertThat(prompt.maxOutputTokens()).isEqualTo(4096);
            assertThat(prompt.baseOutputTokens()).isEqualTo(1024);
            assertThat(prompt.shortenRatio()).isEqualTo(0.7);
            assertThat(prompt.titleMaxChars()).isEqualTo(80);
            assertThat(prompt.roleMaxChars()).isEqualTo(160);
            assertThat(prompt.reasoningEfforts()).containsExactlyInAnyOrderEntriesOf(
                    Map.of("gpt-5.4", "low", "gpt-5.4-mini", "low"));
        });
    }

    @Test
    void bindsOverridesAsNumbersAndDurations() {
        context.withPropertyValues(
                "godeck.generation.max-generations-per-window=4",
                "godeck.generation.edit-lease-timeout=8m",
                "godeck.ai-edit.max-edits-per-window=7",
                "godeck.ai-edit.retention=10d",
                "godeck.ai-edit.retention-batch-size=2",
                "godeck.materials.jobs.max-active=8",
                "godeck.materials.jobs.result-ttl=2h").run(app -> {
            assertThat(app).hasNotFailed();
            assertThat(app.getBean(GenerationSettings.class).maxGenerationsPerWindow()).isEqualTo(4);
            assertThat(app.getBean(GenerationSettings.class).editLeaseTimeout()).isEqualTo(Duration.ofMinutes(8));
            assertThat(app.getBean(AiEditSettings.class).maxEditsPerWindow()).isEqualTo(7);
            assertThat(app.getBean(AiEditSettings.class).retention()).isEqualTo(Duration.ofDays(10));
            assertThat(app.getBean(AiEditSettings.class).retentionBatchSize()).isEqualTo(2);
            assertThat(app.getBean(MaterialJobSettings.class).maxActive()).isEqualTo(8);
            assertThat(app.getBean(MaterialJobSettings.class).resultTtl()).isEqualTo(Duration.ofHours(2));
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "godeck.generation.max-generations-per-window=0",
        "godeck.generation.max-active-presentations=-1",
        "godeck.generation.max-edits-per-window=0",
        "godeck.generation.quota-window=0s",
        "godeck.generation.job-timeout=1m",
        "godeck.generation.edit-lease-timeout=2m",
        "godeck.generation.source-retention=0s",
        "godeck.generation.max-output-tokens=0",
        "godeck.ai-edit.max-edits-per-window=0",
        "godeck.ai-edit.quota-window=-1h",
        "godeck.ai-edit.connect-timeout=0s",
        "godeck.ai-edit.read-timeout=nonsense",
        "godeck.ai-edit.stale-after=40s",
        "godeck.ai-edit.retention=0d",
        "godeck.ai-edit.retention-batch-size=0",
        "godeck.materials.jobs.max-active=0",
        "godeck.materials.jobs.max-active-per-user=-1",
        "godeck.materials.jobs.queue-timeout=0s",
        "godeck.materials.jobs.result-ttl=30s",
        "godeck.images.max-upload-size=0B",
        "godeck.images.max-upload-size=11MB",
        "godeck.images.max-storage-size=0B",
        "godeck.images.max-per-presentation=0",
        "godeck.images.max-dimension=8193",
        "godeck.images.max-pixels=32000001",
        "godeck.ai-edit.prompt.max-output-tokens=0",
        "godeck.ai-edit.prompt.base-output-tokens=4096",
        "godeck.ai-edit.prompt.shorten-ratio=1",
        "godeck.ai-edit.prompt.shorten-ratio=0",
        "godeck.ai-edit.prompt.title-max-chars=0",
        "godeck.ai-edit.prompt.role-max-chars=0"
    })
    void invalidSettingsFailAtStartup(String property) {
        context.withPropertyValues(property).run(app -> assertThat(app).hasFailed());
    }

    @Test
    void configuredGenerationOutputBudgetReachesTheActualProviderPayload() {
        context.withPropertyValues("godeck.generation.max-output-tokens=4000")
                .run(app -> {
                    var factory = new PresentationRequestFactory(app.getBean(GenerationSettings.class));
                    assertThat(factory.create("topic", Map.of("TITLE", 80),
                            List.of(Map.of("slide", 1)), "model")).containsEntry("max_output_tokens", 4000);
                });
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableConfigurationProperties({GenerationSettings.class, AiEditSettings.class, MaterialJobSettings.class,
            ImageSettings.class, TextEditPromptSettings.class})
    static class SettingsConfiguration {}
}
