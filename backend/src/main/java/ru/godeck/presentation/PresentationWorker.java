package ru.godeck.presentation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
class PresentationWorker {
    private static final Logger log = LoggerFactory.getLogger(PresentationWorker.class);
    private final PresentationTransactions transactions;
    private final PresentationTemplateService templates;
    private final PresentationContentGenerator generator;
    private final PresentationContentCodec codec;
    private final PresentationFiles files;
    private final AtomicBoolean working = new AtomicBoolean();

    PresentationWorker(
            PresentationTransactions transactions,
            PresentationTemplateService templates,
            PresentationContentGenerator generator,
            PresentationContentCodec codec,
            PresentationFiles files) {
        this.transactions = transactions;
        this.templates = templates;
        this.generator = generator;
        this.codec = codec;
        this.files = files;
    }

    @Scheduled(
            initialDelayString = "${godeck.generation.poll-ms:1500}",
            fixedDelayString = "${godeck.generation.poll-ms:1500}")
    void processOne() {
        if (!working.compareAndSet(false, true)) return;
        try {
            transactions.claim().ifPresent(this::process);
        } catch (Exception e) {
            log.error("Could not process presentation queue", e);
        } finally {
            working.set(false);
        }
    }

    private void process(PresentationTransactions.Job job) {
        Path output = null;
        try {
            PresentationContent content =
                    job.mode() == GenerationMode.MANUAL
                            ? codec.decode(job.contentJson())
                            : generator.generate(
                                    job.topic(),
                                    templates.fields(),
                                    templates.slideManifest(),
                                    job.model());
            content = templates.normalize(content);
            output = files.write(job.id(), 1, content);
            transactions.complete(
                    job, codec.encode(content), output.toString(), content.slideCount());
        } catch (Exception error) {
            files.discard(output);
            String code =
                    "openai_disabled".equals(error.getMessage())
                            ? "openai_disabled"
                            : "generation_failed";
            transactions.fail(job.id(), code);
            log.warn("Presentation {} failed: {}", job.id(), error.getClass().getSimpleName());
        }
    }
}
