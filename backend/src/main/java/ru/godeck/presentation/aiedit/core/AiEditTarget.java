package ru.godeck.presentation.aiedit.core;

/**
 * Editor block addressed by an AI edit. New target types (for example a range inside a block or the
 * whole deck) are added as new permitted records.
 */
public sealed interface AiEditTarget {
    /** Source slide number from the editor id {@code slide-<number>}. */
    int slideNumber();

    TargetKind kind();

    /** Editor slide id, {@code slide-<number>}. */
    default String slideId() {
        return SLIDE_ID_PREFIX + slideNumber();
    }

    /** Compact journal reference: {@code slide-3/STATEMENT} or {@code slide-3/<block_id>}. */
    String reference();

    String SLIDE_ID_PREFIX = "slide-";

    /** A template field ({@code {{FIELD}}} marker) present on the slide. */
    record TemplateFieldTarget(int slideNumber, String fieldKey) implements AiEditTarget {
        @Override
        public TargetKind kind() {
            return TargetKind.TEMPLATE_FIELD;
        }

        @Override
        public String reference() {
            return slideId() + "/" + fieldKey;
        }
    }

    /** A user-created text block stored in the saved editor document. */
    record CustomBlockTarget(int slideNumber, String blockId) implements AiEditTarget {
        @Override
        public TargetKind kind() {
            return TargetKind.CUSTOM_BLOCK;
        }

        @Override
        public String reference() {
            return slideId() + "/" + blockId;
        }
    }
}
