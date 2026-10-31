package ru.godeck.presentation.chat;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.ai.AiCallContext;
import ru.godeck.presentation.ai.AiOperation;
import ru.godeck.presentation.chat.dto.ChatReply;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.generation.PresentationContentGenerator;
import ru.godeck.presentation.generation.PresentationPrompts;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.PresentationTransactions;
import ru.godeck.presentation.storage.PresentationFiles;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Rebuilds a published presentation through the original whole-deck AI chat.
 * This is distinct from block text proposals, which never publish a version on the server.
 */
@Service
public class PresentationChatService {
    private static final Logger log = LoggerFactory.getLogger(PresentationChatService.class);
    private static final String EDIT_RELEASE_FAILURE_LOG = "Could not release edit {}";
    private final PresentationTransactions transactions;
    private final PresentationTemplateService templates;
    private final PresentationContentGenerator generator;
    private final PresentationContentCodec codec;
    private final PresentationFiles files;

    public PresentationChatService(
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

    /**
     * Applies a natural-language edit as a new immutable presentation version.
     *
     * <p>The edit lease captures the current version and prevents concurrent commits. AI receives
     * the published semantic snapshot, while editor-created text and image blocks are copied onto
     * the newly generated field/slide plan. Rendering happens outside a transaction. Publication
     * succeeds only if the lease and base version still match; otherwise the orphan file is
     * removed.
     */
    public ChatReply edit(UUID userId, UUID id, String message, String model) {
        if (!generator.enabled()) throw new GenerationException(GenerationError.CHAT_DISABLED);
        if (message == null
                || message.isBlank()
                || message.length() > PresentationPolicy.MAX_EDIT_MESSAGE_LENGTH)
            throw new GenerationException(GenerationError.INVALID_MESSAGE);
        var edit = transactions.beginEdit(userId, id, model);
        Path output = null;
        try {
            String topic = PresentationPrompts.edit(edit.topic(), edit.contentJson(), message);
            PresentationContent previous =
                    templates.normalize(edit.templateId(), codec.decode(edit.contentJson()));
            PresentationContent generated =
                    generator.generate(
                            new AiCallContext(id, AiOperation.CHAT),
                            templates.withDescription(edit.templateId(), topic),
                            templates.fields(edit.templateId()),
                            templates.slideManifest(edit.templateId()),
                            edit.model());
            PresentationContent content =
                    templates.normalize(
                            edit.templateId(), preserveEditorBlocks(previous, generated));
            output = files.write(id, edit.baseVersion() + 1, edit.templateId(), content);
            PresentationView view =
                    transactions.completeEdit(
                            edit,
                            message,
                            codec.encode(content),
                            output.toString(),
                            content.slideCount());
            return new ChatReply(
                    view.version(), BackendMessages.text("presentation.chat.reply"), view);
        } catch (Exception error) {
            files.discard(output);
            try {
                transactions.releaseEdit(edit);
            } catch (Exception cleanup) {
                log.warn(EDIT_RELEASE_FAILURE_LOG, edit.token());
            }
            if (error instanceof GenerationException known) throw known;
            throw new GenerationException(GenerationError.EDIT_FAILED);
        }
    }

    /**
     * Keeps user-created editor shapes when AI rewrites template fields and inclusion decisions.
     * Generated semantic choices win, while per-slide freeform content remains user-owned.
     */
    private static PresentationContent preserveEditorBlocks(
            PresentationContent previous, PresentationContent generated) {
        Map<Integer, PresentationContent.Slide> bySlide = new LinkedHashMap<>();
        for (var slide : previous.slides()) bySlide.put(slide.slide(), slide);
        return new PresentationContent(
                generated.fields(),
                generated.slides().stream()
                        .map(
                                slide ->
                                        new PresentationContent.Slide(
                                                slide.slide(),
                                                slide.include(),
                                                slide.reason(),
                                                slide.hiddenOrFalse(),
                                                bySlide.containsKey(slide.slide())
                                                        ? bySlide.get(slide.slide())
                                                                .textBlocksOrEmpty()
                                                        : List.of(),
                                                bySlide.containsKey(slide.slide())
                                                        ? bySlide.get(slide.slide())
                                                                .imageBlocksOrEmpty()
                                                        : List.of(),
                                                bySlide.containsKey(slide.slide())
                                                        ? bySlide.get(slide.slide()).textLayoutsOrEmpty()
                                                        : List.of(),
                                                slide.dataBlocks() == null
                                                        ? bySlide.get(slide.slide()).dataBlocksOrEmpty()
                                                        : slide.dataBlocksOrEmpty()))
                        .toList());
    }

}
