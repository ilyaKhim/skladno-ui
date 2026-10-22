package ru.godeck.presentation.worker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.ai.PresentationContentGenerator;
import ru.godeck.presentation.ai.PresentationModelCatalog;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.AiOperation;
import ru.godeck.presentation.model.GenerationMode;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.service.PresentationTransactions;
import ru.godeck.presentation.storage.PresentationFiles;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class PresentationWorker {
    private static final String QUEUE_FAILURE_LOG = "Could not process presentation queue";
    private static final String GENERATION_FAILURE_LOG = "Presentation {} failed: {}";

    private static final int DEFAULT_POLL_MILLIS = 1500;
    private static final String POLL_INTERVAL =
            "${godeck.generation.poll-ms:" + DEFAULT_POLL_MILLIS + "}";
    private static final Logger log = LoggerFactory.getLogger(PresentationWorker.class);
    private final PresentationTransactions transactions;
    private final PresentationTemplateService templates;
    private final PresentationContentGenerator generator;
    private final PresentationContentCodec codec;
    private final PresentationFiles files;
    private final PresentationModelCatalog models;
    private final AtomicBoolean working = new AtomicBoolean();

    public PresentationWorker(
            PresentationTransactions transactions,
            PresentationTemplateService templates,
            PresentationContentGenerator generator,
            PresentationContentCodec codec,
            PresentationFiles files,
            PresentationModelCatalog models) {
        this.transactions = transactions;
        this.templates = templates;
        this.generator = generator;
        this.codec = codec;
        this.files = files;
        this.models = models;
    }

    @Scheduled(initialDelayString = POLL_INTERVAL, fixedDelayString = POLL_INTERVAL)
    public void processOne() {
        if (!working.compareAndSet(false, true)) return;
        try {
            transactions.claim().ifPresent(this::process);
        } catch (Exception e) {
            log.error(QUEUE_FAILURE_LOG, e);
        } finally {
            working.set(false);
        }
    }

    private void process(PresentationTransactions.Job claimed) {
        Path output = null;
        try {
            var job =
                    new PresentationTransactions.Job(
                            claimed.id(),
                            claimed.templateId(),
                            claimed.topic(),
                            claimed.mode(),
                            claimed.mode() == GenerationMode.MANUAL
                                    ? claimed.model()
                                    : models.resolve(claimed.model()),
                            claimed.contentJson());
            PresentationContent content =
                    job.mode() == GenerationMode.MANUAL
                            ? codec.decode(job.contentJson())
                            : generator.generate(
                                    new AiCallContext(job.id(), AiOperation.GENERATION),
                                    templates.withDescription(job.templateId(), job.topic()),
                                    templates.fields(job.templateId()),
                                    templates.slideManifest(job.templateId()),
                                    job.model());
            content = templates.normalize(job.templateId(), content);
            output =
                    files.write(
                            job.id(),
                            PresentationPolicy.INITIAL_VERSION,
                            job.templateId(),
                            content);
            transactions.complete(
                    job, codec.encode(content), output.toString(), content.slideCount());
        } catch (Exception error) {
            files.discard(output);
            String code =
                    error instanceof GenerationException known
                            ? known.code()
                            : GenerationError.OPENAI_DISABLED.code().equals(error.getMessage())
                                    ? GenerationError.OPENAI_DISABLED.code()
                                    : GenerationError.GENERATION_FAILED.code();
            transactions.fail(claimed.id(), code);
            log.warn(GENERATION_FAILURE_LOG, claimed.id(), error.getClass().getSimpleName());
        }
    }
}
